// Zona 3: busqueda de texto completo nativa de PostgreSQL via $queryRaw.
//
// SEGURIDAD: el texto del usuario NUNCA se interpola en el SQL; se pasa como
// parametro ligado usando las plantillas Prisma.sql (nada de concatenacion).
//
// ¿Por que SQL crudo? La busqueda usa la columna GENERADA `texto_ts`
// (tsvector + indice GIN) creada en la migracion de la Zona 2. Prisma no puede
// modelar columnas GENERATED, por eso `texto_ts` no aparece en el modelo
// `Articulo` y solo es accesible por SQL.
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

export interface FilaBusqueda {
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  vigente: boolean;
  destacado: string;
  /** Total de coincidencias (COUNT(*) OVER() antes de aplicar LIMIT). */
  total: number;
}

export interface ParamsBusqueda {
  q: string;
  codigoSlug?: string;
  limit: number;
}

// Opciones de ts_headline: envuelve los terminos con <mark>…</mark>.
const HEADLINE_OPTS = 'StartSel=<mark>, StopSel=</mark>, MaxFragments=1, MaxWords=32';

// Config de FTS propia (migracion `fts_unaccent`): `spanish` a secas no casa el
// "informacion" sin tilde que escribe la gente con el "información" indexado. Es
// un nombre de configuracion fijo de la aplicacion, no un dato del usuario, por
// eso va como literal SQL (Prisma.raw) y no como parametro ligado.
const CONFIG_FTS = Prisma.raw(`'public.spanish_unaccent'`);

/**
 * Busca articulos por texto completo en espanol, ordenados por relevancia
 * (ts_rank). `total` (en cada fila) es el numero total de coincidencias para
 * el query+filtro, independiente del `limit` aplicado a los resultados.
 */
export async function buscarArticulos({
  q,
  codigoSlug,
  limit,
}: ParamsBusqueda): Promise<FilaBusqueda[]> {
  // Filtro opcional por slug del codigo, compuesto como fragmento SQL anidado
  // (el valor sigue yendo como parametro ligado, nunca interpolado).
  const filtroCodigo = codigoSlug ? Prisma.sql`AND c.slug = ${codigoSlug}` : Prisma.empty;

  return prisma.$queryRaw<FilaBusqueda[]>(Prisma.sql`
    SELECT
      a.id            AS "articuloId",
      c.slug          AS "codigoSlug",
      c.nombre        AS "codigoNombre",
      a.numero        AS "numero",
      a.vigente       AS "vigente",
      ts_headline(
        ${CONFIG_FTS}, a.texto,
        plainto_tsquery(${CONFIG_FTS}, ${q}),
        ${HEADLINE_OPTS}
      )               AS "destacado",
      COUNT(*) OVER ()::int AS "total"
    FROM articulo a
    JOIN codigo c ON c.id = a.codigo_id
    WHERE a.texto_ts @@ plainto_tsquery(${CONFIG_FTS}, ${q})
      ${filtroCodigo}
    ORDER BY
      ts_rank(a.texto_ts, plainto_tsquery(${CONFIG_FTS}, ${q})) DESC,
      c.nombre ASC,
      a.numero ASC
    LIMIT ${limit}
  `);
}
