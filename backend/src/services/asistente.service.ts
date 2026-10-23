// Zona 12 — Asistente de consultas: busca en NUESTROS libros y deja que el modelo
// responda solo sobre lo encontrado (RAG), con citas numeradas que el cliente enlaza.
//
// Invariantes del proyecto que aqui se respetan:
//   - El texto que ve el modelo sale de `articulo`, o sea el texto vigente y aprobado
//     (misma invariante de la Zona 3). Nunca se le manda una propuesta en revision.
//   - No hay cuentas: la peticion se identifica con el device_id de siempre y solo se
//     usa para el rate limiting y la bitacora, nunca para perfilarse.
//   - Sin llave no hay chat, pero si hay recuperacion: el endpoint de estado lo avisa
//     y la app muestra la busqueda guiada (que funciona offline).
import type { Articulo, Codigo } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { ErrorLlm, type Generador, type Turno } from '../llm/cliente.js';
import { generarConLlm } from '../llm/cliente.js';
import { configLlm } from '../llm/config.js';
import { buscarArticulos } from '../repositories/busqueda.repository.js';
import { saltarArticulo } from './salto.service.js';
import { normalizarClave, parsearReferencia } from '../utils/ref-articulo.js';
import { extracto } from '../utils/text.js';

const MAX_FUENTES = 4;
const CARACTERES_POR_FUENTE = 1100;
const MAX_PREGUNTA = 400;
const MAX_TURNOS_HISTORIAL = 6;

export interface FuenteAsistente {
  /** Numero de cita tal como aparece en la respuesta: [1], [2]… */
  n: number;
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  vigente: boolean;
  /** Texto que se le manda al modelo (recortado). */
  texto: string;
}

export interface MetaAsistente {
  pregunta: string;
  fuentes: FuenteAsistente[];
  /** true si no habia nada en el acervo y la respuesta es la guiada, sin IA. */
  sinFuentes: boolean;
  /** Preguntas de seguimiento para el chat, ya resueltas por la recuperacion. */
  sugerencias: string[];
}

/** El chat escribe mientras genera: cada metodo es una linea del stream ndjson. */
export interface EmisorAsistente {
  fuente(f: FuenteAsistente): void;
  token(texto: string): void;
  fin(meta: MetaAsistente): void;
  error(codigo: string): void;
}

export interface PreguntaAsistente {
  pregunta: string;
  historial: Turno[];
}

// ---------- Recuperacion ----------

type ArticuloConCodigo = Articulo & { codigo: Codigo };

function fuenteDe(a: ArticuloConCodigo, n: number): FuenteAsistente {
  return {
    n,
    articuloId: a.id,
    codigoSlug: a.codigo.slug,
    codigoNombre: a.codigo.nombre,
    numero: a.numero,
    vigente: a.vigente,
    texto: extracto(a.texto, CARACTERES_POR_FUENTE),
  };
}

/**
 * Referencia numerica aunque este en medio de una frase: "¿qué dice el artículo 151
 * del Código Penal Federal?". parsearReferencia exige que el numero este al inicio,
 * asi que aqui se recorta el fragmento (del "artículo" hasta ~40 caracteres despues,
 * que es donde suele venir el nombre del libro) y se le vuelve a pasar.
 */
const RE_ARTICULO_EN_FRASE = /\bart(?:[íi]?cul[oa]s?|s|\.?)\s*\d{1,5}[^\n]{0,40}|\b\d{1,4}\s*(?:bis|ter|qu[aá]ter|sexies|quinquies)\b[^\n]{0,30}/i;

function referenciaEnFrase(pregunta: string): { fragmento: string; base: string } | null {
  const directa = parsearReferencia(pregunta);
  if (directa) return { fragmento: pregunta, base: directa.base };
  const m = pregunta.match(RE_ARTICULO_EN_FRASE);
  if (!m) return null;
  const ref = parsearReferencia(m[0]);
  return ref ? { fragmento: m[0], base: ref.base } : null;
}

/**
 * Palabras que tiene TODA pregunta pero que no describen el tema. `plainto_tsquery`
 * ANDA todos los terminos, asi que "¿que dice el articulo 7 sobre los plazos?"
 * no encuentra nada si "decir" o "sobre" no estan en el mismo articulo. Estan en
 * la forma que devuelve `normalizarClave` (minusculas sin tildes, mayusculas).
 */
const PALABRAS_VACIAS = new Set([
  // interrogativos / relativos
  'QUE', 'QUE?', 'CUAL', 'CUALES', 'COMO', 'CUANDO', 'DONDE', 'ADONDE', 'CUANTO', 'CUANTOS',
  'CUANTA', 'CUANTAS', 'QUIEN', 'QUIENES', 'CUYO', 'CUYA', 'SI',
  // verbos de consulta (los que usa quien pregunta, no el texto legal)
  'DECIR', 'DICE', 'DICEN', 'DECIA', 'INDICA', 'INDICAN', 'ESTABLECE', 'SENALA', 'SENALA',
  'EXPLICA', 'EXPLICAR', 'HABLA', 'TRATA', 'REGULA', 'MENCIONA', 'CONTEMPLA', 'TIENE',
  'TIENEN', 'TENGO', 'TENEMOS', 'HAY', 'EXISTE', 'PUEDE', 'PUEDEN', 'PODEMOS', 'PUEDES',
  'QUIERO', 'QUIERES', 'NECESITO', 'NECESITAS', 'GUSTARIA', 'DESEA', 'SABER', 'SABES',
  'CONOCE', 'CONOCER', 'LEER', 'BUSCAR', 'BUSCO', 'BUSCAS', 'ENCONTRAR',
  'RESPONDE', 'RESPONDER', 'PREGUNTA', 'PREGUNTAR', 'AYUDA', 'DIME', 'DIGAME',
  'PIDO', 'PIDAS', 'PIDE', 'PIDEN', 'PEDIR', 'HAGO', 'HACER', 'HACE', 'HACES', 'HACEMOS',
  'HACEN', 'HARIA', 'TARDA', 'TARDAN', 'TARDO', 'CUESTA', 'CUESTAN', 'COSTO', 'SIRVE',
  'SIRVEN', 'PASA', 'PASAN', 'OCURRE', 'SUCEDE', 'SUCEDA', 'DEBO', 'PUEDA',
  'POR', 'FAVOR', 'GRACIAS', 'HOLA',
  // articulo/marcador de numero: eso lo resuelve /salto, no el texto completo
  'ARTICULO', 'ARTICULOS', 'ART', 'ARTS', 'TRANSITORIO', 'TRANSITORIOS', 'FRACCION',
  'INCISO', 'PARRAFO', 'NUMERAL',
  // funcion
  'EL', 'LA', 'LOS', 'LAS', 'LO', 'UN', 'UNA', 'UNS', 'UNAS', 'DEL', 'DE', 'EN', 'CON',
  'PARA', 'AL', 'A', 'O', 'U', 'Y', 'E', 'SE', 'SU', 'SUS', 'ME', 'MI', 'TE', 'TI', 'ES',
  'SON', 'SER', 'ESTA', 'ESTAN', 'ESTE', 'ESTOS', 'ESTAS', 'ESA', 'ESAS', 'ESE', 'ESOS',
  'ESO', 'AQUEL', 'AQUELLA', 'MUY', 'MAS', 'MENOS', 'TAMBIEN', 'TAMPOCO', 'MISMO', 'MISMA',
  'USTED', 'YO', 'TU', 'NOSOTROS', 'SOBRE', 'CONCERNIENTE', 'RESPECTO', 'CONTRA',
]);

/** El "tema" de una pregunta: lo que queda tras quitarle el ruido de interrogacion. */
export function temaDeLaPregunta(pregunta: string): string {
  const utiles: string[] = [];
  for (const token of pregunta.split(/[^\p{L}\p{N}]+/u)) {
    const clave = normalizarClave(token);
    if (clave.length < 2 || /^\d+$/.test(clave) || PALABRAS_VACIAS.has(clave)) continue;
    // Se conserva el acento: el config `spanish` de Postgres NO los normaliza, así
    // que "informacion" jamas encuentra al "información" del texto guardado.
    const original = token.toLowerCase();
    if (!utiles.includes(original)) utiles.push(original);
  }
  return utiles.join(' ').slice(0, MAX_PREGUNTA);
}

/**
 * Recortes del tema para la tercera pasada: "pido pension alimenticia" no casa,
 * pero "pension alimenticia" si. El FTS ANDA todos los terminos, asi que una sola
 * palabra que sobre deja el acervo entero sin resultados. Se prueban las ventanas
 * mas largas primero y las palabras sueltas al final (la mas larga delante, porque
 * en una pregunta casi siempre la palabra rara es la especifica del tema).
 */
export function ventanasDelTema(tema: string, max = 10): string[] {
  const tokens = tema.split(' ').filter(Boolean);
  const salida: string[] = [];
  for (let largo = tokens.length - 1; largo >= 2 && salida.length < max; largo--) {
    for (let i = 0; i + largo <= tokens.length && salida.length < max; i++) {
      salida.push(tokens.slice(i, i + largo).join(' '));
    }
  }
  const sueltas = [...tokens].sort((a, b) => b.length - a.length);
  for (const t of sueltas) {
    if (salida.length >= max) break;
    salida.push(t);
  }
  return salida;
}

/**
 * Articulos que responden a la pregunta, en el orden de relevancia de la busqueda.
 * Si la pregunta trae un numero de articulo ("art 151 penal"), ese entra primero:
 * quien pregunta por numero quiere ESE articulo, no los que hablan de su tema.
 */
export async function recuperarFuentes(pregunta: string): Promise<FuenteAsistente[]> {
  const limpia = pregunta.trim().replace(/\s+/g, ' ').slice(0, MAX_PREGUNTA);
  const ids: string[] = [];

  const numerica = referenciaEnFrase(limpia);
  if (numerica) {
    const salto = await saltarArticulo(numerica.fragmento);
    ids.push(...salto.candidatos.slice(0, 2).map((c) => c.articuloId));
  }

  // Con numero resuelto NO se mezcla la busqueda por tema: sus mejores coincidencias
  // suelen ser articulos que solo repiten el nombre del libro de la pregunta.
  if (ids.length === 0) {
    let porTema = await buscarArticulos({ q: limpia, limit: MAX_FUENTES });
    if (porTema.length === 0) {
      // Segunda pasada con solo el tema: una pregunta larga casi nunca casa tal cual.
      const tema = temaDeLaPregunta(limpia);
      if (tema) porTema = await buscarArticulos({ q: tema, limit: MAX_FUENTES });
      if (porTema.length === 0) {
        // Tercera pasada: recortes del tema, hasta encontrar algo.
        for (const ventana of ventanasDelTema(tema)) {
          porTema = await buscarArticulos({ q: ventana, limit: MAX_FUENTES });
          if (porTema.length > 0) break;
        }
      }
    }
    ids.push(...porTema.map((f) => f.articuloId));
  }

  const idsUnicos = [...new Set(ids)].slice(0, MAX_FUENTES);
  if (idsUnicos.length === 0) return [];

  const guardados = await prisma.articulo.findMany({
    where: { id: { in: idsUnicos } },
    include: { codigo: true },
  });
  const porId = new Map(guardados.map((a) => [a.id, a]));

  return idsUnicos
    .map((id) => porId.get(id))
    .filter((a): a is ArticuloConCodigo => Boolean(a))
    .map((a, i) => fuenteDe(a, i + 1));
}

// ---------- Prompt ----------

const SISTEMA = `Eres el asistente del Sistema de Consulta Legal (México y Quintana Roo).
Atiendes a gente que NO es abogada: explica en español simple, como quien ayuda por teléfono.

Reglas que no puedes romper:
1. Responde SOLO con la informacion de las fuentes numeradas que se te entregan.
2. Cita entre corchetes al final de cada afirmacion: [1], [2].
3. Orden de la respuesta: (a) una linea con la respuesta en palabras simples; (b) que dice la ley, con el numero de articulo tal como viene impreso en la fuente (ej. "articulo 151 BIS"); (c) "Siguiente paso": que hacer, en maximo 3 lineas cortas.
4. Si la duda se puede entender de dos maneras (por ejemplo "licencia" de trabajar o de manejar) o las fuentes no alcanzan para saber el caso, NO adivines: responde en una linea lo que si sabes y termina con UNA pregunta concreta para afinar.
5. Si nada de la duda esta en las fuentes, digalo en una linea y sugiere otras palabras o el numero de articulo. No inventes articulos, plazos, penas, costos ni excepciones.
6. No des estrategias para ganar un asunto ni opiniones sobre el caso de la persona: explica que dice el texto y deja que decida.
7. Maximo 8 lineas. Sin titulos, sin encabezados Markdown, sin negritas.
8. Si el usuario solo saluda o pregunta que puedes hacer, responde corto y ofrece 2 ejemplos de duda real.`;

/** "Código Penal Federal" -> "Penal Federal": las sugerencias tienen que caber en un chip. */
function nombreCorto(nombre: string): string {
  return nombre.replace(/^c[oó]digo(s)?\s+/i, '').replace(/^constituci[oó]n\s+/i, 'Constitución ');
}

/**
 * Preguntas de seguimiento del chat. Solo salen de los articulos que YA encontramos
 * en esta ronda, para que tocarlas tenga respuesta inmediata en lugar de mandar al
 * usuario a una pregunta que el acervo no puede contestar.
 */
export function sugerenciasDe(fuentes: FuenteAsistente[]): string[] {
  if (fuentes.length === 0) return [];
  const primeras = fuentes.slice(0, 3);
  const sugeridas: string[] = [];
  for (const f of primeras.slice(1)) {
    sugeridas.push(`¿Qué dice el artículo ${f.numero} de ${nombreCorto(f.codigoNombre)}?`);
  }
  const numero = primeras[0].numero;
  if (/^\d/.test(numero)) {
    const libros = new Set(primeras.map((f) => f.codigoNombre));
    if (libros.size > 1) {
      sugeridas.push(`¿En qué libros está el artículo ${numero}?`);
    } else {
      sugeridas.push(`¿Qué más dice el libro sobre el artículo ${numero}?`);
    }
  } else {
    sugeridas.push(
      `¿Qué dice el artículo ${numero} de ${nombreCorto(primeras[0].codigoNombre)}?`,
    );
  }
  return [...new Set(sugeridas)].slice(0, 3);
}

/** Bloque de contexto: las fuentes numeradas, tal como las vera el modelo. */
export function construirContexto(fuentes: FuenteAsistente[]): string {
  const bloques = fuentes.map(
    (f) =>
      `[${f.n}] ${f.codigoNombre} — artículo ${f.numero}${f.vigente ? '' : ' (DEROGADO)'}\n${f.texto}`,
  );
  return `FUENTES DEL ACERVO (unica informacion que puedes usar):\n\n${bloques.join('\n\n')}`;
}

function limpiarHistorial(historial: Turno[]): Turno[] {
  return historial
    .filter((t) => (t.rol === 'usuario' || t.rol === 'asistente') && typeof t.texto === 'string' && t.texto.trim())
    .slice(-MAX_TURNOS_HISTORIAL)
    .map((t) => ({ rol: t.rol, texto: t.texto.slice(0, 1200) }));
}

// ---------- Orquestacion ----------

export interface OpcionesPreguntar {
  /** Inyectable para pruebas (evita llamar al proveedor real). */
  generar?: Generador;
  senal?: AbortSignal;
}

/** Respuesta cuando no hay nada en el acervo: no se gasta cuota de IA. */
function respuestaSinFuentes(pregunta: string): string {
  const termino = normalizarClave(pregunta).slice(0, 60) || 'eso';
  return (
    `No encontré «${termino.toLowerCase()}» en los libros del acervo. ` +
    'Prueba con otras palabras, o busca por número de artículo (por ejemplo "art 151 penal federal").'
  );
}

export async function preguntar(
  entrada: PreguntaAsistente,
  emisor: EmisorAsistente,
  opciones: OpcionesPreguntar = {},
): Promise<void> {
  const pregunta = entrada.pregunta.trim().replace(/\s+/g, ' ').slice(0, MAX_PREGUNTA);
  if (!pregunta) {
    emisor.error('falta_pregunta');
    return;
  }

  let fuentes: FuenteAsistente[];
  try {
    fuentes = await recuperarFuentes(pregunta);
  } catch (e) {
    console.error('[asistente] fallo la recuperacion:', e);
    emisor.error('error_interno');
    return;
  }

  if (fuentes.length === 0) {
    const texto = respuestaSinFuentes(pregunta);
    emisor.token(texto);
    emisor.fin({ pregunta, fuentes: [], sinFuentes: true, sugerencias: [] });
    return;
  }

  // Las citas se mandan antes de generar: la app ya puede mostrar los enlaces
  // mientras el modelo escribe.
  for (const f of fuentes) emisor.fuente(f);

  const turnos: Turno[] = [
    ...limpiarHistorial(entrada.historial),
    { rol: 'usuario', texto: `${construirContexto(fuentes)}\n\nPREGUNTA: ${pregunta}` },
  ];

  try {
    await (opciones.generar ?? generarConLlm)({
      sistema: SISTEMA,
      turnos,
      senal: opciones.senal,
      onFragmento: (fragmento) => emisor.token(fragmento),
    });
    emisor.fin({ pregunta, fuentes, sinFuentes: false, sugerencias: sugerenciasDe(fuentes) });
  } catch (e) {
    const codigo = e instanceof ErrorLlm ? e.codigo : 'error_interno';
    if (!(e instanceof ErrorLlm) || e.codigo !== 'lm_cancelado') {
      console.error(`[asistente] ${codigo}:`, (e as Error).message);
    }
    emisor.error(codigo);
  }
}

/** Lo que la app consulta para saber si puede ofrecer el chat. La llave nunca se expone. */
export function describirEstado(): { listo: boolean; proveedor: string | null; modelo: string | null } {
  // Se pasa por configLlm() para no duplicar aqui el modelo por defecto: si algun
  // dia cambia, el estado y la llamada real tienen que decir el mismo.
  const cfg = configLlm();
  if (!cfg) return { listo: false, proveedor: null, modelo: null };
  return { listo: true, proveedor: cfg.proveedor, modelo: cfg.modelo };
}
