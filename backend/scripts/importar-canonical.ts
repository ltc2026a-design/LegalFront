// Importador de textos LEGALES COMPLETOS desde el AST canonico del proyecto
// mx-md (github.com/JoshuaPozos/leyes-mexicanas-markdown), que convierte los
// PDFs OFICIALES de la Camara de Diputados (diputados.gob.mx/LeyesBiblio).
//
// Uso:  npm run importar -- prisma/data/canonical/CPEUM.json constitucion-politica-eeuu-mexicanos
//
// Comportamiento:
// - Crea articulos nuevos y actualiza los existentes cuyo texto difiera.
// - Cada creacion/actualizacion se registra en historial_cambio_articulo con
//   origen "edicion_manual" y estado "aprobado" (igual que la carga del panel),
//   porque la decide el dueno del sistema. No requiere admin (aprobadoPorId null).
// - Idempotente: volver a correr la misma importacion no duplica nada.
// - Con --reescribir los cambios de texto se aplican en silencio (sin bandeja),
//   corrigiendo ademas el historial de la importacion anterior.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma.js';

interface Contenido {
  type: string;
  text?: string;
  ordinal?: string;
  title?: string | null;
  headers?: string[];
  rows?: string[][];
  incisos?: Contenido[];
  numerals?: Contenido[];
  fracciones?: Contenido[];
}

interface Nodo {
  type: 'libro' | 'titulo' | 'capitulo' | 'seccion' | 'articulo' | 'transitorios' | 'transitorio_articulo';
  id: string;
  heading?: string | null;
  descriptor?: string | null;
  ordinal?: string | null;
  content?: Contenido[];
  children?: Nodo[];
}

interface LeyJson {
  abbreviation: string;
  name: string;
  source: { pdf_url?: string; last_reform?: string; captured_at?: string; dof_publication?: string };
  structure: Nodo[];
}

interface ArticuloImport {
  numero: string;
  texto: string;
  ruta: { tipo: 'libro' | 'titulo' | 'capitulo' | 'seccion'; numero: string; nombre: string }[];
  orden: number;
}

function normalizarNumero(ord: string | null | undefined, heading?: string | null): string {
  let n = (ord ?? '').trim();
  if (!n && heading) n = heading.replace(/^art[ií]culo\s+/i, '').trim();
  n = n.replace(/^(\d+)[o°]\s*/, '$1 ');
  n = n.replace(/\b(bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies)\b/gi, (m) => m.toUpperCase());
  return n.replace(/\s+/g, ' ').trim();
}

function renderContenido(items: Contenido[] | undefined): string {
  if (!items) return '';
  const lineas: string[] = [];
  const push = (s: string) => {
    // El AST del espejo arrastra artefactos de la extraccion del PDF oficial
    // (parrafos que empiezan con ". "); se limpian al normalizar.
    const t = s.replace(/\s+/g, ' ').trim().replace(/^\.+\s*/, '');
    if (t) lineas.push(t);
  };
  const renderFraccion = (f: Contenido, prefijo: string) => {
    const ord = f.ordinal ?? '';
    if (!ord) push(`${prefijo}${f.text ?? ''}`.trim());
    else push(`${prefijo}${ord}${/[.)]$/.test(ord) ? '' : '.'} ${f.text ?? ''}`.trim());
    for (const i of f.incisos ?? []) {
      const io = i.ordinal ?? '';
      push(io ? `   ${io}${/[.)]$/.test(io) ? '' : ')'} ${i.text ?? ''}`.trim() : `   ${i.text ?? ''}`.trim());
      for (const num of i.numerals ?? []) {
        const no = num.ordinal ?? '';
        push(no ? `      ${no}) ${num.text ?? ''}`.trim() : `      ${num.text ?? ''}`.trim());
      }
    }
  };
  for (const c of items) {
    if (c.type === 'paragraph' || c.type === 'text_block') push(c.text ?? '');
    else if (c.type === 'fraccion') renderFraccion(c, '');
    else if (c.type === 'apartado') {
      const ord = c.ordinal ?? '';
      push(ord ? `${ord}${/[.)]$/.test(ord) ? '' : '.'} ${c.text ?? ''}`.trim() : (c.text ?? ''));
      for (const f of c.fracciones ?? []) renderFraccion(f, '   ');
    } else if (c.type === 'inciso') renderFraccion(c, '');
    else if (c.type === 'table') {
      if (c.title) push(c.title);
      if (c.headers?.length) push(c.headers.join(' | '));
      for (const r of c.rows ?? []) push((r ?? []).join(' | '));
    }
    // reform_note: meta-datos de reforma, no forma parte del texto vigente.
  }
  return lineas.join('\n');
}

function extraerArticulos(ley: LeyJson): ArticuloImport[] {
  const arts: ArticuloImport[] = [];
  const usados = new Map<string, number>();
  let orden = 0;
  let grupoTrans = 0;

  const uniqueNumero = (base: string): string => {
    const c = (usados.get(base) ?? 0) + 1;
    usados.set(base, c);
    return c === 1 ? base : `${base} (${c})`;
  };

  const rutaTrans = [{ tipo: 'seccion' as const, numero: 'TRANSITORIOS', nombre: 'Disposiciones Transitorias' }];

  const walk = (n: Nodo, ruta: ArticuloImport['ruta']) => {
    if (n.type === 'articulo' || n.type === 'transitorio_articulo') {
      const esTrans = n.type === 'transitorio_articulo';
      const base = esTrans
        ? `${normalizarNumero(n.ordinal, n.heading) || n.heading || `TRANSITORIO-${orden}`}${grupoTrans > 1 ? ` (reforma ${grupoTrans})` : ''}`
        : normalizarNumero(n.ordinal, n.heading);
      if (!base) return;
      const numero = uniqueNumero(esTrans ? `TRANSITORIO ${base}` : base);
      const texto = renderContenido(n.content);
      if (!texto) return;
      orden += 1;
      arts.push({ numero, texto, ruta: esTrans ? rutaTrans : ruta, orden });
      return;
    }
    let nuevaRuta = ruta;
    if (n.type === 'transitorios') {
      grupoTrans += 1;
    } else if (['libro', 'titulo', 'capitulo', 'seccion'].includes(n.type)) {
      nuevaRuta = [
        ...ruta,
        {
          tipo: n.type,
          numero: normalizarNumero(n.ordinal, n.heading) || n.heading || 'S/N',
          nombre: n.descriptor?.trim() || n.heading || n.type.toUpperCase(),
        },
      ];
    }
    for (const c of n.children ?? []) walk(c, nuevaRuta);
  };

  for (const n of ley.structure) walk(n, []);
  return arts;
}

function parseFechaReforma(lastReform?: string): Date | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(lastReform ?? '');
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reescribir = args.includes('--reescribir');
  const [archivo, slug] = args.filter((a) => a !== '--reescribir');
  if (!archivo || !slug) {
    console.error('Uso: npm run importar -- <archivo.json> <slug-del-codigo> [--reescribir]');
    console.error('  --reescribir: reescribe textos ya importados con versiones anteriores del');
    console.error('  renderizador y corrige su registro de historial (sin ensuciar la bandeja).');
    process.exit(1);
  }
  const ley = JSON.parse(readFileSync(archivo, 'utf8')) as LeyJson;
  const codigo = await prisma.codigo.findUnique({ where: { slug } });
  if (!codigo) {
    console.error(`[importar] No existe codigo con slug "${slug}".`);
    process.exit(1);
  }

  const importados = extraerArticulos(ley);
  const existentes = await prisma.articulo.findMany({ where: { codigoId: codigo.id }, select: { id: true, numero: true, texto: true, seccionId: true } });
  const mapExistentes = new Map(existentes.map((a) => [a.numero, a]));
  const cacheSecciones = new Map<string, string>();
  const contadores = new Map<string, number>();
  for (const s of await prisma.seccion.findMany({ where: { codigoId: codigo.id }, orderBy: { orden: 'asc' } })) {
    cacheSecciones.set(`#byParent#${s.seccionPadreId ?? 'root'}#${s.tipo}:${s.numero}:${s.nombre}`, s.id);
    const hermanoKey = `${s.seccionPadreId ?? 'root'}:`;
    contadores.set(hermanoKey, Math.max(contadores.get(hermanoKey) ?? 0, s.orden));
  }

  const asegurar = async (ruta: ArticuloImport['ruta']): Promise<string | null> => {
    let padreId: string | null = null;
    for (const nivel of ruta) {
      const key = `#byParent#${padreId ?? 'root'}#${nivel.tipo}:${nivel.numero}:${nivel.nombre}`;
      const existenteId = cacheSecciones.get(key);
      if (existenteId) {
        padreId = existenteId;
        continue;
      }
      const hermanoKey = `${padreId ?? 'root'}:`;
      const ordenHijo = (contadores.get(hermanoKey) ?? 0) + 1;
      contadores.set(hermanoKey, ordenHijo);
      const creado = await prisma.seccion.create({ data: { codigoId: codigo.id, seccionPadreId: padreId, tipo: nivel.tipo, numero: nivel.numero, nombre: nivel.nombre, orden: ordenHijo } });
      cacheSecciones.set(key, creado.id);
      padreId = creado.id;
    }
    return padreId;
  };

  let creados = 0;
  let actualizados = 0;
  let iguales = 0;
  let corregidos = 0;
  const historial: { articuloId: string; numero: string; tipo: 'nuevo' | 'modificado'; anterior: string | null; nuevo: string }[] = [];
  const correcciones: { articuloId: string; nuevo: string }[] = [];

  const procesar = async (a: ArticuloImport): Promise<void> => {
    const prev = mapExistentes.get(a.numero);
    if (prev && prev.texto === a.texto) {
      iguales += 1;
      return;
    }
    const seccionId = await asegurar(a.ruta);
    if (prev) {
      await prisma.articulo.update({ where: { id: prev.id }, data: { texto: a.texto, seccionId, orden: a.orden, actualizadoEn: new Date() } });
      if (reescribir) {
        // Texto ya publicado pero mal renderizado en una corrida anterior: se
        // corrige en silencio y se ajusta el historial de esa misma importacion.
        corregidos += 1;
        correcciones.push({ articuloId: prev.id, nuevo: a.texto });
      } else {
        historial.push({ articuloId: prev.id, numero: a.numero, tipo: 'modificado', anterior: prev.texto, nuevo: a.texto });
        actualizados += 1;
      }
    } else {
      const nuevo = await prisma.articulo.create({ data: { codigoId: codigo.id, seccionId, numero: a.numero, texto: a.texto, orden: a.orden } });
      historial.push({ articuloId: nuevo.id, numero: a.numero, tipo: 'nuevo', anterior: null, nuevo: a.texto });
      creados += 1;
    }
  };

  for (let i = 0; i < importados.length; i += 25) {
    await Promise.all(importados.slice(i, i + 25).map(procesar));
    if (i % 300 === 0) console.log(`[importar] ${i}/${importados.length} ...`);
  }

  for (let i = 0; i < historial.length; i += 100) {
    await prisma.historialCambioArticulo.createMany({
      data: historial.slice(i, i + 100).map((h) => ({
        articuloId: h.articuloId,
        codigoId: codigo.id,
        numero: h.numero,
        tipoCambio: h.tipo,
        textoAnterior: h.anterior,
        textoNuevo: h.nuevo,
        origen: 'edicion_manual',
        estado: 'aprobado',
        fechaAprobacion: new Date(),
      })),
    });
  }

  for (const c of correcciones) {
    const ult = await prisma.historialCambioArticulo.findFirst({
      where: { articuloId: c.articuloId, estado: 'aprobado', origen: 'edicion_manual' },
      orderBy: { fechaDeteccion: 'desc' },
      select: { id: true },
    });
    if (ult) await prisma.historialCambioArticulo.update({ where: { id: ult.id }, data: { textoNuevo: c.nuevo } });
  }

  await prisma.codigo.update({
    where: { id: codigo.id },
    data: {
      versionVigente: ley.source.last_reform ? `Texto vigente con reforma ${ley.source.last_reform}` : codigo.versionVigente,
      fechaUltimaReforma: parseFechaReforma(ley.source.last_reform),
    },
  });

  if (codigo.fuenteOficialId) {
    await prisma.tareaSincronizacion.create({
      data: {
        fuenteOficialId: codigo.fuenteOficialId,
        estado: 'exitosa',
        cambiosDetectados: creados + actualizados + corregidos,
        log: [
          `IMPORTACION TEXTO COMPLETO (${new Date().toISOString()})`,
          `Fuente definitiva: PDF oficial Camara de Diputados: ${ley.source.pdf_url ?? '?'}`,
          `Obtenido via espejo mx-md (github.com/JoshuaPozos/leyes-mexicanas-markdown), capturado ${ley.source.captured_at ?? '?'}`,
          `Ultima reforma declarada: ${ley.source.last_reform ?? '?'}`,
          `Articulos del documento: ${importados.length} | creados ${creados}, actualizados ${actualizados}, corregidos ${corregidos}, sin cambios ${iguales}`,
        ].join(' | '),
      },
    });
  }

  console.log(`[importar] ${ley.abbreviation}: ${importados.length} articulos -> creados ${creados}, actualizados ${actualizados}, corregidos ${corregidos}, sin cambios ${iguales}.`);
}

main()
  .catch((e) => {
    console.error('[importar] fallo:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
