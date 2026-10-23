// Zona 3: consultas para el "salto directo" por numero de articulo (GET /api/salto).
//
// A diferencia de /api/buscar, esto NO usa texto completo: el usuario ya sabe que
// articulo quiere ("151", "11 BIS", "TRANSITORIO PRIMERO") y solo hay que localizarlo.
// El SQL estrecha con el primer token del `numero` (barato y sin acentos en la parte
// numerica) y la comparacion final —que sí ignora acentos y puntuacion— se hace en JS
// con normalizarClave(), que es la misma clave que usa el parser de referencia.
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

const TEXTO_CANDIDATO = 220;
const FILAS_MAX = 400;

export interface FilaSalto {
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  tipo: string;
  jurisdiccion: string;
  numero: string;
  vigente: boolean;
  texto: string;
}

export interface ParamsSalto {
  /** Digitos del articulo ("151"). Vacio cuando la referencia es un transitorio. */
  base: string;
  codigoSlug?: string;
}

/** Articulos cuyo `numero` empieza con estos digitos (o todos los transitorios). */
export async function buscarPorNumero({ base, codigoSlug }: ParamsSalto): Promise<FilaSalto[]> {
  const filtroCodigo = codigoSlug ? Prisma.sql`AND c.slug = ${codigoSlug}` : Prisma.empty;
  // Sin digitos, la referencia es "TRANSITORIO <ordinal>": se traen todos y se
  // comparan en JS (son ~350 filas en todo el acervo, no una busqueda de texto).
  const filtroNumero = base
    ? Prisma.sql`split_part(a.numero, ' ', 1) = ${base}`
    : Prisma.sql`upper(split_part(a.numero, ' ', 1)) = 'TRANSITORIO'`;

  return prisma.$queryRaw<FilaSalto[]>(Prisma.sql`
    SELECT
      a.id            AS "articuloId",
      c.slug          AS "codigoSlug",
      c.nombre        AS "codigoNombre",
      c.tipo          AS "tipo",
      c.jurisdiccion  AS "jurisdiccion",
      a.numero        AS "numero",
      a.vigente       AS "vigente",
      left(a.texto, CAST(${TEXTO_CANDIDATO} AS integer)) AS texto
    FROM articulo a
    JOIN codigo c ON c.id = a.codigo_id
    WHERE ${filtroNumero}
      ${filtroCodigo}
    LIMIT ${FILAS_MAX}
  `);
}
