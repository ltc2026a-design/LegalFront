// Zona 3: salto directo por numero de articulo (GET /api/salto).
//
// Para quien se sabe los articulos de memoria: "art 151", "11 bis cpf",
// "transitorio primero civil". Devuelve los pocos candidatos que coinciden con
// esa referencia, ya ordenados, para que el cliente salte directo si solo hay uno.
//
// Si la consulta no es una referencia de numero, `reconocida` es false y el
// usuario sigue con la busqueda de texto completo normal.
import type { FilaSalto } from '../repositories/salto.repository.js';
import { buscarPorNumero } from '../repositories/salto.repository.js';
import { compacterClave, normalizarClave, parsearReferencia } from '../utils/ref-articulo.js';
import { extracto } from '../utils/text.js';

const CANDIDATOS_MAX = 12;
const EXTRACTO_CANDIDATO = 160;

// Orden de jurisdiccion exigido por la spec: federal > estatal_qroo > municipal.
const JURISDICCION_ORDEN: Record<string, number> = {
  federal: 0,
  estatal_quintana_roo: 1,
  municipal: 2,
};

// Palabras de la consulta que identifican un libro (ademas de las que salen del
// propio nombre/slug). "qroo" no aparece escrito en los nombres oficiales.
const SINONIMOS_LIBRO: Record<string, string[]> = {
  QROO: ['QUINTANA', 'ROO'],
  LOCAL: ['QUINTANA', 'ROO'],
  COPEUM: ['CONSTITUCION'],
  CNPCF: ['NACIONAL', 'FAMILIARES'],
};

// Apodos que no aparecen como palabras sueltas en el nombre del libro.
const APODOS: Record<string, string> = {
  CONSTITUCIONAL: 'CONSTITUCION',
  POLITICA: 'CONSTITUCION',
  ADMINISTRATIVO: 'ADMINISTRATIVA',
  LEGISLATIVA: 'ORGANICA',
  CONTENCIOSO: 'ADMINISTRATIVA',
};

export interface CandidatoSalto {
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  vigente: boolean;
  extracto: string;
}

export interface RespuestaSalto {
  /** true si la consulta tenia forma de numero de articulo. */
  reconocida: boolean;
  /** Clave buscada, normalizada: "11 BIS" | "TRANSITORIO PRIMERO". */
  clave: string;
  candidatos: CandidatoSalto[];
}

/** Palabras utiles de un libro: tokens de su slug y de su nombre, sin vaciablos. */
function palabrasDelLibro(fila: FilaSalto): Set<string> {
  const set = new Set<string>();
  for (const t of normalizarClave(fila.codigoSlug).split(' ')) set.add(t);
  for (const t of normalizarClave(fila.codigoNombre).split(' ')) set.add(t);
  set.delete('CODIGO');
  set.delete('LEY');
  return set;
}

/** Cuanto del "restante" de la consulta apunta a este libro (0 si nada). */
function puntuarLibro(fila: FilaSalto, restante: string[], palabras: Set<string>): number {
  let puntos = 0;
  for (const t of restante) {
    const traducida = SINONIMOS_LIBRO[t];
    if (traducida) {
      if (traducida.every((p) => palabras.has(p))) puntos += 3;
      continue;
    }
    const apodo = APODOS[t];
    if (apodo) {
      if (palabras.has(apodo)) puntos += 2;
      continue;
    }
    if (palabras.has(t)) puntos += 2;
  }
  return puntos;
}

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

export async function saltarArticulo(
  q: string,
  codigoSlug?: string,
): Promise<RespuestaSalto> {
  const referencia = parsearReferencia(q);
  if (!referencia) return { reconocida: false, clave: '', candidatos: [] };

  const filas = await buscarPorNumero({
    base: referencia.base,
    codigoSlug: codigoSlug?.trim() || undefined,
  });

  // Comparacion definitiva: "139 QUÁTER" == "139 QUATER"; "DECIMOSEGUNDO" ==
  // "DECIMO SEGUNDO"; "transitorio 2" == "TRANSITORIO SEGUNDO". Ademas se descarta
  // cualquier numero que solo compartia el primer token ("1" vs "10").
  const aceptadas = [referencia.clave, ...referencia.alternativas];
  const normales = new Set(aceptadas.map(normalizarClave));
  const compactas = new Set(aceptadas.map(compacterClave));
  const exactas = filas.filter(
    (f) => normales.has(normalizarClave(f.numero)) || compactas.has(compacterClave(f.numero)),
  );

  const puntuados = exactas.map((f) => ({
    fila: f,
    puntos: puntuarLibro(f, referencia.restante, palabrasDelLibro(f)),
  }));

  // Si el usuario nombro un libro, se deja solo el que mejor encaja (y los empatados
  // con el mismo puntaje, p. ej. "151 penal" si federal y del estado lo tienen).
  const mejor = Math.max(0, ...puntuados.map((p) => p.puntos));
  const visibles = mejor > 0 ? puntuados.filter((p) => p.puntos === mejor) : puntuados;

  visibles.sort((a, b) => {
    if (a.puntos !== b.puntos) return b.puntos - a.puntos;
    const ja = JURISDICCION_ORDEN[a.fila.jurisdiccion] ?? 99;
    const jb = JURISDICCION_ORDEN[b.fila.jurisdiccion] ?? 99;
    if (ja !== jb) return ja - jb;
    return ordenNumero(a.fila.numero, b.fila.numero) || a.fila.codigoNombre.localeCompare(b.fila.codigoNombre, 'es');
  });

  return {
    reconocida: true,
    clave: referencia.clave,
    candidatos: visibles.slice(0, CANDIDATOS_MAX).map((p) => ({
      articuloId: p.fila.articuloId,
      codigoSlug: p.fila.codigoSlug,
      codigoNombre: p.fila.codigoNombre,
      numero: p.fila.numero,
      vigente: p.fila.vigente,
      extracto: extracto(p.fila.texto, EXTRACTO_CANDIDATO),
    })),
  };
}
