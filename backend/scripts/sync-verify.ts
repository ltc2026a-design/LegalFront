// Zona 6 — VERIFICACION end-to-end OFFLINE del pipeline sincronizacion + diff,
// usando el conector de FIXTURE (no requiere red). Se ejecuta con:
//   npx tsx scripts/sync-verify.ts
//
// Cubre los 4 puntos pedidos:
//   (a) crea/asegura una fuente 'fixture' + un codigo 'codigo-demo' sembrado con
//       los articulos del fixture v1,
//   (b) sincroniza v1  -> exitosa, 0 cambios, articulo.texto NO cambia,
//   (c) apunta a v2 y sincroniza -> 1 nuevo + 1 modificado + 1 derogado pendientes,
//       articulo.texto SIGUE sin cambiar,
//   (d) repite v2 -> idempotente (no duplica pendientes).
// Al final imprime conteos y una muestra de cada fila de historial.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma.js';
import { ConectorFixture } from '../src/conectores/conector-fixture.js';
import { ejecutarSincronizacion } from '../src/sincronizacion/orquestador.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const V1 = path.join(DIR, '..', 'src', 'conectores', 'fixtures', 'codigo-demo.html');
const V2 = path.join(DIR, '..', 'src', 'conectores', 'fixtures', 'codigo-demo-v2.html');

const FUENTE_ID = 'fuente-fixture-demo';
const CODIGO_ID = 'codigo-fixture-demo';
const SLUG = 'codigo-demo';

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  [OK] ${msg}`);
  } else {
    console.error(`  [FALLO] ${msg}`);
    fallos++;
  }
}

/** Foto de los articulos publicos (numero -> {texto, vigente}) para probar que no cambian. */
async function fotoArticulos(): Promise<Map<string, { texto: string; vigente: boolean }>> {
  const arts = await prisma.articulo.findMany({ where: { codigoId: CODIGO_ID } });
  return new Map(arts.map((a) => [a.numero, { texto: a.texto, vigente: a.vigente }]));
}

function fotosIguales(
  a: Map<string, { texto: string; vigente: boolean }>,
  b: Map<string, { texto: string; vigente: boolean }>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (!w || w.texto !== v.texto || w.vigente !== v.vigente) return false;
  }
  return true;
}

async function contarPendientes(tipo?: string): Promise<number> {
  return prisma.historialCambioArticulo.count({
    where: { codigoId: CODIGO_ID, estado: 'pendiente_revision', ...(tipo ? { tipoCambio: tipo as never } : {}) },
  });
}

async function prepararEscenario(): Promise<void> {
  // Limpieza total del escenario (el codigo es exclusivo de esta verificacion).
  await prisma.historialCambioArticulo.deleteMany({ where: { codigoId: CODIGO_ID } });
  await prisma.articulo.deleteMany({ where: { codigoId: CODIGO_ID } });
  await prisma.seccion.deleteMany({ where: { codigoId: CODIGO_ID } });
  await prisma.tareaSincronizacion.deleteMany({ where: { fuenteOficialId: FUENTE_ID } });

  await prisma.fuenteOficial.upsert({
    where: { id: FUENTE_ID },
    update: { urlOrigen: V1, conectorKey: 'fixture', estado: 'activa' },
    create: {
      id: FUENTE_ID,
      nombre: 'Fixture offline (codigo-demo)',
      jurisdiccion: 'federal',
      urlOrigen: V1,
      metodoIngesta: 'manual',
      frecuenciaSincronizacion: 'manual',
      estado: 'activa',
      conectorKey: 'fixture',
    },
  });

  await prisma.codigo.upsert({
    where: { id: CODIGO_ID },
    update: { fuenteOficialId: FUENTE_ID, slug: SLUG },
    create: {
      id: CODIGO_ID,
      fuenteOficialId: FUENTE_ID,
      slug: SLUG,
      nombre: 'Código Demo (fixture)',
      tipo: 'otro',
      jurisdiccion: 'federal',
      descripcion: 'Codigo de prueba para verificar sincronizacion y diff sin red.',
      versionVigente: 'v1',
    },
  });

  // Sembrar los articulos del v1 USANDO EL MISMO PARSER, para que la primera
  // sincronizacion sea exitosa de forma determinista (baseline == fuente).
  const v1 = await new ConectorFixture(V1, { slug: SLUG, nombre: 'Código Demo (fixture)' }).obtener();
  let orden = 0;
  for (const art of v1.articulos) {
    orden += 1;
    await prisma.articulo.create({
      data: {
        codigoId: CODIGO_ID,
        numero: art.numero,
        texto: art.texto,
        vigente: true,
        esApartadoClave: false,
        orden,
      },
    });
  }
  console.log(`(a) Escenario listo: fuente=${FUENTE_ID}, codigo=${CODIGO_ID}, articulos v1 sembrados=${v1.articulos.length}`);
}

async function pasoB(): Promise<void> {
  console.log('\n(b) Sincroniza v1 (baseline == fuente)');
  const antes = await fotoArticulos();
  const res = await ejecutarSincronizacion(FUENTE_ID);
  const despues = await fotoArticulos();

  assert(res.estado === 'exitosa', `tarea estado = exitosa (recibido: ${res.estado})`);
  assert(res.cambiosDetectados === 0, `cambiosDetectados = 0 (recibido: ${res.cambiosDetectados})`);
  assert((await contarPendientes()) === 0, 'no hay pendientes tras v1');
  assert(fotosIguales(antes, despues), 'articulo.texto publico NO cambió tras v1');
}

async function pasoC(): Promise<void> {
  console.log('\n(c) Repunta a v2 y sincroniza (reforma simulada)');
  await prisma.fuenteOficial.update({ where: { id: FUENTE_ID }, data: { urlOrigen: V2 } });
  const antes = await fotoArticulos();
  const res = await ejecutarSincronizacion(FUENTE_ID);
  const despues = await fotoArticulos();

  assert(res.estado === 'con_cambios_pendientes', `tarea estado = con_cambios_pendientes (recibido: ${res.estado})`);
  assert(res.cambiosDetectados === 3, `cambiosDetectados = 3 (recibido: ${res.cambiosDetectados})`);
  assert((await contarPendientes('nuevo')) === 1, '1 pendiente tipo nuevo');
  assert((await contarPendientes('modificado')) === 1, '1 pendiente tipo modificado');
  assert((await contarPendientes('derogado')) === 1, '1 pendiente tipo derogado');
  assert(fotosIguales(antes, despues), 'articulo.texto publico NO cambió tras v2 (todo sigue pendiente)');

  const arts = await fotoArticulos();
  assert(arts.get('3')?.texto === antes.get('3')?.texto, 'artículo 3 en BD conserva el texto de v1 (no se aplicó el modificado)');
  assert(arts.get('6')?.vigente === true, 'artículo 6 sigue vigente=true (no se aplicó el derogado)');
  assert(!arts.has('7'), 'artículo 7 NO se creó en BD (el nuevo sigue pendiente)');
}

async function pasoD(): Promise<void> {
  console.log('\n(d) Repite v2 (mismo estado de fuente) -> idempotencia');
  const pendientesAntes = await contarPendientes();
  const res = await ejecutarSincronizacion(FUENTE_ID);
  const pendientesDespues = await contarPendientes();

  assert(res.cambiosDetectados === 0, `2a pasada no crea cambios nuevos (recibido: ${res.cambiosDetectados})`);
  assert(pendientesAntes === pendientesDespues && pendientesDespues === 3, `pendientes sin duplicar: ${pendientesDespues}`);
}

async function mostrarMuestra(): Promise<void> {
  const filas = await prisma.historialCambioArticulo.findMany({
    where: { codigoId: CODIGO_ID, estado: 'pendiente_revision' },
    orderBy: { tipoCambio: 'asc' },
  });
  console.log('\nMuestra de filas de historial (pendiente_revision):');
  for (const f of filas) {
    const corta = (s: string | null, n = 46): string => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : 'null');
    console.log(
      `  - articulo=${f.numero} tipo=${f.tipoCambio} | anterior: "${corta(f.textoAnterior)}" | nuevo: "${corta(f.textoNuevo)}"`,
    );
  }
}

async function main(): Promise<void> {
  console.log('=== ZONA 6 · VERIFICACIÓN OFFLINE (fixture) ===');
  await prepararEscenario();
  await pasoB();
  await pasoC();
  await pasoD();
  await mostrarMuestra();

  console.log('\n=== RESULTADO ===');
  if (fallos === 0) {
    console.log('TODAS LAS ASERCIONES PASARON ✔');
  } else {
    console.error(`${fallos} aserción(es) FALLARON ✘`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[sync-verify] error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
