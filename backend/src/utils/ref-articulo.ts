// Reconoce una consulta que es un NUMERO de articulo ("art 151", "ARTÍCULO 11 BIS",
// "983 sexies", "transitorio primero civil") para poder saltar directo a ese articulo
// en vez de pasar por la busqueda de texto completo.
//
// Devuelve null para cualquier otra consulta: esa sigue su camino normal de FTS.
// Los numeros se guardan normalizados y en mayusculas ("11 BIS", "139 QUATER",
// "TRANSITORIO UNICO"), asi que aqui se compara con la misma clave.

/** Sufijos oficiales de los articos agregados. */
const SUFIJOS = new Set([
  'BIS',
  'TER',
  'QUATER',
  'QUINTUS',
  'QUINQUIES',
  'SEXIES',
  'SEPTIES',
  'DECIES',
  'UNDECIES',
  'DUODECIES',
  'VICIES',
]);

/** Palabras ordinales que aparecen como numero (transitorios, sobre todo). */
const ORDINALES = new Set([
  'UNICO',
  'PRIMERO',
  'PRIMERA',
  'SEGUNDO',
  'SEGUNDA',
  'TERCERO',
  'TERCERA',
  'CUARTO',
  'CUARTA',
  'QUINTO',
  'QUINTA',
  'SEXTO',
  'SEXTA',
  'SEPTIMO',
  'SEPTIMA',
  'OCTAVO',
  'OCTAVA',
  'NOVENO',
  'NOVENA',
  'DECIMO',
  'DECIMA',
  'VIGESIMO',
  'VIGESIMA',
  'TRIGESIMO',
  'TRIGESIMA',
]);

/**
 * De digitos a la palabra con la que el POE escribe ese transitorio. "1" admite
 * PRIMERO y UNICO porque los dos formatos aparecen en los decretos.
 */
const ORDINAL_PALABRA: Record<string, string[]> = {
  '1': ['PRIMERO', 'UNICO'],
  '2': ['SEGUNDO'],
  '3': ['TERCERO'],
  '4': ['CUARTO'],
  '5': ['QUINTO'],
  '6': ['SEXTO'],
  '7': ['SEPTIMO'],
  '8': ['OCTAVO'],
  '9': ['NOVENO'],
  '10': ['DECIMO'],
  '11': ['DECIMO PRIMERO'],
  '12': ['DECIMO SEGUNDO'],
  '13': ['DECIMO TERCERO'],
  '14': ['DECIMO CUARTO'],
  '15': ['DECIMO QUINTO'],
  '16': ['DECIMO SEXTO'],
  '17': ['DECIMO SEPTIMO'],
  '18': ['DECIMO OCTAVO'],
  '19': ['DECIMO NOVENO'],
  '20': ['VIGESIMO'],
};

/** Palabras que no aportan para identificar el libro. */
const VOCABLO_LIBRO = new Set(['EL', 'LA', 'LOS', 'LAS', 'DE', 'DEL', 'EN', 'Y', 'PARA', 'CODIGO', 'LEY']);

export interface Referencia {
  /** Clave comparable con el `numero` almacenado: "11 BIS", "TRANSITORIO PRIMERO". */
  clave: string;
  /** Otras claves validas para la misma consulta ("TRANSITORIO 2" -> "TRANSITORIO SEGUNDO"). */
  alternativas: string[];
  /** Digitos iniciales para filtrar en SQL ("11"). Vacio en transitorios por palabra. */
  base: string;
  /** Palabras sobrantes, que sirven para adivinar de que libro habla el usuario. */
  restante: string[];
}

/** Mayusculas, sin acentos y sin puntuacion: "139 QUÁTER." -> "139 QUATER". */
export function normalizarClave(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Sin espacios, para que "DECIMO SEGUNDO" y "DECIMOSEGUNDO" sean la misma clave. */
export function compacterClave(v: string): string {
  return normalizarClave(v).replace(/ /g, '');
}

/** "5o" (ordinal del POE, ya sin el grado) -> "5"; cualquier otra cosa -> null. */
function digitoOrdinal(t: string): string | null {
  return /\d{1,4}O$/.test(t) ? t.slice(0, -1) : null;
}

export function parsearReferencia(consulta: string): Referencia | null {
  const limpio = normalizarClave(consulta);
  if (!limpio || limpio.length > 64) return null;
  const tokens = limpio.split(' ').filter(Boolean);

  // "ARTICULO 151", "ART 151", "ARTS 151", "EL ARTICULO 151".
  let i = 0;
  let conMarcador = false;
  if (tokens[0] === 'EL' && tokens[1] === 'ARTICULO') {
    i = 2;
    conMarcador = true;
  } else if (['ARTICULO', 'ARTICULOS', 'ART', 'ARTS'].includes(tokens[0])) {
    i = 1;
    conMarcador = true;
  }

  // Transitorios por palabra ordinal: "TRANSITORIO PRIMERO", "ART 3 TRANSITORIOS
  // DECIMO OCTAVO". En el PDF algunos van juntos ("TRANSITORIO DECIMOSEGUNDO"),
  // por eso la comparacion final tambien usa la clave compacta (ver compacterClave).
  const idxTrans = tokens.findIndex((t) => t === 'TRANSITORIO' || t === 'TRANSITORIOS' || t === 'TRANSITORIAS');
  if (idxTrans >= 0) {
    const tras = tokens.slice(idxTrans + 1);
    const ordinales: string[] = [];
    let k = 0;
    while (k < tras.length && ordinales.length < 3) {
      if (ORDINALES.has(tras[k]) || /^\d{1,3}$/.test(tras[k])) {
        ordinales.push(tras[k]);
        k += 1;
        continue;
      }
      break;
    }
    // "ARTÍCULO 5o TRANSITORIO": a veces el numero va antes de la palabra.
    const numero = ordinales.length
      ? ordinales.join(' ')
      : tokens
          .slice(i, idxTrans)
          .map((t) => digitoOrdinal(t) ?? t)
          .find((t) => ORDINALES.has(t) || /^\d{1,3}$/.test(t));
    if (!numero) return null; // solo dijo "transitorios", sin numero concreto
    const restante = (ordinales.length ? tras.slice(k) : tras)
      .filter((t) => !VOCABLO_LIBRO.has(t))
      .slice(0, 4);
    const alternativas = /^\d{1,3}$/.test(numero)
      ? (ORDINAL_PALABRA[numero] ?? []).map((p) => `TRANSITORIO ${p}`)
      : [];
    return { clave: `TRANSITORIO ${numero}`, alternativas, base: '', restante };
  }

  // "5o"/"5°" es la forma ordinal del POE; los demas digitos se toman literales.
  const cabeza = tokens[i];
  if (!cabeza) return null;
  const ordinal = digitoOrdinal(cabeza);
  const base = /^\d{1,5}$/.test(cabeza)
    ? cabeza
    : ordinal && (conMarcador || tokens.length <= 2)
      ? ordinal
      : null;
  if (!base) return null;

  const sufijos: string[] = [];
  let j = i + 1;
  while (j < tokens.length) {
    const t = tokens[j];
    // Letra suelta ("40 A"), sufijo latino ("16 BIS") o numero de repeticion ("BIS 2").
    if (SUFIJOS.has(t) || (/^[A-Z]$/.test(t) && !VOCABLO_LIBRO.has(t)) || (/^\d{1,2}$/.test(t) && sufijos.length > 0)) {
      sufijos.push(t);
      j += 1;
      continue;
    }
    break;
  }
  // "articulo 151 y 152 del penal": pide varios numeros, no es un salto directo.
  const sobrantes = tokens.slice(j);
  if (sobrantes.some((t) => /^\d{1,5}$/.test(t))) return null;
  const restante = sobrantes.filter((t) => !VOCABLO_LIBRO.has(t));

  // Sin "articulo/art" escrito, solo se acepta una consulta corta: "151", "11 bis", "151 cpf".
  if (!conMarcador && tokens.length > 3) return null;

  return { clave: [base, ...sufijos].join(' '), alternativas: [], base, restante: restante.slice(0, 4) };
}
