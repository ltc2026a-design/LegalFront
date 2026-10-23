// Zona 6 — MOTOR DE DIFF.
//
// Regla DURA: calcularCambios NUNCA toca la tabla `articulo` ni publica nada.
// Solo produce filas en `historial_cambio_articulo` con estado=pendiente_revision
// y origen=sincronizacion_automatica. La publicacion (crear/actualizar el
// articulo real) ocurre en la Zona 7 al APROBAR.
//
// Como representa cada tipo de cambio (ver la migracion add_sync_diff_support):
//   nuevo      -> articuloId NULL, codigoId + numero + textoNuevo, tipoCambio=nuevo
//   modificado -> articuloId del articulo existente, textoAnterior=texto en BD,
//                 textoNuevo=texto de la fuente, tipoCambio=modificado
//   derogado   -> articuloId del articulo vigente que ya NO esta en la fuente,
//                 textoAnterior=texto en BD, textoNuevo=texto en BD (la columna
//                 es NOT NULL), tipoCambio=derogado
//
// Idempotencia: antes de insertar se comparan las filas pendientes ya
// existentes del MISMO codigo por la clave
//   tipoCambio | numero | textoNuevo-normalizado.
// Si ya existe una pendiente identica, no se duplica.
import { prisma } from '../lib/prisma.js';
import {
  type ArticuloNormalizado,
  type ResultadoNormalizado,
  type SeccionNormalizada,
  normalizarTexto,
  textosIguales,
} from '../conectores/tipos.js';
import type { TipoCambio } from '../generated/prisma/client.js';

export interface CambioDetectado {
  codigoId: string;
  numero: string;
  tipoCambio: TipoCambio;
  textoAnterior: string | null;
  textoNuevo: string;
  articuloId: string | null;
}

/** Clave de idempotencia de una fila pendiente. */
function clavePendiente(c: {
  tipoCambio: TipoCambio;
  numero: string;
  textoNuevo: string;
}): string {
  return `${c.tipoCambio}|${c.numero}|${normalizarTexto(c.textoNuevo)}`;
}

/** Calcula los cambios en memoria (sin escribir) a partir del resultado del conector. */
export function detectarCambios(
  codigoId: string,
  dbArticulos: { id: string; numero: string; texto: string; vigente: boolean }[],
  resultado: ResultadoNormalizado,
): CambioDetectado[] {
  const porNumero = new Map(dbArticulos.map((a) => [a.numero, a]));
  const numerosFuente = new Set<string>();
  const cambios: CambioDetectado[] = [];

  for (const art of resultado.articulos as ArticuloNormalizado[]) {
    numerosFuente.add(art.numero);
    const existente = porNumero.get(art.numero);
    if (!existente) {
      cambios.push({
        codigoId,
        numero: art.numero,
        tipoCambio: 'nuevo',
        textoAnterior: null,
        textoNuevo: art.texto,
        articuloId: null,
      });
      continue;
    }
    if (!textosIguales(existente.texto, art.texto)) {
      cambios.push({
        codigoId,
        numero: art.numero,
        tipoCambio: 'modificado',
        textoAnterior: existente.texto,
        textoNuevo: art.texto,
        articuloId: existente.id,
      });
    }
    // textos identicos -> se ignora.
  }

  // Derogados: vigentes en BD que ya no aparecen en la fuente.
  for (const a of dbArticulos) {
    if (a.vigente && !numerosFuente.has(a.numero)) {
      cambios.push({
        codigoId,
        numero: a.numero,
        tipoCambio: 'derogado',
        textoAnterior: a.texto,
        textoNuevo: a.texto,
        articuloId: a.id,
      });
    }
  }

  return cambios;
}

/**
 * Calcula los cambios y los deja como pendientes en historial (idempotente).
 * Devuelve los cambios RECIENTEMENTE creados (los ya existentes no se repiten).
 */
export async function calcularCambios(
  codigoId: string,
  resultado: ResultadoNormalizado,
): Promise<CambioDetectado[]> {
  const dbArticulos = await prisma.articulo.findMany({
    where: { codigoId },
    select: { id: true, numero: true, texto: true, vigente: true },
  });

  const detectados = detectarCambios(codigoId, dbArticulos, resultado);

  // Pendientes ya existentes del codigo -> set de claves.
  const pendientes = await prisma.historialCambioArticulo.findMany({
    where: { codigoId, estado: 'pendiente_revision' },
    select: { tipoCambio: true, numero: true, textoNuevo: true },
  });
  const existentes = new Set(
    pendientes.map((p) => clavePendiente({ tipoCambio: p.tipoCambio, numero: p.numero ?? '', textoNuevo: p.textoNuevo })),
  );

  const creados: CambioDetectado[] = [];
  for (const c of detectados) {
    const clave = clavePendiente(c);
    if (existentes.has(clave)) continue; // ya estaba pendiente identico -> no duplicar.
    await prisma.historialCambioArticulo.create({
      data: {
        codigoId,
        numero: c.numero,
        articuloId: c.articuloId,
        tipoCambio: c.tipoCambio,
        textoAnterior: c.textoAnterior,
        textoNuevo: c.textoNuevo,
        estado: 'pendiente_revision',
        origen: 'sincronizacion_automatica',
      },
    });
    existentes.add(clave);
    creados.push(c);
  }

  return creados;
}

// ---------- Reconciliacion de secciones (PREVIEW / prepare) ----------

interface SeccionPersistida {
  clave: string;
  id: string;
}

/**
 * Asegura que el arbol de secciones exista en la base (NO toca articulos).
 * Idempotente por (codigoId + tipo + numero + padre). Devuelve la lista de
 * secciones con su clave para resolver la ruta de un articulo 'nuevo' al aprobar.
 * Lo usa la Zona 7 al materializar un cambio 'nuevo' (necesita la seccion destino).
 */
export async function prepararSecciones(
  codigoId: string,
  secciones: SeccionNormalizada[],
  claveFn: (tipo: SeccionNormalizada['tipo'], numero: string) => string,
): Promise<SeccionPersistida[]> {
  const resultado: SeccionPersistida[] = [];

  async function recorrer(nodos: SeccionNormalizada[], padreId: string | null): Promise<void> {
    let orden = 0;
    for (const nodo of nodos) {
      orden += 1;
      const clave = claveFn(nodo.tipo, nodo.numero);
      const existente = await prisma.seccion.findFirst({
        where: { codigoId, tipo: nodo.tipo, numero: nodo.numero, seccionPadreId: padreId },
        select: { id: true },
      });
      let id: string;
      if (existente) {
        id = existente.id;
        await prisma.seccion.update({ where: { id }, data: { nombre: nodo.nombre, orden } });
      } else {
        const creado = await prisma.seccion.create({
          data: {
            codigoId,
            tipo: nodo.tipo,
            numero: nodo.numero,
            nombre: nodo.nombre,
            orden,
            seccionPadreId: padreId,
          },
          select: { id: true },
        });
        id = creado.id;
      }
      resultado.push({ clave, id });
      await recorrer(nodo.children, id);
    }
  }

  await recorrer(secciones, null);
  return resultado;
}

/** Resuelve el id de seccion destino para la ruta de un articulo (ultima clave). */
export function resolverSeccionId(
  rutaSecciones: string[],
  persistidas: SeccionPersistida[],
): string | null {
  if (rutaSecciones.length === 0) return null;
  const ultima = rutaSecciones[rutaSecciones.length - 1];
  return persistidas.find((s) => s.clave === ultima)?.id ?? null;
}
