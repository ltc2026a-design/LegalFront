// Fase 6 — "Resumen y explicado" del articulo.
//
// El texto legal llega del backend como un solo bloque (ArticuloDetalle.articulo.texto)
// donde fracciones, incisos y apartados van METIDOS en el parrafo. Aqui se parte en
// sectores legibles y se explica cada uno con lenguaje llano.
//
// Es 100% determinista y local: funciona sin conexion y sin IA (el chat de Gemini sigue
// bloqueado por el proyecto de Google), asi que el resumen nunca falla ni se inventa
// nada: solo reordena y traduce a palabras simples lo que el propio articulo dice.

export type TipoSector = 'intro' | 'fraccion' | 'inciso' | 'apartado' | 'subapartado' | 'punto';

export type Tema =
  | 'obligacion'
  | 'prohibicion'
  | 'derecho'
  | 'excepcion'
  | 'procedimiento'
  | 'plazo'
  | 'definicion'
  | 'autoridad'
  | 'sancion'
  | 'generico';

export interface Sector {
  tipo: TipoSector;
  /** Etiqueta corta para el chip: "Fraccion IV", "Inciso b)". */
  etiqueta: string;
  /** Contenido del sector, ya sin el marcador. */
  cuerpo: string;
  /** Explicacion en palabras simples (heuristica por tema). */
  explicacion: string;
  tema: Tema;
  /** 0 = la entrada del articulo, 1 = fraccion, 2 = inciso, 3 = aparte. */
  profundidad: number;
}

export interface ResumenArticulo {
  /** Idea general: la entrada del articulo o su primeras palabras. */
  idea: string;
  /** De que trata el articulo en una linea (la regla que mas pesa en el texto). */
  tema: Tema;
  sectores: Sector[];
  totalFracciones: number;
  totalIncisos: number;
  totalApartados: number;
  palabras: number;
  /** Falso cuando el articulo no tiene estructura: solo trae la idea general. */
  tieneSectores: boolean;
}

interface SectorBruto {
  tipo: TipoSector;
  etiqueta: string;
  cuerpo: string;
  profundidad: number;
}

interface ReglaTema {
  tema: Tema;
  /** Palabras clave sobre el texto ya sin acentos. */
  claves: string[];
  explicacion: string;
}

// El orden importa: la primera regla que pega es la que se muestra.
const REGLAS: ReglaTema[] = [
  {
    tema: 'prohibicion',
    claves: [
      'no podra',
      'no podran',
      'no pueden',
      'no debe',
      'no deben',
      'les prohib',
      'prohibido',
      'esta prohibido',
      'queda prohibido',
      'no les esta permitido',
    ],
    explicacion: 'Es una prohibición: esto no se puede hacer.',
  },
  {
    tema: 'sancion',
    claves: [
      'se castig',
      'castigara',
      'castigo',
      'sancion',
      'pena de',
      'multa',
      'delito',
      'prision',
      'responsabilidad penal',
    ],
    explicacion: 'Es una sanción: incumplirlo tiene consecuencia penal o económica.',
  },
  {
    tema: 'excepcion',
    claves: ['salvo', 'excepto', 'exceptu', 'excepcion', 'no sera aplicable', 'sin perjuicio', 'no obstante'],
    explicacion: 'Es una excepción: acota o levanta lo dicho antes.',
  },
  {
    // Va antes que "obligacion": un mismo sector puede decir "podrá" y "deberá".
    tema: 'derecho',
    claves: [
      'tienen derecho',
      'toda persona tiene',
      'se garantiza',
      'libre y gratuita',
      'de forma libre',
      'gratuito',
      'gratuita',
      'podran',
      'podra',
      'facultad',
      'se les respet',
    ],
    explicacion: 'Reconoce un derecho o una facultad que puedes exigir.',
  },
  {
    tema: 'obligacion',
    claves: [
      'deberan',
      'debera',
      'deben',
      'esta obligado',
      'tienen la obligacion',
      'es obligacion',
      'es obligatorio',
      'tendra la obligacion',
    ],
    explicacion: 'Es una obligación: alguien tiene que cumplir esto.',
  },
  {
    tema: 'plazo',
    claves: [
      ' dias',
      ' meses',
      ' anos',
      'termino',
      'dentro de',
      'plazo',
      'prorroga',
      'vigencia',
      'horas habiles',
    ],
    explicacion: 'Fija tiempos: hay un plazo que hay que respetar.',
  },
  {
    tema: 'definicion',
    claves: ['se entender', 'entendera por', 'significa', 'para efectos', 'se refiere', 'concepto de'],
    explicacion: 'Define un concepto: aclara qué significa este término.',
  },
  {
    tema: 'autoridad',
    claves: [
      'autoridad',
      'secretaria',
      'dependencia',
      'organo',
      'juzgado',
      'tribunal',
      'ayuntamiento',
      'ministerio publico',
      'congreso',
    ],
    explicacion: 'Dice qué autoridad tiene que actuar.',
  },
  {
    tema: 'procedimiento',
    claves: ['procedimiento', 'tramite', 'solicitud', 'formato', 'registro', 'publicacion', 'requisitos', 'informe'],
    explicacion: 'Describe cómo se hace un trámite o procedimiento.',
  },
];

const EXPLICACION_GENERICA = 'Complementa lo que dice el artículo.';

/** Frase de ayuda por tema (se usa tambien cuando el tema viene de la fraccion madre). */
const EXPLICACION_POR_TEMA: Record<Tema, string> = {
  obligacion: 'Es una obligación: alguien tiene que cumplir esto.',
  prohibicion: 'Es una prohibición: esto no se puede hacer.',
  derecho: 'Reconoce un derecho o una facultad que puedes exigir.',
  excepcion: 'Es una excepción: acota o levanta lo dicho antes.',
  procedimiento: 'Describe cómo se hace un trámite o procedimiento.',
  plazo: 'Fija tiempos: hay un plazo que hay que respetar.',
  definicion: 'Define un concepto: aclara qué significa este término.',
  autoridad: 'Dice qué autoridad tiene que actuar.',
  sancion: 'Es una sanción: incumplirlo tiene consecuencia penal o económica.',
  generico: EXPLICACION_GENERICA,
};

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Romanos clasicos (hasta CMXCIX sirve para cualquier codigo) y arabigos. */
const ROMANO = '[IVXLCDM]{1,7}';
const ARABIGO = '[0-9]{1,3}';
const LETRA = '[a-zA-Z]';

interface Patron {
  re: RegExp;
  tipo: TipoSector;
  profundidad: number;
  etiqueta: (m: RegExpMatchArray) => string;
}

// Orden = prioridad: el primer patron que pega gana.
const PATRONES: Patron[] = [
  {
    re: new RegExp(`^(${ROMANO})\\.\\s`),
    tipo: 'fraccion',
    profundidad: 1,
    etiqueta: (m) => `Fracción ${m[1]}`,
  },
  {
    re: new RegExp(`^(${ARABIGO})\\.\\s`),
    tipo: 'fraccion',
    profundidad: 1,
    etiqueta: (m) => `Fracción ${m[1]}`,
  },
  // Comillas con todo en mayusculas: "SEGURIDAD SOCIAL." (fraccion definitoria).
  {
    re: /^"\s*[A-Z][A-Z0-9&/,;()' -]{2,}?[.!?]\s*"/,
    tipo: 'fraccion',
    profundidad: 1,
    etiqueta: () => 'Fracción',
  },
  {
    re: new RegExp(`^(${LETRA})(${ARABIGO})\\)\\s`),
    tipo: 'subapartado',
    profundidad: 3,
    etiqueta: (m) => `Apartado ${m[1].toUpperCase()}${m[2]}`,
  },
  {
    re: new RegExp(`^(${LETRA}{1,3})\\)\\s`),
    tipo: 'inciso',
    profundidad: 2,
    etiqueta: (m) => `Inciso ${m[1].toLowerCase()})`,
  },
  { re: /^[-•]\s/, tipo: 'punto', profundidad: 1, etiqueta: () => 'Punto' },
];

/**
 * ¿Puede `desde` abrir un marcador? Solo al arranque, tras un salto de linea o
 * tras cierre de frase ("... . III. "), que es como viene el texto oficial.
 * Con eso no confundimos un romanito perdido en mitad de una oracion.
 */
function puedeAbrir(texto: string, desde: number): boolean {
  if (desde === 0) return true;
  const antes = texto.slice(Math.max(0, desde - 60), desde);
  // Los conectores oficiales cierran en dos puntos ("... se entenderán por: I. ...").
  return /\n\s*$/.test(antes) || /[.;!:]\s+$/.test(antes);
}

interface Hallazgo {
  indice: number;
  hasta: number;
  patron: Patron;
  etiqueta: string;
}

function buscar(texto: string, desde: number): Hallazgo | null {
  if (!puedeAbrir(texto, desde)) return null;
  const resto = texto.slice(desde);
  for (const patron of PATRONES) {
    const m = patron.re.exec(resto);
    if (!m || m[0].length < 2) continue;
    return { indice: desde, hasta: desde + m[0].length, patron, etiqueta: patron.etiqueta(m) };
  }
  return null;
}

/** Recorta el "ARTÍCULO 14." inicial: la pantalla ya lo muestra en su cabecera. */
function sinNumero(s: string): string {
  return s.replace(/^art[ií]culo\s+\d+\s*[oó]?\s*(\.\s*|\.\s*de\s+la\s+ley\s*[:.\-]?\s*)/i, '').trim();
}

/** Corta el texto en los marcadores de estructura. */
function trozos(texto: string): SectorBruto[] {
  const limpio = texto.replace(/\r/g, '');
  const marcas: Hallazgo[] = [];

  let i = 0;
  while (i < limpio.length) {
    const hallado = buscar(limpio, i);
    if (hallado) {
      marcas.push(hallado);
      i = hallado.hasta;
      continue;
    }
    i += 1;
  }  const salida: SectorBruto[] = [];
  const apertura = sinNumero(limpio.slice(0, marcas[0]?.indice ?? limpio.length).replace(/\s+/g, ' ').trim());
  if (apertura) {
    salida.push({ tipo: 'intro', etiqueta: 'Entrada', cuerpo: apertura, profundidad: 0 });
  }

  marcas.forEach((marca, pos) => {
    const hasta = pos + 1 < marcas.length ? marcas[pos + 1].indice : limpio.length;
    const cuerpo = limpio.slice(marca.hasta, hasta).replace(/\s+/g, ' ').trim();
    if (!cuerpo) return;
    salida.push({
      tipo: marca.patron.tipo,
      etiqueta: marca.etiqueta,
      cuerpo,
      profundidad: marca.patron.profundidad,
    });
  });

  return salida;
}

function detectarTema(cuerpo: string): { tema: Tema; explicacion: string } {
  const plano = ` ${sinAcentos(cuerpo).toLowerCase().replace(/\s+/g, ' ')} `;
  for (const regla of REGLAS) {
    if (regla.claves.some((k) => plano.includes(k.toLowerCase()))) {
      return { tema: regla.tema, explicacion: regla.explicacion };
    }
  }
  // "Trabajo no digno: aquél que..." — una definicion con termino delante.
  if (/^[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑÜü ]{2,45}:\s+[a-záéíóúñ]/.test(cuerpo.trim())) {
    return {
      tema: 'definicion',
      explicacion: 'Define un concepto: aclara qué significa este término.',
    };
  }
  return { tema: 'generico', explicacion: EXPLICACION_GENERICA };
}

/** Primeras palabras del texto, como idea general. */
function ideaGeneral(plano: string, max = 240): string {
  if (plano.length <= max) return plano;
  const corte = plano.slice(0, max);
  const punto = corte.lastIndexOf('.');
  const fin = punto > max * 0.45 ? punto + 1 : corte.lastIndexOf(' ');
  return `${plano.slice(0, fin > 0 ? fin : max).trim()}…`;
}

/**
 * Texto continuo sin estructura: se parte en puntos para que sea escaneable.
 * Solo se usa en parrafos largos; uno corto ya es un resumen en si mismo.
 */
function porPuntos(plano: string): string[] {
  if (plano.length < 240) return [];
  const fuerte = plano
    .split(/(?<=[.;])\s+/)
    .map((f) => f.replace(/^[-•]\s*/, '').trim())
    .filter((f) => f.length > 30);
  if (fuerte.length >= 2) return fuerte.slice(0, 8);
  // Un solo periodo muy largo: se cortan las oraciones coordinadas (", Que ...").
  const suave = plano
    .split(/,\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map((f) => f.trim())
    .filter((f) => f.length > 40);
  return suave.length >= 2 ? suave.slice(0, 8) : [];
}

function sectorDe(t: SectorBruto, heredado?: Tema): Sector {
  const tema = detectarTema(t.cuerpo).tema;
  // Solo los incisos/apartados heredan el tema de la fraccion que los antecede:
  // por si solos no dicen de que van ("a) Proveer los materiales adecuados").
  // Los "puntos" de un parrafo continuo son frases completas: no deben heredar.
  const subitem = t.tipo === 'inciso' || t.tipo === 'subapartado';
  const final =
    tema === 'generico' && subitem && heredado && heredado !== 'generico' ? heredado : tema;
  return {
    tipo: t.tipo,
    etiqueta: t.etiqueta,
    cuerpo: t.cuerpo,
    explicacion: EXPLICACION_POR_TEMA[final],
    tema: final,
    profundidad: t.profundidad,
  };
}

/**
 * Analiza el texto de un articulo y devuelve su resumen por sectores.
 * Nunca lanza: con un texto vacio devuelve una idea vacia y `tieneSectores: false`.
 */
export function analizarArticulo(texto: string): ResumenArticulo {
  const plano = (texto ?? '').replace(/\s+/g, ' ').trim();
  const palabras = plano ? plano.split(' ').length : 0;

  if (!plano) {
    return {
      idea: 'Este artículo no tiene texto registrado.',
      tema: 'generico',
      sectores: [],
      totalFracciones: 0,
      totalIncisos: 0,
      totalApartados: 0,
      palabras: 0,
      tieneSectores: false,
    };
  }

  const brutos = trozos(plano);
  const estructurados = brutos.filter((b) => b.tipo !== 'intro');

  let sectores: Sector[];
  if (estructurados.length >= 2) {
    let ultimo: Tema = 'generico';
    sectores = brutos.map((b) => {
      const s = sectorDe(b, ultimo);
      if (s.tema !== 'generico') ultimo = s.tema;
      return s;
    });
  } else {
    // Sin fracciones/incisos: se apoya en los puntos del propio parrafo.
    const puntos = porPuntos(plano);
    let ultimo: Tema = 'generico';
    sectores = puntos.map((cuerpo, idx) => {
      const s = sectorDe({ tipo: 'punto', etiqueta: `Punto ${idx + 1}`, cuerpo, profundidad: 1 }, ultimo);
      if (s.tema !== 'generico') ultimo = s.tema;
      return s;
    });
    if (sectores.length === 0) {
      sectores = [sectorDe({ tipo: 'intro', etiqueta: 'Entrada', cuerpo: sinNumero(plano), profundidad: 0 })];
    }
  }

  const entrada = sectores.find((s) => s.tipo === 'intro');
  const totalFracciones = sectores.filter((s) => s.tipo === 'fraccion').length;
  const totalIncisos = sectores.filter((s) => s.tipo === 'inciso').length;
  const totalApartados = sectores.filter((s) => s.tipo === 'apartado' || s.tipo === 'subapartado').length;

  const idea = ideaGeneral(entrada ? entrada.cuerpo : sinNumero(plano));

  return {
    idea,
    tema: detectarTema(idea).tema,
    sectores,
    totalFracciones,
    totalIncisos,
    totalApartados,
    palabras,
    tieneSectores: sectores.some((s) => s.tipo !== 'intro'),
  };
}

/** Etiqueta del tema para el chip de color. */
export const ETIQUETA_TEMA: Record<Tema, string> = {
  obligacion: 'Obliga a',
  prohibicion: 'Prohibe',
  derecho: 'Da derecho a',
  excepcion: 'Excepción',
  procedimiento: 'Cómo se hace',
  plazo: 'Plazo',
  definicion: 'Define',
  autoridad: 'Autoridad',
  sancion: 'Sanción',
  generico: 'Detalle',
};
