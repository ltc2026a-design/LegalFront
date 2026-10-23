// Importador de textos LEGALES COMPLETOS desde el espejo "Lex MX"
// (github.com/ingteranalvarez/lex-mx): 317 leyes federales mexicanas en
// Markdown, reconstruidas a DIARIO desde los PDFs oficiales de la Camara de
// Diputados (diputados.gob.mx/LeyesBiblio).
//
// Se eligio este espejo tras descartar github.com/JoshuaPozos/leyes-mexicanas-
// markdown porque su AST pierde el primer parrafo de muchos articulos (el
// Art. 1 del CPF directamente no existe ahi) y fragmenta fracciones como
// articulos propios.
//
// Uso:
//   npm run importar:md -- prisma/data/lexmx/CPF.md codigo-penal-federal --seco
//   npm run importar:md -- prisma/data/lexmx/CPF.md codigo-penal-federal --limpiar
//
// Flags:
//   --seco        solo analiza y reporta; no escribe nada.
//   --limpiar     reconstruye el libro desde cero (borra articulos, arbol e
//                 historial de importaciones previas; respeta pendientes).
//   --reescribir  aplica los textos en silencio (sin bandeja de revision) y
//                 corrige el historial de la importacion anterior. Sin esta
//                 bandera cada cambio entra a historial como edicion_manual
//                 aprobada, igual que una carga desde el panel.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma.js';
import { cargarLibro, type ArticuloImport, type Nivel, type TipoNivel } from './lib/cargar-libro.js';
import { resolverArchivoDatos } from './lib/ruta-datos.js';

/* ------------------------------ parsing ------------------------------ */

const RE_BOLD = /^\*\*\s*(.+?)\s*\*\*\s*(.*)$/;
const RE_ARTICULO = /^(?:art[ií]culo|art\.)\s+(.+)$/i;
const RE_TRANSITORIO = /^transitorio\s+(.+)$/i;
const RE_HEADING_TRANS = /^(u?ltimas\s+)?(disposiciones?\s+)?transitorias?$/i;
const ORDINALES_JERARQUIA: TipoNivel[] = ['libro', 'titulo', 'capitulo', 'seccion'];

// Anotaciones editoriales del PDF oficial ("Parrrafo reformado DOF 10-06-2011"):
// no son texto normativo y contaminarian la busqueda.
const RE_ANOTACION =
  /^(p[aá]rrafo|fracci[oó]n|fracciones|inciso|incisos|apartado|numeral|numerales|libro|t[ií]tulo|t[ií]tulos|cap[ií]tulo|cap[ií]tulos|secci[oó]n|secciones|denominaci[oó]n|entrada en vigor|nota|notas|disposici[oó]n|disposiciones|decreto|decretos|reforma|reformado|reformados|adicionado|adicionados|modificado|modificados|derogado|derogados|suprimido|suprimidos|art[ií]culos?\s+(reformados?|adicionados?|modificados?|derogados?|sustituidos?))/i;
const RE_FECHA_DOF = /(DOF|D\.O\.F\.|Diario Oficial)[^A-Za-z0-9]{0,10}\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/i;

function esAnotacion(linea: string): boolean {
  const l = linea.trim();
  if (!l) return false;
  if (/^ú?ltimas\s+reformas?\b/i.test(l)) return true;
  return RE_ANOTACION.test(l) && RE_FECHA_DOF.test(l);
}

const SUFIJOS_ARTICULO = 'bis|ter|qu[aá]ter|quinquies|decies|undecies|duodecies|octies|novies|vicies';

function normalizarNumero(bruto: string): string {
  let n = bruto.trim();
  n = n.replace(/^(?:art[ií]culo|art\.)\s+/i, '');
  // "1o", "1°", "1º" -> "1" (el indice ordinal no es un digito, \\b no basta).
  n = n.replace(/(\d)\s*[oº°](?![a-záéíóúñ])/gi, '$1 ');
  n = n.replace(/\s*[.:\-–—]+\s*$/, '');
  n = n.replace(/\s+/g, ' ').trim();
  // Formato oficial camero: "215 A", "145 BIS", "47 A BIS 3"
  n = n.replace(/^(\d+)\s*-\s*([A-D])\b/i, '$1 $2');
  n = n.replace(new RegExp(`^(\\d+)\\s*-\\s*(${SUFIJOS_ARTICULO})\\b`, 'i'), '$1 $2');
  n = n.replace(new RegExp(`\\s(${SUFIJOS_ARTICULO})\\b`, 'gi'), ' $1');
  return n.toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizarNumeroJerarquia(bruto: string): string {
  return bruto.replace(/^(?:art[ií]culo|art\.)\s+/i, '').replace(/\s*[.:\-–—]+\s*$/, '').replace(/\s+/g, ' ').trim();
}

interface Parseo {
  meta: { sigla: string; titulo: string; ultimaReforma: string; fuentePdf: string };
  articulos: ArticuloImport[];
}

// Ordinales escritos con palabra (= articulos transitorios). El grupo final
// admite los compuestos ("Décimo Octavo"), que el espejo corta a la mitad.
const ORDINALES_PALABRA = /^(primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|novenos?|d[eé]cimo|und[eé]cimo|duod[eé]cimo|decimoprimero|decimosegundo|vig[eé]sim[oa]|trig[eé]sim[o19]?|cuadrag[eé]sim[oa]|quinquag[eé]sim[oa]|sexag[eé]sim[oa]|septuag[eé]sim[oa]|octog[eé]sim[oa]|nonag[eé]sim[oa]|cent[eé]sim[oa]|único|unico|d[eé]cim[oi]\s?(?:primer[oa]|segund[oa]|tercer[oa]|cuart[oa]|quint[oa]|sext[oa]|s[eé]ptim[oa]|octav[oa]|noven[oa]))(\s+(primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|novenos?))?\b/i;

function esOrdinalPalabra(base: string): boolean {
  const sin = base.replace(/^TRANSITORIO\s+/i, '');
  return ORDINALES_PALABRA.test(sin) && !/^\d/.test(sin);
}

// "TRANSITORIO UNICO (3)" -> "TRANSITORIO UNICO"; sin acentos para comparar
// "TRANSITORIO UNICO" con "TRANSITORIO ÚNICO" (el PDF usa ambas grafias).
function baseDe(numero: string): string {
  return numero
    .replace(/ \(\d+\)$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

const RUTA_TRANSITORIOS: Nivel[] = [{ tipo: 'seccion', numero: 'TRANSITORIOS', nombre: 'Disposiciones Transitorias' }];

export function parsearMarkdown(contenido: string): Parseo {
  const lineas = contenido.replace(/\r\n?/g, '\n').split('\n');
  const meta = { sigla: '', titulo: '', ultimaReforma: '', fuentePdf: '' };
  let cuerpo = 0;
  if (lineas[0]?.trim() === '---') {
    for (let i = 1; i < lineas.length; i++) {
      if (lineas[i].trim() === '---') {
        cuerpo = i + 1;
        break;
      }
      const m = /^(\w+):\s*"?(.*?)"?\s*$/.exec(lineas[i]);
      if (!m) continue;
      if (m[1] === 'sigla') meta.sigla = m[2];
      if (m[1] === 'titulo') meta.titulo = m[2];
      if (m[1] === 'ultima_reforma') meta.ultimaReforma = m[2];
      if (m[1] === 'fuente_pdf') meta.fuentePdf = m[2];
    }
  }

  const articulos: ArticuloImport[] = [];
  const usados = new Map<string, number>();
  const bases = new Set<string>();
  const pila: Nivel[] = [];
  let actual: { numero: string; partes: string[] } | null = null;

  // El PDF repite el nombre de la ley como encabezado de pagina (centenares de
  // veces); esas lineas no son texto del articulo.
  const moblaje = new Set<string>();
  {
    const cuenta = new Map<string, number>();
    for (const l of lineas.slice(cuerpo)) {
      const t = l.trim();
      if (t.length < 6 || t.length > 90) continue;
      if (/[a-záéíóúñü]/.test(t) || !/[A-ZÁÉÍÓÚÑ]/.test(t)) continue;
      cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
    }
    for (const [t, n] of cuenta) if (n >= 12) moblaje.add(t);
  }

  const cerrar = () => {
    if (!actual) return;
    const texto = actual.partes
      // Los asteriscos de la negrita markdown no son parte del texto legal.
      .map((p) => p.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().replace(/\.+\s*$/, (s) => (s.trim() === '.' ? '.' : s)))
      .filter(Boolean)
      .join('\n');
    // El PDF oficial trae ciertos articulos derogados como cabecera suelta sin
    // cuerpo (ej. Art. 26 de la Constitucion).
    const final = texto || (/^\d/.test(actual.numero) ? '(Se deroga).' : '');
    if (final) articulos.push({ numero: actual.numero, texto: final, ruta: pila.map((n) => ({ ...n })) });
    actual = null;
  };

  for (let i = cuerpo; i < lineas.length; i++) {
    const t = lineas[i].trim();
    if (!t) continue;
    if (moblaje.has(t) && !t.startsWith('#') && !t.startsWith('**')) continue;

    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const titulo = h[2].trim();
      cerrar();
      if (RE_HEADING_TRANS.test(titulo)) {
        pila.length = 0;
        pila.push(...RUTA_TRANSITORIOS);
        continue;
      }
      const low = titulo.toLowerCase();
      const tipo: TipoNivel | null = /^libro\b/.test(low) ? 'libro' : /^t[ií]tulo\b/.test(low) ? 'titulo' : /^cap[ií]tulo\b/.test(low) ? 'capitulo' : /^secci[oó]n\b/.test(low) ? 'seccion' : null;
      if (tipo) {
        const resto = titulo.replace(/^(libro|t[ií]tulo|cap[ií]tulo|secci[oó]n)\s+/i, '');
        const numero = normalizarNumeroJerarquia(resto) || titulo.slice(0, 40);
        while (pila.length && ORDINALES_JERARQUIA.indexOf(pila[pila.length - 1].tipo) >= ORDINALES_JERARQUIA.indexOf(tipo)) pila.pop();
        pila.push({ tipo, numero, nombre: titulo });
      }
      continue;
    }

    const bold = RE_BOLD.exec(t);
    if (bold) {
      const cab = bold[1];
      let cola = bold[2].replace(/^\s*[.:–—-]*\s*/, '').trim();
      const am = RE_ARTICULO.exec(cab);
      const tm = am ? null : RE_TRANSITORIO.exec(cab);
      if (am || tm) {
        let base = normalizarNumero((am ?? tm)![1]);
        if (!base) continue;
        // El espejo corta la negrita antes del segundo termino del numero
        // ("**Artículo Décimo** Octavo.", "**Artículo 139** Quáter.-"), dejando
        // el resto como si fuera texto. Se reincorpora el termino perdido.
        const seg = /^([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\s*[.:]\s*/.exec(cola);
        if (seg) {
          const token = normalizarNumero(seg[1]);
          const esSufijo = new RegExp(`^(${SUFIJOS_ARTICULO})$`, 'i').test(token);
          if (esOrdinalPalabra(base) ? esOrdinalPalabra(token) : esSufijo) {
            base = `${base} ${token}`;
            cola = cola.slice(seg[0].length).trim();
          }
        }
        if (/^\d/.test(base) && !/[.]$/.test(cab) && /^[a-záéíóúñ]/.test(cola)) {
          // Cabecera sin punto cuyo resto empieza en minúscula: es el final de
          // un parrafo ("**Artículo 105** fracción II de la misma..."), no un articulo.
          if (actual) actual.partes.push(t);
          continue;
        }
        // "Articulo Primero/Unico" = disposicion transitoria (el codigo regular
        // siempre usa numeros). Se le pone el prefijo para que sea legible.
        if (esOrdinalPalabra(base)) base = `TRANSITORIO ${base}`;
        // Cada decreto de reforma trae sus propios transitorios, asi que un
        // mismo ordinal se repite: se numera (2), (3)... en vez de descartarlo.
        // Excepcion: la cabecera del PDF aparece dos veces ("TRANSITORIO
        // PRIMERO" suelto y "**Articulo Primero.**"); esa se fusiona.
        if (actual && actual.partes.length === 0 && baseDe(actual.numero) === baseDe(base)) {
          if (cola) actual.partes.push(cola);
          continue;
        }
        if (tm || esOrdinalPalabra(base)) {
          pila.length = 0;
          pila.push(...RUTA_TRANSITORIOS);
        }
        cerrar();
        bases.add(base);
        const c = (usados.get(base) ?? 0) + 1;
        usados.set(base, c);
        actual = { numero: c === 1 ? base : `${base} (${c})`, partes: cola ? [cola] : [] };
        continue;
      }
      // **Fracción III** / negritas dentro del articulo: es texto normal.
      if (actual) actual.partes.push(t);
      continue;
    }

    // Cabeceras de transitorio sin negritas ("TRANSITORIO PRIMERO" suelto).
    const trans = /^TRANSITORIO\s+(.+)$/i.exec(t);
    const transNum = trans ? normalizarNumero(trans[1]) : '';
    if (trans && esOrdinalPalabra(transNum) && !/[,;:]/.test(transNum) && t.length < 60 && !/[.;]$/.test(t)) {
      const base = `TRANSITORIO ${transNum}`;
      cerrar();
      bases.add(base);
      const c = (usados.get(base) ?? 0) + 1;
      usados.set(base, c);
      pila.length = 0;
      pila.push(...RUTA_TRANSITORIOS);
      actual = { numero: c === 1 ? base : `${base} (${c})`, partes: [] };
      continue;
    }

    // Cabeceras de articulo derogado sin negritas ("Articulo 26." suelto con
    // su nota de derogacion): el PDF oficial las muestra asi y aqui se
    // convierten en el articulo "(Se deroga)".
    const suelta = /^(?:ART[iÍ]CULO|Art[ií]culo|ART\.)\s+([\w\s°.-]+?)\s*[.:]\s*$/.exec(t);
    if (suelta && !/^(TRANSITORIO|DETRANSMISI[oÓ]N)/i.test(t)) {
      let base = normalizarNumero(suelta[1]);
      if (base && /^\d/.test(base) && bases.has(base)) continue;
      if (base) {
        if (esOrdinalPalabra(base)) base = `TRANSITORIO ${base}`;
        // No se reinicia la pila de jerarquia: estas cabeceras sueltas aparecen
        // dentro del cuerpo del codigo y deben conservar su libro/titulo/capitulo.
        cerrar();
        bases.add(base);
        const c = (usados.get(base) ?? 0) + 1;
        usados.set(base, c);
        actual = { numero: c === 1 ? base : `${base} (${c})`, partes: [] };
        continue;
      }
    }

    if (esAnotacion(t)) continue;
    if (!actual) continue;
    if (/^(TEXTO VIGENTE|C[oó]digo Publicado|Nuevo C[oó]digo Publicado|Publicada en el|Fe de erratas)/i.test(t)) continue;
    actual.partes.push(t);
  }
  cerrar();

  return { meta, articulos };
}

/* ---------------------------- importacion ---------------------------- */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const seco = args.includes('--seco');
  const reescribir = args.includes('--reescribir');
  const limpiar = args.includes('--limpiar');
  const [archivo, slug] = args.filter((a) => !a.startsWith('--'));
  if (!archivo || !slug) {
    console.error('Uso: npm run importar:md -- <archivo.md> <slug-del-codigo> [--seco|--reescribir|--limpiar]');
    process.exit(1);
  }

  const { meta, articulos: importados } = parsearMarkdown(readFileSync(resolverArchivoDatos(archivo), 'utf8'));
  console.log(`[importar:md] ${meta.sigla}: ${importados.length} articulos detectados | ultima reforma ${meta.ultimaReforma || '?'}`);

  await cargarLibro(
    slug,
    {
      sigla: meta.sigla || 'LexMX',
      etiqueta: 'DOF',
      ultimaReforma: meta.ultimaReforma,
      procedencia: [
        `Fuente definitiva: PDF oficial Camara de Diputados: ${meta.fuentePdf || '?'}`,
        'Obtenido via espejo Lex MX (github.com/ingteranalvarez/lex-mx), actualizado a diario desde el PDF oficial',
      ],
    },
    importados,
    { seco, reescribir, limpiar },
  );
}

main()
  .catch((e) => {
    console.error('[importar:md] fallo:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
