// Zona 11 — helpers de ESCENARIO de fixture (conector offline de Zona 6).
//
// Cada test de sincronizacion/aprobacion crea SU PROPIO codigo+fuente fixture
// (ids unicos) y lo limpia al terminar, para no pisarse entre archivos. Sembrar
// desde el fixture v1 usa el MISMO parser que la fuente, de modo que la primera
// sincronizacion sea un baseline identico (0 cambios) de forma determinista.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../lib/prisma.js';
import { ConectorFixture } from '../../conectores/conector-fixture.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXDIR = path.resolve(DIR, '..', '..', 'conectores', 'fixtures');

/** HTML del fixture v1 (baseline) y v2 (reforma: 1 nuevo + 1 modificado + 1 derogado). */
export const V1_HTML = path.join(FIXDIR, 'codigo-demo.html');
export const V2_HTML = path.join(FIXDIR, 'codigo-demo-v2.html');
export const MANUAL_JSON = path.join(FIXDIR, 'reglamento-demo-import.json');

export interface Escenario {
  fuenteId: string;
  codigoId: string;
  slug: string;
}

/** Crea fuente(fixture)+codigo y siembra los articulos tal como los produce v1. */
export async function crearEscenarioFixture(prefijo: string, urlInicial = V1_HTML): Promise<Escenario> {
  const fuenteId = `fuente-${prefijo}`;
  const codigoId = `codigo-${prefijo}`;
  const slug = `codigo-${prefijo}`;

  await prisma.fuenteOficial.create({
    data: {
      id: fuenteId,
      nombre: `Fixture offline ${prefijo}`,
      jurisdiccion: 'federal',
      urlOrigen: urlInicial,
      metodoIngesta: 'manual',
      frecuenciaSincronizacion: 'manual',
      estado: 'activa',
      conectorKey: 'fixture',
    },
  });
  await prisma.codigo.create({
    data: {
      id: codigoId,
      fuenteOficialId: fuenteId,
      slug,
      nombre: `Código Demo ${prefijo}`,
      tipo: 'otro',
      jurisdiccion: 'federal',
      descripcion: 'Codigo de prueba offline para la suite de Zona 11.',
      versionVigente: 'v1',
    },
  });

  const v1 = await new ConectorFixture(urlInicial, { slug, nombre: `Código Demo ${prefijo}` }).obtener();
  let orden = 0;
  for (const a of v1.articulos) {
    orden += 1;
    await prisma.articulo.create({
      data: {
        codigoId,
        numero: a.numero,
        texto: a.texto,
        vigente: true,
        esApartadoClave: false,
        orden,
      },
    });
  }
  return { fuenteId, codigoId, slug };
}

/** Repunta la fuente a un HTML distinto (p. ej. v2) para simular una reforma. */
export async function repuntarFuente(fuenteId: string, url: string): Promise<void> {
  await prisma.fuenteOficial.update({ where: { id: fuenteId }, data: { urlOrigen: url } });
}

/** Borra el escenario (el codigo hace cascada de secciones/articulos/historial). */
export async function borrarEscenario(e: Escenario): Promise<void> {
  await prisma.codigo
    .delete({ where: { id: e.codigoId } })
    .catch(() => undefined);
  await prisma.fuenteOficial
    .delete({ where: { id: e.fuenteId } })
    .catch(() => undefined);
}

/** Lee los articulos vigentes del codigo como mapa numero -> {texto, vigente}. */
export async function fotoArticulos(
  codigoId: string,
): Promise<Map<string, { texto: string; vigente: boolean }>> {
  const arts = await prisma.articulo.findMany({
    where: { codigoId },
    select: { numero: true, texto: true, vigente: true },
  });
  return new Map(arts.map((a) => [a.numero, { texto: a.texto, vigente: a.vigente }]));
}

/** Texto normalizado del fixture para una ruta dada (para comparar tras aprobar). */
export async function textoFixture(url: string, numero: string): Promise<string | null> {
  const res = await new ConectorFixture(url, { slug: 'x', nombre: 'x' }).obtener();
  return res.articulos.find((a) => a.numero === numero)?.texto ?? null;
}
