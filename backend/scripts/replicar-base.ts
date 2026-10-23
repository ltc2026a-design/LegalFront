// Publicación — vuelca el contenido de la base local (la PostgreSQL embebida de
// la laptop) a la base del servidor, sin depender de `pg_dump`.
//
// Por que no pg_dump: el paquete `@embedded-postgres` de Windows solo trae
// initdb, pg_ctl y postgres; no trae utilidades de respaldo. Instalar el cliente
// completo de PostgreSQL en cada maquina que publica es un paso manual mas, y
// aqui lo que se mueve son 12 tablas con textos legales, no un clúster de 40 GB.
//
// Que hace, en orden:
//   1. Lee las tablas de `public` del origen y las ordena por dependencias
//      (claves foraneas) para insertar primero los padres.
//   2. Vacía esas MISMAS tablas en el destino (TRUNCATE ... CASCADE).
//   3. Copia fila por fila en lotes de 200 con INSERT parametrizado.
//
// ids: todos los modelos de este esquema usan cuid() (texto generado por la
// app), asi que no hay secuencias que reiniciar despues del vuelco.
//
// Uso (desde backend/, o npm run replicar desde la raiz):
//   npm run replicar -- --destino="postgresql://u:p@render-host:5432/dbr?sslmode=require"
//   npm run replicar -- --destino=... --confirmar=sobrescribir
//   npm run replicar -- --destino=... --solo=Codigo,Seccion,Articulo
//
// El TRUNCATE del destino es DESTRUCTIVO: si el destino ya tiene datos de gente
// conectada, se van. Por eso hay que pasarlo a conciencia con --confirmar.
import 'dotenv/config';
import { Client } from 'pg';

interface Opciones {
  origen: string;
  destino: string;
  confirmar: boolean;
  solo?: string[];
}

function parseaArgs(argv: string[]): Opciones {
  const get = (nombre: string): string | undefined => {
    const prefijo = `--${nombre}=`;
    const encontrado = argv.find((a) => a.startsWith(prefijo));
    return encontrado ? encontrado.slice(prefijo.length) : undefined;
  };
  const origen = get('origen') ?? process.env.DATABASE_URL;
  const destino = get('destino');
  if (!origen) throw new Error('Falta --origen= ni DATABASE_URL local.');
  if (!destino) {
    throw new Error(
      'Falta --destino="postgresql://usuario:contrasena@host:5432/base?sslmode=require"',
    );
  }
  const solo = get('solo')?.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    origen,
    destino,
    confirmar: get('confirmar') === 'sobrescribir',
    solo: solo && solo.length > 0 ? solo : undefined,
  };
}

/** Comillas dobles para identificadores: evita sorpresas con nombres reservados. */
function id(nombre: string): string {
  return `"${nombre.replaceAll('"', '""')}"`;
}

/** Nombre de la tabla fisica (Prisma usa @@map en minusculas). */
async function tablasPublicas(client: Client): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return rows.map((r) => r.tablename as string);
}

interface Foreign {
  tabla: string;
  ref: string;
}

async function foraneas(client: Client): Promise<Foreign[]> {
  const { rows } = await client.query(`
    SELECT c.conrelid::regclass::text AS tabla,
           confrelid::regclass::text  AS ref
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.connamespace = 'public'::regnamespace
  `);
  return rows as Foreign[];
}

/**
 * Orden topologico simple: una tabla va despues de todas las que referencia.
 * Un ciclo en el esquema (no es el caso) se reporta en vez de colgarse.
 */
export function ordenaPorDependencias(tablas: string[], fks: Foreign[]): string[] {
  const conjunto = new Set(tablas);
  const padres = new Map<string, Set<string>>();
  for (const t of tablas) padres.set(t, new Set());
  for (const { tabla, ref } of fks) {
    if (conjunto.has(tabla) && conjunto.has(ref) && tabla !== ref) {
      padres.get(tabla)!.add(ref);
    }
  }
  const salida: string[] = [];
  const marcado = new Map<string, 'visitando' | 'lista'>();
  const visita = (t: string, cadena: string[]): void => {
    const estado = marcado.get(t);
    if (estado === 'lista') return;
    if (estado === 'visitando') {
      throw new Error(`El esquema tiene un ciclo de claves foraneas: ${[...cadena, t].join(' -> ')}`);
    }
    marcado.set(t, 'visitando');
    for (const padre of padres.get(t) ?? []) visita(padre, [...cadena, t]);
    marcado.set(t, 'lista');
    salida.push(t);
  };
  for (const t of [...tablas].sort()) visita(t, []);
  return salida;
}

/**
 * Columnas que se copian. Se excluyen las COMPUTED (el `texto_ts` tsvector de la
 * busqueda full-text) y las IDENTITY: Postgres las recalcula en el destino y no
 * acepta que se les escriba.
 */
async function columnas(client: Client, tabla: string): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
        AND is_generated = 'NEVER' AND is_identity = 'NO'
      ORDER BY ordinal_position`,
    [tabla],
  );
  return rows.map((r) => r.column_name as string);
}

const LOTE = 200;

/** Inserta `filas` en lotes; devuelve cuantas se escribieron. */
async function insertaLotes(
  client: Client,
  tabla: string,
  cols: string[],
  filas: Record<string, unknown>[],
): Promise<number> {
  const listaCols = cols.map(id).join(', ');
  let escritos = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const valores: unknown[] = [];
    const grupos: string[] = [];
    for (const fila of lote) {
      const marcadores = cols.map((_, c) => `$${valores.length + c + 1}`);
      for (const c of cols) valores.push(fila[c]);
      grupos.push(`(${marcadores.join(', ')})`);
    }
    await client.query(
      `INSERT INTO ${id(tabla)} (${listaCols}) VALUES ${grupos.join(', ')}`,
      valores,
    );
    escritos += lote.length;
  }
  return escritos;
}

interface Par {
  columna: string;
  referida: string;
}

/**
 * Claves foraneas DENTRO de la misma tabla (el arbol del `seccion`: cada
 * subdivicion apunta a su padre). Ordenar las TABLAS no basta, hay que ordenar
 * las FILAS.
 */
async function foraneasInternas(client: Client, tabla: string): Promise<Par[]> {
  const { rows } = await client.query(
    `SELECT a.attname AS columna, br.attname AS referida, c.conname AS nombre,
            cardinality(c.conkey) AS n
       FROM pg_constraint c
       JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = ANY(c.conkey)
       JOIN pg_attribute br ON br.attrelid = c.confrelid AND br.attnum = ANY(c.confkey)
      WHERE c.contype = 'f' AND c.conrelid = c.confrelid
        AND c.connamespace = 'public'::regnamespace
        AND c.conrelid = $1::regclass`,
    [tabla],
  );
  const compuestas = rows.filter((r) => Number(r.n) > 1);
  if (compuestas.length > 0) {
    throw new Error(
      `${tabla} tiene claves foraneas autorreferentes compuestas (${compuestas.map((r) => r.nombre).join(', ')}); este vuelco solo sabe ordenar simples.`,
    );
  }
  return rows.map((r) => ({ columna: r.columna as string, referida: r.referida as string }));
}

/**
 * Inserta por niveles: primero las filas cuyo padre (si lo tienen) ya esta
 * escrito, luego sus hijas, y asi. Sin esto, el arbol de secciones revienta
 * contra la restriccion `seccion_seccion_padre_id_fkey` segun el orden fisico
 * que devuelva el SELECT.
 */
async function insertaPorNiveles(
  client: Client,
  tabla: string,
  cols: string[],
  filas: Record<string, unknown>[],
  pares: Par[],
): Promise<number> {
  const pendientes = [...filas];
  const clavesVistas = new Set<string>();
  let escritos = 0;
  while (pendientes.length > 0) {
    const listos: Record<string, unknown>[] = [];
    for (let i = pendientes.length - 1; i >= 0; i--) {
      const fila = pendientes[i];
      const insertable = pares.every(({ columna, referida }) => {
        const padre = fila[columna];
        return padre === null || padre === undefined || clavesVistas.has(String(padre));
      });
      if (insertable) {
        listos.push(fila);
        pendientes.splice(i, 1);
      }
    }
    if (listos.length === 0) {
      const culpable = pendientes[0];
      const detalle = pares.map((p) => `${p.columna}=${String(culpable[p.columna])}`).join(' ');
      throw new Error(
        `${tabla}: quedan ${pendientes.length} filas sin padre disponible (padre ausente o ciclo). Ejemplo: ${detalle}`,
      );
    }
    for (const fila of listos) {
      for (const { referida } of pares) {
        const clave = fila[referida];
        if (clave !== null && clave !== undefined) clavesVistas.add(String(clave));
      }
    }
    escritos += await insertaLotes(client, tabla, cols, listos);
  }
  return escritos;
}

async function main(): Promise<void> {
  const opciones = parseaArgs(process.argv.slice(2));
  const origen = new Client({ connectionString: opciones.origen, ssl: /sslmode=require/.test(opciones.origen) ? { rejectUnauthorized: false } : undefined });
  const destino = new Client({
    connectionString: opciones.destino,
    ssl: /sslmode=require/.test(opciones.destino) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await volcar(origen, destino, opciones);
  } finally {
    // Cerrar SIEMPRE: si un paso revienta a mitad, los dos sockets abiertos
    // mantienen vivo el bucle de eventos y el comando "parece colgado" cuando lo
    // que hubo fue un error que ademas se perdio si la salida va por un pipe.
    await origen.end().catch(() => {});
    await destino.end().catch(() => {});
  }
}

async function volcar(origen: Client, destino: Client, opciones: Opciones): Promise<void> {
  await origen.connect();
  await destino.connect();

  const delOrigen = await tablasPublicas(origen);
  const fks = await foraneas(origen);
  let orden = ordenaPorDependencias(delOrigen, fks);
  if (opciones.solo) {
    const queridas = new Set(opciones.solo);
    const desconocidas = [...queridas].filter((t) => !delOrigen.includes(t));
    if (desconocidas.length > 0) {
      throw new Error(`Tablas que no existen en el origen: ${desconocidas.join(', ')}`);
    }
    // Se respeta el orden de dependencias aunque se copie un subconjunto.
    orden = orden.filter((t) => queridas.has(t));
  }

  console.log(`[replicar] origen  : ${opciones.origen.replace(/:[^:@/]*@/, ':****@')}`);
  console.log(`[replicar] destino : ${opciones.destino.replace(/:[^:@/]*@/, ':****@')}`);
  console.log(`[replicar] tablas  : ${orden.join(', ')}`);

  if (!opciones.confirmar) {
    console.error(
      '\n[replicar] EL DESTINO SE VA A VACIAR (TRUNCATE de esas tablas). Si de verdad es el servidor nuevo, repite con --confirmar=sobrescribir.',
    );
    await origen.end();
    await destino.end();
    process.exitCode = 1;
    return;
  }

  // En el destino: vaciar en orden inverso y crear las tablas si alguien borro
  // la base (lo normal es que `prisma migrate deploy` ya las haya creado).
  const delDestino = new Set(await tablasPublicas(destino));
  const faltantes = orden.filter((t) => !delDestino.has(t));
  if (faltantes.length > 0) {
    throw new Error(
      `El destino no tiene estas tablas: ${faltantes.join(', ')}. Corre antes: npx prisma migrate deploy`,
    );
  }
  await destino.query(`TRUNCATE TABLE ${orden.map(id).reverse().join(', ')} RESTART IDENTITY CASCADE`);

  const resumen: { tabla: string; filas: number }[] = [];
  for (const tabla of orden) {
    const cols = await columnas(origen, tabla);
    const { rows } = await origen.query(`SELECT ${cols.map(id).join(', ')} FROM ${id(tabla)}`);
    const pares = await foraneasInternas(origen, tabla);
    const n =
      pares.length === 0
        ? await insertaLotes(destino, tabla, cols, rows)
        : await insertaPorNiveles(destino, tabla, cols, rows, pares);
    resumen.push({ tabla, filas: n });
    console.log(`[replicar] ${tabla.padEnd(26)} ${String(n).padStart(6)} filas${pares.length ? ' (arbol, por niveles)' : ''}`);
  }

  const total = resumen.reduce((a, r) => a + r.filas, 0);
  console.log(`\n[replicar] listo: ${total} filas en ${resumen.length} tablas.`);
  console.log('[replicar] verifica en el servidor: npm run db:check  (o GET /api/codigos)');

  await origen.end();
  await destino.end();
}

main().catch((e) => {
  console.error('[replicar] fallo:', e);
  process.exit(1);
});
