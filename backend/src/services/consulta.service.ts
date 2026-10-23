// Zona 3: logica de la API publica de consulta (SOLO LECTURA, sin mutaciones).
//
// ============================================================================
// INVARIANTE CLAVE DEL PROYECTO
// ----------------------------------------------------------------------------
// La tabla `articulo` contiene SIEMPRE el texto VIGENTE y APROBADO. Las
// propuestas de reforma pendientes viven en `historial_cambio_articulo` y NO se
// aplican a `articulo` hasta que un administrador las aprueba (Zona 7).
// Por eso, toda lectura publica de `articulo` devuelve de forma automatica
// "el texto vigente y aprobado, nunca una version en revision".
// ============================================================================
import type { Articulo, Seccion } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { buscarArticulos } from '../repositories/busqueda.repository.js';
import { extracto } from '../utils/text.js';

const EXTRACTO_ARBOL = 140;
const EXTRACTO_APARTADO = 160;

// Orden de jurisdiccion exigido por la spec: federal > estatal_qroo > municipal.
const JURISDICCION_ORDEN: Record<string, number> = {
  federal: 0,
  estatal_quintana_roo: 1,
  municipal: 2,
};

function ordenJurisdiccion(j: string): number {
  return JURISDICCION_ORDEN[j] ?? 99;
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Orden natural aproximado de numeros de articulo ("3" < "3 BIS" < "14" < "40"). */
function ordenNumero(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum && na !== nb) return na - nb;
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;
  return a.localeCompare(b, 'es');
}

const ordenSeccion = (a: Seccion, b: Seccion): number =>
  a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');

const ordenArticulo = (a: Articulo, b: Articulo): number =>
  a.orden - b.orden || ordenNumero(a.numero, b.numero);

// ---------- Tipos de salida ----------

export interface FuenteOficialResumenCompleta {
  nombre: string;
  urlOrigen: string;
  jurisdiccion: string;
}

export interface CodigoListaItem {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  jurisdiccion: string;
  descripcion: string;
  versionVigente: string;
  fechaUltimaReforma: string | null;
  totalArticulos: number;
  fuenteOficial: FuenteOficialResumenCompleta | null;
}

export interface ArticuloExtract {
  id: string;
  numero: string;
  orden: number;
  extracto: string;
}

export interface SeccionNodo {
  id: string | null;
  tipo: string | null;
  numero: string | null;
  nombre: string;
  orden: number;
  /** Articulos del nodo + todos los de sus descendientes (subarbol). */
  totalArticulos: number;
  /** Solo los articulos ATACHADOS DIRECTAMENTE a esta seccion. */
  articulos: ArticuloExtract[];
  hijos: SeccionNodo[];
}

export interface CodigoDetalle {
  codigo: {
    id: string;
    slug: string;
    nombre: string;
    tipo: string;
    jurisdiccion: string;
    descripcion: string;
    versionVigente: string;
    fechaUltimaReforma: string | null;
  };
  arbol: SeccionNodo[];
}

export interface BreadcrumbItem {
  tipo: string;
  numero: string;
  nombre: string;
}

export interface ArticuloDetalle {
  codigo: { slug: string; nombre: string };
  fuenteOficial: { nombre: string; urlOrigen: string } | null;
  articulo: {
    id: string;
    numero: string;
    texto: string;
    esApartadoClave: boolean;
    vigente: boolean;
    fechaUltimaReforma: string | null;
    breadcrumb: BreadcrumbItem[];
  };
}

export interface ResultadoBusqueda {
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  vigente: boolean;
  destacado: string;
}

export interface RespuestaBusqueda {
  query: string;
  total: number;
  resultados: ResultadoBusqueda[];
}

export interface ApartadoClaveItem {
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  extracto: string;
}

// ---------- 1) GET /api/codigos ----------

export async function getListaCodigos(): Promise<CodigoListaItem[]> {
  const codigos = await prisma.codigo.findMany({
    include: { fuenteOficial: true, _count: { select: { articulos: true } } },
  });

  return codigos
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      nombre: c.nombre,
      tipo: c.tipo as string,
      jurisdiccion: c.jurisdiccion as string,
      descripcion: c.descripcion,
      versionVigente: c.versionVigente,
      fechaUltimaReforma: toIso(c.fechaUltimaReforma),
      totalArticulos: c._count.articulos,
      fuenteOficial: c.fuenteOficial
        ? {
            nombre: c.fuenteOficial.nombre,
            urlOrigen: c.fuenteOficial.urlOrigen,
            jurisdiccion: c.fuenteOficial.jurisdiccion as string,
          }
        : null,
    }))
    .sort(
      (a, b) =>
        ordenJurisdiccion(a.jurisdiccion) - ordenJurisdiccion(b.jurisdiccion) ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );
}

// ---------- 2) GET /api/codigos/:slug ----------

function construirArbol(secciones: Seccion[], articulos: Articulo[]): SeccionNodo[] {
  const artsPorSeccion = new Map<string, Articulo[]>();
  const artsSinSeccion: Articulo[] = [];
  for (const a of articulos) {
    if (a.seccionId) {
      const arr = artsPorSeccion.get(a.seccionId) ?? [];
      arr.push(a);
      artsPorSeccion.set(a.seccionId, arr);
    } else {
      artsSinSeccion.push(a);
    }
  }

  // Index de ids validos: un padre inexistente se trata como raiz (no se pierde nodo).
  const ids = new Set(secciones.map((s) => s.id));
  const hijosPorPadre = new Map<string, Seccion[]>();
  const raices: Seccion[] = [];
  for (const s of secciones) {
    const padreId = s.seccionPadreId && ids.has(s.seccionPadreId) ? s.seccionPadreId : null;
    if (padreId) {
      const arr = hijosPorPadre.get(padreId) ?? [];
      arr.push(s);
      hijosPorPadre.set(padreId, arr);
    } else {
      raices.push(s);
    }
  }

  const mapperArt = (a: Articulo): ArticuloExtract => ({
    id: a.id,
    numero: a.numero,
    orden: a.orden,
    extracto: extracto(a.texto, EXTRACTO_ARBOL),
  });

  function nodoDe(seccion: Seccion): SeccionNodo {
    const directos = (artsPorSeccion.get(seccion.id) ?? []).slice().sort(ordenArticulo);
    const hijos = (hijosPorPadre.get(seccion.id) ?? []).slice().sort(ordenSeccion).map(nodoDe);
    const totalSub = directos.length + hijos.reduce((acc, h) => acc + h.totalArticulos, 0);
    return {
      id: seccion.id,
      tipo: seccion.tipo as string,
      numero: seccion.numero,
      nombre: seccion.nombre,
      orden: seccion.orden,
      totalArticulos: totalSub,
      articulos: directos.map(mapperArt),
      hijos,
    };
  }

  const arbol = raices.slice().sort(ordenSeccion).map(nodoDe);

  // Agrupacion virtual de articulos sin seccion: SOLO si existen.
  if (artsSinSeccion.length > 0) {
    arbol.push({
      id: null,
      tipo: null,
      numero: null,
      nombre: 'Artículos',
      orden: Number.MAX_SAFE_INTEGER,
      totalArticulos: artsSinSeccion.length,
      articulos: artsSinSeccion.slice().sort(ordenArticulo).map(mapperArt),
      hijos: [],
    });
  }

  return arbol;
}

export async function getCodigoDetalle(slug: string): Promise<CodigoDetalle | null> {
  const codigo = await prisma.codigo.findUnique({
    where: { slug },
    include: { secciones: true, articulos: true },
  });
  if (!codigo) return null;

  return {
    codigo: {
      id: codigo.id,
      slug: codigo.slug,
      nombre: codigo.nombre,
      tipo: codigo.tipo as string,
      jurisdiccion: codigo.jurisdiccion as string,
      descripcion: codigo.descripcion,
      versionVigente: codigo.versionVigente,
      fechaUltimaReforma: toIso(codigo.fechaUltimaReforma),
    },
    arbol: construirArbol(codigo.secciones, codigo.articulos),
  };
}

// ---------- 3) GET /api/codigos/:slug/articulos/:numero ----------

export async function getArticuloDetalle(
  slug: string,
  numero: string,
): Promise<ArticuloDetalle | null> {
  const codigo = await prisma.codigo.findUnique({
    where: { slug },
    include: { fuenteOficial: true },
  });
  if (!codigo) return null;

  // Numero exacto como se almacena, tras recortar (Express ya decodifica el URL).
  const numeroBuscado = numero.trim();
  const articulo = await prisma.articulo.findFirst({
    where: { codigoId: codigo.id, numero: numeroBuscado },
  });
  if (!articulo) return null;

  // Migajas: camino de secciones raiz -> hoja, subiendo por la auto-relacion.
  const secciones = await prisma.seccion.findMany({ where: { codigoId: codigo.id } });
  const byId = new Map<string, Seccion>(secciones.map((s) => [s.id, s]));
  const breadcrumb: BreadcrumbItem[] = [];
  const visitadas = new Set<string>(); // proteccion anti-ciclo
  let cur: Seccion | undefined = articulo.seccionId ? byId.get(articulo.seccionId) : undefined;
  while (cur && !visitadas.has(cur.id)) {
    visitadas.add(cur.id);
    breadcrumb.unshift({ tipo: cur.tipo as string, numero: cur.numero, nombre: cur.nombre });
    cur = cur.seccionPadreId ? byId.get(cur.seccionPadreId) : undefined;
  }

  return {
    codigo: { slug: codigo.slug, nombre: codigo.nombre },
    fuenteOficial: codigo.fuenteOficial
      ? { nombre: codigo.fuenteOficial.nombre, urlOrigen: codigo.fuenteOficial.urlOrigen }
      : null,
    articulo: {
      id: articulo.id,
      numero: articulo.numero,
      texto: articulo.texto, // texto vigente y aprobado (invariante Zona 3 / Zona 7)
      esApartadoClave: articulo.esApartadoClave,
      vigente: articulo.vigente,
      fechaUltimaReforma: toIso(articulo.fechaUltimaReforma),
      breadcrumb,
    },
  };
}

// ---------- 4) GET /api/buscar ----------

export async function buscar(
  q: string,
  codigoSlug: string | undefined,
  limit: number,
): Promise<RespuestaBusqueda> {
  const trimmed = q.trim();
  const filas = await buscarArticulos({
    q: trimmed,
    codigoSlug: codigoSlug?.trim() || undefined,
    limit,
  });
  const total = filas.length > 0 ? filas[0].total : 0;

  return {
    query: trimmed,
    total,
    resultados: filas.map((f) => ({
      articuloId: f.articuloId,
      codigoSlug: f.codigoSlug,
      codigoNombre: f.codigoNombre,
      numero: f.numero,
      vigente: f.vigente,
      destacado: f.destacado, // puede contener <mark>…</mark> de ts_headline
    })),
  };
}

// ---------- 5) GET /api/apartados-clave ----------

export async function getApartadosClave(): Promise<ApartadoClaveItem[]> {
  const rows = await prisma.articulo.findMany({
    where: { esApartadoClave: true },
    include: { codigo: true },
  });

  rows.sort(
    (a, b) =>
      ordenJurisdiccion(a.codigo.jurisdiccion) - ordenJurisdiccion(b.codigo.jurisdiccion) ||
      a.codigo.nombre.localeCompare(b.codigo.nombre, 'es') ||
      ordenNumero(a.numero, b.numero),
  );

  return rows.map((a) => ({
    articuloId: a.id,
    codigoSlug: a.codigo.slug,
    codigoNombre: a.codigo.nombre,
    numero: a.numero,
    extracto: extracto(a.texto, EXTRACTO_APARTADO),
  }));
}
