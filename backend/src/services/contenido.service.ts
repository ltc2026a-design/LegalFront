// Zona 8 — logica compartida de la gestion MANUAL de contenido.
//
// INVARIANTE (SRS): la edicion manual la firma el administrador, por lo que se
// PUBLICA DE INMEDIATO (escribe en `articulo`) y se registra en
// `historial_cambio_articulo` con origen=edicion_manual, estado=aprobado,
// fechaAprobacion=ahora y aprobadoPorId=admin. NO pasa por la bandeja de
// pendientes (eso es solo para sincronizacion_automatica, Zonas 6/7).
//
// Para el cargue en lote con `rutaSecciones` se REUTILIZA el reconciliador de
// secciones de Zona 6 (`prepararSecciones` + `resolverSeccionId`), igual que
// hace la aprobacion de un cambio 'nuevo' en admin-cambios.ts.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { ConectorManualImport } from '../conectores/conector-manual.js';
import {
  claveSeccion,
  type SeccionNormalizada,
  type TipoSeccionNormalizada,
} from '../conectores/tipos.js';
import { prepararSecciones, resolverSeccionId } from '../sincronizacion/diff.js';
import {
  EstadoCambio,
  Jurisdiccion,
  MetodoIngesta,
  OrigenCambio,
  TipoCambio,
  TipoCodigo,
  TipoSeccion,
  type Articulo,
} from '../generated/prisma/client.js';

// ---------- Validadores / normalizadores genericos ----------

export const ENUM_TIPO_CODIGO = TipoCodigo;
export const ENUM_JURISDICCION = Jurisdiccion;
export const ENUM_TIPO_SECCION = TipoSeccion;
export const ENUM_METODO_INGESTA = MetodoIngesta;

/** Comprueba si `v` es un valor del enum Prisma `enumeracion`. */
export function esValorDe<T extends Record<string, string>>(
  enumeracion: T,
  v: unknown,
): v is T[keyof T] {
  return typeof v === 'string' && Object.values(enumeracion).includes(v);
}

/** Cadena recortada o null. */
export function strOpcional(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

/** Date a partir de "YYYY-MM-DD" / ISO; null si no parseable o vacio. */
export function fechaOpcional(v: unknown): Date | null {
  if (v === null) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Booleano estricto de body (null = no enviado). */
export function boolOpcional(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  return null;
}

// ---------- Slugs ----------

/** Slug sin acentos, minusculas, no-alfanumericos a guiones. */
export function slugify(nombre: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'documento';
}

/** Slug unico derivado de `deseado` (anade -2, -3... si colisiona). */
export async function slugUnico(deseado: string): Promise<string> {
  const base = slugify(deseado);
  let slug = base;
  let i = 2;
  for (;;) {
    const existente = await prisma.codigo.findUnique({ where: { slug }, select: { id: true } });
    if (!existente) return slug;
    slug = `${base}-${i}`;
    i += 1;
  }
}

// ---------- Articulos publicados (edicion manual) ----------

export interface CrearArticuloInput {
  codigoId: string;
  numero: string;
  texto: string;
  seccionId: string | null;
  esApartadoClave: boolean;
  vigente: boolean;
  orden?: number;
  adminId: string;
}

/** Proximo orden dentro de la seccion (o del grupo sin seccion). */
async function proximoOrden(codigoId: string, seccionId: string | null): Promise<number> {
  const max = await prisma.articulo.aggregate({
    where: { codigoId, seccionId },
    _max: { orden: true },
  });
  return (max._max.orden ?? 0) + 1;
}

/**
 * Crea el articulo ya publicado + su fila de historial
 * (nuevo / edicion_manual / aprobado) de forma atomica.
 */
export async function crearArticuloPublicado(i: CrearArticuloInput): Promise<Articulo> {
  const orden = i.orden ?? (await proximoOrden(i.codigoId, i.seccionId));
  const ahora = new Date();
  return prisma.$transaction(async (tx) => {
    const articulo = await tx.articulo.create({
      data: {
        codigoId: i.codigoId,
        numero: i.numero,
        texto: i.texto,
        seccionId: i.seccionId,
        esApartadoClave: i.esApartadoClave,
        vigente: i.vigente,
        orden,
        fechaUltimaReforma: ahora,
      },
    });
    await tx.historialCambioArticulo.create({
      data: {
        articuloId: articulo.id,
        codigoId: i.codigoId,
        numero: i.numero,
        tipoCambio: TipoCambio.nuevo,
        textoAnterior: null,
        textoNuevo: i.texto,
        estado: EstadoCambio.aprobado,
        origen: OrigenCambio.edicion_manual,
        fechaDeteccion: ahora,
        fechaAprobacion: ahora,
        aprobadoPorId: i.adminId,
      },
    });
    return articulo;
  });
}

/** Fila de historial para una edicion manual del TEXTO (modificado/aprobado). */
export async function registrarEdicionManualTexto(input: {
  articuloId: string;
  codigoId: string;
  numero: string;
  textoAnterior: string;
  textoNuevo: string;
  adminId: string;
}): Promise<void> {
  const ahora = new Date();
  await prisma.historialCambioArticulo.create({
    data: {
      articuloId: input.articuloId,
      codigoId: input.codigoId,
      numero: input.numero,
      tipoCambio: TipoCambio.modificado,
      textoAnterior: input.textoAnterior,
      textoNuevo: input.textoNuevo,
      estado: EstadoCambio.aprobado,
      origen: OrigenCambio.edicion_manual,
      fechaDeteccion: ahora,
      fechaAprobacion: ahora,
      aprobadoPorId: input.adminId,
    },
  });
}

// ---------- Rutas de secciones (batch) — reutiliza el reconciliador Zona 6 ----------

const TIPOS_RUTA: readonly TipoSeccionNormalizada[] = ['libro', 'titulo', 'capitulo', 'seccion'];
const NOMBRE_TIPO: Record<TipoSeccionNormalizada, string> = {
  libro: 'Libro',
  titulo: 'Título',
  capitulo: 'Capítulo',
  seccion: 'Sección',
};

interface SegmentoRuta {
  tipo: TipoSeccionNormalizada;
  numero: string;
  /** Clave canonica (igual que claveSeccion de Zona 6): "tipo:numero-minusculas". */
  clave: string;
}

/** "titulo:I" -> { tipo:'titulo', numero:'I', clave:'titulo:i' }. null si invalida. */
function parsearSegmento(k: string): SegmentoRuta | null {
  const idx = k.indexOf(':');
  if (idx <= 0) return null;
  const tipo = k.slice(0, idx) as TipoSeccionNormalizada;
  if (!TIPOS_RUTA.includes(tipo)) return null;
  const numero = k.slice(idx + 1).trim();
  if (!numero) return null;
  return { tipo, numero, clave: `${tipo}:${numero.toLowerCase()}` };
}

/** Normaliza toda la ruta a claves canonicas; null si algun segmento es invalido. */
export function normalizarRutaSecciones(ruta: string[]): SegmentoRuta[] | null {
  const out: SegmentoRuta[] = [];
  for (const k of ruta) {
    const seg = parsearSegmento(k);
    if (!seg) return null;
    out.push(seg);
  }
  return out;
}

/**
 * Garantiza que la cadena de secciones de una ruta exista en el codigo y
 * devuelve el id de la hoja. Si TODA la cadena ya esta publicada la devuelve
 * tal cual (sin tocar nada); si falta algun eslabon construye la cadena como
 * SeccionNormalizada (preservando numero/nombre de los eslabones existentes) y
 * la pasa por `prepararSecciones` + `resolverSeccionId` de Zona 6.
 */
export async function resolverCadenaSecciones(
  codigoId: string,
  ruta: SegmentoRuta[],
): Promise<string | null> {
  if (ruta.length === 0) return null;

  const nodos: SeccionNormalizada[] = [];
  let padreId: string | null = null;
  let cursor: SeccionNormalizada[] | null = nodos;
  let completo = true;

  for (const seg of ruta) {
    if (!completo) {
      // Eslabon nuevo: el resto de la cadena se crea con nombre legible.
      const hijo: SeccionNormalizada = {
        tipo: seg.tipo,
        numero: seg.numero,
        nombre: `${NOMBRE_TIPO[seg.tipo]} ${seg.numero}`,
        children: [],
      };
      cursor!.push(hijo);
      cursor = hijo.children;
      continue;
    }
    const existente: { id: string; numero: string; nombre: string } | null =
      await prisma.seccion.findFirst({
        where: {
          codigoId,
          tipo: seg.tipo,
          numero: { equals: seg.numero, mode: 'insensitive' },
          seccionPadreId: padreId,
        },
        select: { id: true, numero: true, nombre: true },
      });
    if (existente) {
      padreId = existente.id;
      const nodo: SeccionNormalizada = {
        tipo: seg.tipo,
        numero: existente.numero,
        nombre: existente.nombre,
        children: [],
      };
      cursor!.push(nodo);
      cursor = nodo.children;
    } else {
      completo = false;
      const nodo: SeccionNormalizada = {
        tipo: seg.tipo,
        numero: seg.numero,
        nombre: `${NOMBRE_TIPO[seg.tipo]} ${seg.numero}`,
        children: [],
      };
      cursor!.push(nodo);
      cursor = nodo.children;
    }
  }

  if (completo && padreId) return padreId; // cadena ya publicada: cero escrituras.

  const claves = ruta.map((s) => s.clave);
  const persistidas = await prepararSecciones(codigoId, nodos, claveSeccion);
  return resolverSeccionId(claves, persistidas);
}

// ---------- Carga en lote ----------

export interface LoteError {
  indice: number;
  numero: string | null;
  error: string;
}

export interface LoteResultado {
  creados: number;
  omitidos: number;
  errores: LoteError[];
}

type ItemBruto = Record<string, unknown>;

/**
 * Alta masiva de articulos (la estrella de la Zona 8). Cada fila valida y se
 * publica en su propia transaccion: una fila mala se recoge en errores[] y el
 * lote continua. `omitidos` = numero que ya existe en el codigo (idempotente).
 */
export async function cargarLoteArticulos(
  codigoId: string,
  adminId: string,
  items: unknown[],
): Promise<LoteResultado> {
  const cacheRutas = new Map<string, string | null>();
  let creados = 0;
  let omitidos = 0;
  const errores: LoteError[] = [];

  for (const [indice, bruto] of items.entries()) {
    const item: ItemBruto =
      bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? (bruto as ItemBruto) : {};
    const numero = strOpcional(item.numero);
    const texto = strOpcional(item.texto);
    if (!numero || !texto) {
      errores.push({ indice, numero, error: 'faltan_numero_o_texto' });
      continue;
    }

    let seccionId: string | null = null;
    const rutaBruta = Array.isArray(item.rutaSecciones) ? item.rutaSecciones.map(String) : [];
    if (rutaBruta.length > 0) {
      const ruta = normalizarRutaSecciones(rutaBruta);
      if (!ruta) {
        errores.push({ indice, numero, error: 'ruta_secciones_invalida' });
        continue;
      }
      const claveCache = ruta.map((s) => s.clave).join('|');
      if (cacheRutas.has(claveCache)) {
        seccionId = cacheRutas.get(claveCache) ?? null;
      } else {
        try {
          seccionId = await resolverCadenaSecciones(codigoId, ruta);
          cacheRutas.set(claveCache, seccionId);
        } catch {
          errores.push({ indice, numero, error: 'no_se_pudo_resolver_seccion' });
          continue;
        }
      }
    } else {
      const idDirecto = strOpcional(item.seccionId);
      if (idDirecto) {
        const s = await prisma.seccion.findFirst({
          where: { id: idDirecto, codigoId },
          select: { id: true },
        });
        if (!s) {
          errores.push({ indice, numero, error: 'seccion_no_pertenece_codigo' });
          continue;
        }
        seccionId = s.id;
      }
    }

    const duplicado = await prisma.articulo.findFirst({
      where: { codigoId, numero },
      select: { id: true },
    });
    if (duplicado) {
      omitidos += 1;
      continue;
    }

    try {
      await crearArticuloPublicado({
        codigoId,
        numero,
        texto,
        seccionId,
        esApartadoClave: item.esApartadoClave === true,
        vigente: item.vigente === false ? false : true,
        adminId,
      });
      creados += 1;
    } catch {
      errores.push({ indice, numero, error: 'no_se_pudo_crear' });
    }
  }

  return { creados, omitidos, errores };
}

const CARPETA_FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'conectores',
  'fixtures',
);

/**
 * Importacion desde el JSON del conector manual (Zona 6). `archivo` puede ser
 * absoluta, relativa al backend o solo el nombre de un fixture.
 */
export async function importarArchivoManual(
  codigoId: string,
  adminId: string,
  archivo: string,
): Promise<LoteResultado> {
  let ruta = archivo;
  if (!path.isAbsolute(ruta)) {
    const candidato = path.join(CARPETA_FIXTURES, path.basename(ruta));
    ruta = candidato; // fixture primero; si no existe, ConectorManualImport lanzara.
  }
  const resultado = await new ConectorManualImport(ruta).obtener();
  await prepararSecciones(codigoId, resultado.secciones, claveSeccion);
  const items = resultado.articulos.map((a) => ({
    numero: a.numero,
    texto: a.texto,
    rutaSecciones: a.rutaSecciones,
    esApartadoClave: a.esApartadoClave ?? false,
    vigente: a.vigente ?? true,
  }));
  return cargarLoteArticulos(codigoId, adminId, items);
}
