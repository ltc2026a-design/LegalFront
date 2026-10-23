// Zona 6 — parser de HTML "estilo Cámara de Diputados".
//
// Este modulo lo usan TANTO el conector federal real como el conector de
// fixtures, de modo que el fixture (offline) ejercita el MISMO codigo de
// parseo que se usaria contra diputados.gob.mx.
//
// FORMATO QUE SE ASUME (ver tambien conector-diputados.ts):
//   * Cabeceras de seccion ocupan su propia linea y empiezan por la palabra
//     clave: LIBRO / TITULO / CAPITULO / SECCION (con o sin acentos), seguidas
//     de un numero en romano o en espanol ("PRIMERO", "UNICO") y, opcionalmente,
//     ":" y el nombre ("TITULO SEGUNDO: DE LA SOBERANIA NACIONAL").
//   * Cada articulo empieza por la etiqueta "ARTICULO <numero>" donde <numero>
//     es arabe con sufijo ordinal ("1o", "14o", "1°") y puede levar sufijos
//     "BIS", "TER", "QUATER", ... o letras ("47 A"). El resto de esa linea y las
//     lineas siguientes, hasta la proxima etiqueta, son el texto del articulo.
//   * Se ignora todo lo anterior al primer marcador de seccion/articulo (portada,
//     "GOBIERNO DE MEXICO", indices, etc.).
import * as cheerio from 'cheerio';
import {
  type ArticuloNormalizado,
  type CodigoNormalizado,
  type ResultadoNormalizado,
  type SeccionNormalizada,
  type TipoSeccionNormalizada,
  claveSeccion,
} from './tipos.js';

/** Profundidad canonica de cada tipo de seccion (para mantener la pila de jerarquia). */
const NIVEL_SECCION: Record<TipoSeccionNormalizada, number> = {
  libro: 1,
  titulo: 2,
  capitulo: 3,
  seccion: 4,
};

const CABECERA_RE = /^(LIBRO|T[IÍ]TULO|CAP[IÍ]TULO|SECCI[ÓO]N)\b[:.\s]*(.*)$/i;

/** Sufijos latinos que acompanan al numero de un articulo ("17 BIS", "3 TER"...). */
const SUFIJOS_ARTICULO = new Set([
  'bis',
  'ter',
  'quater',
  'quinq',
  'quinquies',
  'sexies',
  'septies',
  'octies',
  'novies',
  'decies',
  'undecies',
  'duodecies',
]);

function tipoDeCabecera(kw: string): TipoSeccionNormalizada {
  const k = kw.toUpperCase();
  if (k.startsWith('LIBRO')) return 'libro';
  if (k.startsWith('T')) return 'titulo';
  if (k.startsWith('CAP')) return 'capitulo';
  return 'seccion';
}

/** "1o"/"1°"/"14" -> "1"/"14". Los romanos se dejan tal cual. */
function normalizarNumeroArticulo(token: string): string {
  return token.replace(/[.°º]$/, '').replace(/(\d)[oa]$/i, '$1');
}

/** Decodifica un numero romano simple; devuelve null si no es romano valido. */
function romanoAEntero(s: string): number | null {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const str = s.toUpperCase();
  if (!str || !/^[IVXLCDM]+$/.test(str)) return null;
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const cur = map[str[i]];
    const next = map[str[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

export interface EtiquetaArticulo {
  numero: string;
  /** Resto de la linea que pertenece al cuerpo del articulo (puede ser ''). */
  cuerpoInicial: string;
}

/**
 * Reconoce "ARTICULO 1o. texto..." / "ARTICULO 17 BIS ..." y devuelve el numero
 * normalizado y el inicio del cuerpo. Devuelve null si la linea no es un articulo.
 */
export function parsearEtiquetaArticulo(linea: string): EtiquetaArticulo | null {
  const m = linea.match(/^ART[ÍI]CULO[S]?\s+(.+)$/i);
  if (!m) return null;
  const tokens = m[1].split(/\s+/);
  const partes: string[] = [];

  const first = tokens[0] ?? '';
  if (!/^([0-9]+[oa]?[.°º]?|[IVXLCDM]+[.]?)$/i.test(first)) return null;
  partes.push(normalizarNumeroArticulo(first));

  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i].replace(/\.$/, '');
    const tl = t.toLowerCase();
    const esSufijo = SUFIJOS_ARTICULO.has(tl);
    const esLetra = /^[a-z]$/.test(tl);
    const esRomano = romanoAEntero(t) !== null;
    if (!esSufijo && !esLetra && !esRomano) break;
    partes.push(t.toUpperCase());
    i++;
  }

  const numero = partes.join(' ').replace(/\s+/g, ' ').trim();
  const cuerpoInicial = tokens.slice(i).join(' ').trim();
  return { numero, cuerpoInicial };
}

/** Devuelve las lineas "logicas" del documento: un separador por cada salto de bloque. */
function lineasHtml(html: string): string[] {
  const raw = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td)[^>]*>/gi, '\n');
  const $ = cheerio.load(raw);
  const texto = ($('body').text() || $.root().text() || '')
    // decodifica los HTML entities restantes
    .replace(/&nbsp;/gi, ' ');
  return texto
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

/** Numero/identificador de una cabecera: primer token tras la palabra clave. */
function numeroDeCabecera(resto: string): string {
  const hastaDosPuntos = resto.split(/[:.-]/)[0] ?? resto;
  const tok = hastaDosPuntos.trim().split(/\s+/)[0] ?? '';
  return tok || resto.trim();
}

/**
 * Parsea el HTML y produce el arbol de secciones + los articulos normalizados.
 * `codigo` aporta los metadatos del documento (los conectores los conocen).
 */
export function parsearResultado(html: string, codigo: CodigoNormalizado): ResultadoNormalizado {
  const lineas = lineasHtml(html);

  const raices: SeccionNormalizada[] = [];
  // Pila de [nivel, clave, nodo] que representa la ruta de secciones activa.
  const pila: { nivel: number; clave: string; nodo: SeccionNormalizada }[] = [];
  const articulos: ArticuloNormalizado[] = [];

  // Articulo en construccion (acumulamos lineas hasta la siguiente etiqueta).
  let articuloActual: { numero: string; partes: string[]; ruta: string[] } | null = null;

  function cerrarArticulo(): void {
    if (!articuloActual) return;
    articulos.push({
      numero: articuloActual.numero,
      texto: articuloActual.partes.join(' ').replace(/\s+/g, ' ').trim(),
      rutaSecciones: articuloActual.ruta,
      vigente: true,
    });
    articuloActual = null;
  }

  for (const linea of lineas) {
    const art = parsearEtiquetaArticulo(linea);
    if (art) {
      cerrarArticulo();
      articuloActual = {
        numero: art.numero,
        partes: art.cuerpoInicial ? [art.cuerpoInicial] : [],
        ruta: pila.map((p) => p.clave),
      };
      continue;
    }

    const cab = linea.match(CABECERA_RE);
    // Una cabecera valida no debe empezar por "Articulo" ni ser una frase larga.
    if (cab && linea.length <= 140) {
      cerrarArticulo();
      const tipo = tipoDeCabecera(cab[1]);
      const resto = cab[2] ?? '';
      const numero = numeroDeCabecera(resto);
      const nodo: SeccionNormalizada = { tipo, numero, nombre: linea, children: [] };
      const nivel = NIVEL_SECCION[tipo];
      while (pila.length && pila[pila.length - 1].nivel >= nivel) pila.pop();
      const padre = pila[pila.length - 1];
      if (padre) padre.nodo.children.push(nodo);
      else raices.push(nodo);
      const clave = claveSeccion(tipo, numero);
      pila.push({ nivel, clave, nodo });
      continue;
    }

    // Linea normal: pertenece al articulo abierto o se descarta (prefacio, indice...).
    if (articuloActual) articuloActual.partes.push(linea);
  }
  cerrarArticulo();

  return { codigo, secciones: raices, articulos };
}
