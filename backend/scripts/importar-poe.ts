// Importador de los LIBROS ESTATALES Y MUNICIPALES DE QUINTANA ROO a partir del
// PDF consolidado oficial del Congreso del Estado (documentos.congresoqroo.gob.mx)
// o del Codigo correspondiente del Periódico Oficial del Estado (POE).
//
// El PDF se convierte a texto con `pdftotext -enc UTF-8` (poppler). Sin -enc el
// PDF emite Latin-1 y los acentos se rompen, lo que contaminaria la busqueda.
//
// Uso:
//   npm run importar:poe -- prisma/data/qroo/codigo-civil-qroo.pdf codigo-civil-qroo --seco
//   npm run importar:poe -- prisma/data/qroo/codigo-civil-qroo.pdf codigo-civil-qroo --limpiar
//
// Flags:
//   --seco        solo analiza y reporta; no escribe nada.
//   --limpiar     reconstruye el libro desde cero (borra articulos, arbol e
//                 historial de importaciones previas; respeta pendientes).
//   --reescribir  aplica los textos en silencio (sin bandeja de revision).
//
// El documento consolidado del Congreso trae, despues del cuerpo del codigo, los
// transitorios de cada decreto de reforma y un "HISTORIAL DE DECRETOS". Ese apendice
// NO es texto normativo vigente, asi que el analisis se detiene al encontrarlo.
import 'dotenv/config';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { prisma } from '../src/lib/prisma.js';
import { cargarLibro, type ArticuloImport, type Nivel, type TipoNivel } from './lib/cargar-libro.js';
import { resolverArchivoDatos } from './lib/ruta-datos.js';

/* ------------------------------ texto ------------------------------ */

const RANK: Record<TipoNivel, number> = { libro: 0, titulo: 1, capitulo: 2, seccion: 3 };

/// "PARTE" comparte nivel con LIBRO: en el Penal el PDF pone "LIBRO SEGUNDO" y
/// debajo "PARTE ESPECIAL".
const RE_JERARQUIA = /^(libro|parte|t[ií]tulo|cap[ií]tulo|secci[oó]n|subsecci[oó]n|disposici[oó]n(?:es)?)\s+([\wÁÉÍÓÚÑáéíóúñ.]+(?:-[\wÁÉÍÓÚÑáéíóúñ.]+)*)\s*(.*)$/i;

/// Cabecera de articulo: "Artículo 1.-", "ARTICULO 1°.", "Artículo 179 Bis.",
/// "ARTÍCULO 5o-A.-", "ARTÍCULO 5.-B.", "ARTICULO 8o-BIS.", "ARTÍCULO PRIMERO.".
/// Los codigos fiscales de QR mezclan las dos grafias ("5o-A" y "5.-B") para el
/// mismo articulo agregado, asi que el separador puede ser guion o punto.
const SUFIJO_ART = 'bis|ter|qu[aá]ter|quintus|quinquies|sexies|septies|decies|undecies|duodecies|vicies';
const NUMERO_ART = `(?:\\d+(?:[º°]|o(?![a-záéíóúñ]))?(?:[ .:\\-–]*(?:${SUFIJO_ART}|[a-z]|\\d+)\\b)*)`;
const ORDINAL_ART = '[úu]nico|primero?[oa]?|segund[oa]|tercero?[oa]?|cuart[oa]|quint[oa]|sext[oa]|s[eé]ptim[oa]|octav[oa]|noven[oa]|d[eé]cim[oi](?:o|a)?|und[eé]cim[oi]|duod[eé]cim[oi]|decimoprimero|decimosegundo|vig[eé]sim[oa](?:\\s+primer[oa]|\\s+segund[oa]|\\s+tercer[oa]|\\s+cuart[oa]|\\s+quint[oa]|\\s+sext[oa]|\\s+s[eé]ptim[oa]|\\s+octav[oa]|\\s+noven[oa])?|trig[eé]sim[oa]|cuadrag[eé]sim[oa]|quinquag[eé]sim[oa]|sexag[eé]sim[oa]|septuag[eé]sim[oa]|octog[eé]sim[oa]|nonag[eé]sim[oa]|cent[eé]sim[oa]';
const RE_ARTICULO = new RegExp(`^art[ií]culo\\s+((?:${NUMERO_ART}|${ORDINAL_ART})\\s*)(?:[.:–—-]+\\s*|$)`, 'i');

/// Anotacion editorial del POE: "Párrafo reformado POE 04-07-2017",
/// "Fracción adicionada POE 16-12-2024", "Denominación reformada POE ...".
const RE_ANOTACION =
  /^(?:(?:p[áa]rrafo|p[áa]rrafos|fracci[oó]n|fracciones|inciso|incisos|apartado|apartados|numeral|numerales|denominaci[oó]n|nota|v\.?\s?f\.?\s?a\.?|libro|t[ií]tulo|cap[ií]tulo|secci[oó]n|art[ií]culos?|art[ií]culo|disposici[oó]n|disposiciones|decreto|decretos|reforma|reformado|reformados|reformadas|adicionado|adicionados|adicionada|adicionadas|derivado|derogado|derogados|derogadas|modificado|modificados|sustituido|sustituidos|suprimido|suprimidos|rectificado|texto)\s+(?:del\s+(?:art[ií]culo|decreto)\s+)?(?:reformad[oa]s?|adicionad[oa]s?|adid[oa]s?|derogad[oa]s?|modificad[oa]s?|sustituid[oa]s?|suprimid[oa]s?|rectificad[oa]s?|derivado|en\s+vigor)\b)/i;

const RE_FECHA_POE = /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g;

/// Fin del cuerpo normativo: ahi empiezan los transitorios de los decretos de
/// reforma y la tabla historica.
const RE_APENDICE = /^(art[ií]culos?\s+transitorios\s+de\s+decretos|decretos\s+de\s+reforma|historial\s+de\s+decretos|decreto\s+\d+\s+de\s+la\s+.+legislatura)/i;

/// Cabecera de la sección de transitorios: "TRANSITORIOS", "T R AN S IT O R I O S:",
/// "TRANSITORIO", "DISPOSICIONES TRANSITORIAS". Se normaliza la linea porque el PDF
/// tambalea los espacios entre letras.
function esEncabezadoTransitorios(linea: string): boolean {
  const s = sinAcentos(linea).toUpperCase().replace(/\s+/g, '').replace(/[:.]+$/, '');
  return /^(?:DISPOSICIONES)?TRANSITOR(?:IO|IA)S?$/.test(s);
}

const RE_PAGINA = /^p[áa]gina\s+\d+\s+de\s+\d+$/i;

/// Cierre del decreto: la firma no es texto normativo. Solo vale dentro de la
/// seccion de transitorios, donde el cuerpo del libro ya termino.
const RE_FIRMA = /^sal[oó]n\s+de\s+sesiones\b/i;
const RUTA_TRANSITORIOS: Nivel[] = [{ tipo: 'seccion', numero: 'TRANSITORIOS', nombre: 'Disposiciones transitorias' }];

const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

function sinAcentos(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/// "23 de julio de 2026" -> "2026-07-23"
function fechaTextoPo(linea: string): string | null {
  const m = /el\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i.exec(linea);
  if (!m) return null;
  const mes = MESES[sinAcentos(m[2].toLowerCase())];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}

/// "31-05-2023" (DD-MM-AAAA del POE) -> Date UTC; acepta AAAA si viene suelto.
function fechaPoADate(bruta: string): Date | null {
  const p = bruta.trim().split(/[/.-]/);
  if (p.length !== 3) return null;
  const dia = Number(p[0]);
  const mes = Number(p[1]);
  let anio = Number(p[2]);
  if (p[2].length === 2) anio += anio > 60 ? 1900 : 2000;
  if (!dia || !mes || !anio || mes > 12 || dia > 31) return null;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function normalizarNumero(bruto: string): string {
  let n = bruto.trim().replace(/[:.]+$/, '');
  n = n.replace(/(\d)[º°]/g, '$1');
  // "6o" es el numeral ordinal del PDF, no parte del numero.
  n = n.replace(/(\d)o(?![a-záéíóúñ])/gi, '$1');
  n = n.replace(/[ \-–:.]+/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const ORDINAL_PALABRA = /^(u?nico|primer[oa]?|segund[oa]|tercer[oa]|cuart[oa]|quint[oa]|sext[oa]|s[eé]ptim[oa]|octav[oa]|noven[oa]|d[eé]cim[oi]|und[eé]cim[oi]|duod[eé]cim[oi]|vig[eé]sim[oa]|trig[eé]sim[oa]|cuadrag[eé]sim[oa]|quinquag[eé]sim[oa]|sexag[eé]sim[oa]|septuag[eé]sim[oa]|octog[eé]sim[oa]|nonag[eé]sim[oa]|cent[eé]sim[oa])(\s+(primer[oa]?|segund[oa]|tercer[oa]|cuart[oa]|quint[oa]|sexto|s[eé]ptimo|octavo|noven[oa]))?$/i;

function esOrdinalPalabra(n: string): boolean {
  return !/^\d/.test(n) && ORDINAL_PALABRA.test(n.replace(/^TRANSITORIO\s+/i, '').trim());
}

/// El PDF pone varias cabeceras en la misma linea fisica cuando son cortas
/// ("Artículo 3204.- Derogado. Artículo 3205.- Derogado."). Se parten para no
/// fusionar articulos, pero solo cuando detras de la cabecera queda texto Y lo
/// que va antes cierra una frase: "…en la forma establecida en el artículo 749.
/// Si sólo hubo buena fe…" es una cita dentro de un parrafo, no una cabecera.
function partirLinea(linea: string): string[] {
  const rec = /\s+(?=art[ií]culo\s+\d)/gi;
  const salida: string[] = [];
  let desde = 0;
  for (let m = rec.exec(linea); m; m = rec.exec(linea)) {
    const resto = linea.slice(m.index + m[0].length);
    const cab = RE_ARTICULO.exec(resto);
    if (!cab || !resto.slice(cab[0].length).trim()) continue;
    const antes = linea.slice(desde, m.index).trimEnd();
    // Precedente valido para cortar: una frase cerrada ("...Derogado.") o una
    // cabecera de jerarquia suelta ("CAPITULO VIII Trabajo... ARTICULO 37.- ...").
    if (antes && !/[.!:;)»"']$/.test(antes) && !RE_JERARQUIA.test(antes)) continue;
    salida.push(antes);
    desde = m.index + m[0].length;
  }
  salida.push(linea.slice(desde).trim());
  return salida.filter(Boolean);
}

export function parsearTextoPdf(contenido: string): { meta: { titulo: string; ultimaReforma: string }; articulos: ArticuloImport[] } {
  const crudas = contenido.replace(/\r\n?/g, '\n').split('\n');
  const lineas: string[] = [];
  for (const l of crudas) for (const p of partirLinea(l.trim())) lineas.push(p);

  const meta = { titulo: '', ultimaReforma: '' };
  for (const l of lineas.slice(0, 6)) {
    if (!meta.titulo && l.trim().length > 6) meta.titulo = l.trim();
    const f = fechaTextoPo(l);
    if (f && !meta.ultimaReforma) meta.ultimaReforma = f;
  }

  // Moblaje: el PDF repite el nombre de la ley como encabezado de pagina.
  const moblaje = new Set<string>();
  {
    const cuenta = new Map<string, number>();
    for (const t of lineas) {
      if (t.length < 6 || t.length > 90) continue;
      if (/[a-záéíóúñü]/.test(t) || !/[A-ZÁÉÍÓÚÑ]/.test(t)) continue;
      // "TRANSITORIOS" tambien sale en mayusculas y repetida (una vez por decreto
      // del apendice), pero es una cabecera normativa, no moblaje.
      if (esEncabezadoTransitorios(t) || RE_APENDICE.test(t) || RE_PAGINA.test(t)) continue;
      cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
    }
    for (const [t, n] of cuenta) if (n >= 10) moblaje.add(t);
  }

  const articulos: ArticuloImport[] = [];
  const usados = new Map<string, number>();
  const pila: Nivel[] = [];
  let actual: { numero: string; partes: string[]; fechas: Date[] } | null = null;
  let enTransitorios = false;

  const cerrar = () => {
    if (!actual) return;
    const texto = actual.partes
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
    const ultima = actual.fechas.reduce<Date | null>((max, d) => (!max || d > max ? d : max), null);
    if (texto) articulos.push({ numero: actual.numero, texto, ruta: pila.map((n) => ({ ...n })), fechaReforma: ultima });
    actual = null;
  };

  for (const t of lineas) {
    if (!t) continue;
    if (RE_APENDICE.test(t)) break;
    if (moblaje.has(t)) continue;
    if (RE_PAGINA.test(t)) continue;
    if (/^(?:esta\s+pagina|intentionally\s+left)/i.test(t)) continue;

    if (esEncabezadoTransitorios(t)) {
      cerrar();
      pila.length = 0;
      pila.push(...RUTA_TRANSITORIOS);
      enTransitorios = true;
      continue;
    }

    // "Salón de Sesiones..." clausura el decreto: lo que sigue son firmas.
    if (enTransitorios && RE_FIRMA.test(t)) {
      cerrar();
      enTransitorios = false;
      continue;
    }

    const j = RE_JERARQUIA.exec(t);
    if (j && t.length <= 120 && !/^(art[ií]culo)\b/i.test(t)) {
      const bruto = sinAcentos(j[1].toLowerCase());
      const tipo: TipoNivel = bruto === 'libro' || bruto === 'parte' ? 'libro' : bruto.startsWith('t') ? 'titulo' : bruto.startsWith('cap') ? 'capitulo' : 'seccion';
      const numeroRaw = j[2].replace(/[.:]+$/, '');
      if (!/^(preliminar|u?nico|primero?|primera|segundo|segunda|tercero?|tercera|cuarto|cuarta|quinto|quinta|sexto|sexta|s[eé]ptimo|s[eé]ptima|octavo|octava|noven[oa]|d[eé]cimo|und[eé]cimo|duod[eé]cimo|vig[eé]sim[oa]|trig[eé]sim[oa]|[ivxlcdm]+|\d+)$/i.test(sinAcentos(numeroRaw))) continue;
      cerrar();
      const nombre = `${j[1].trim().replace(/\s+/g, ' ')} ${numeroRaw}${j[3] ? ' ' + j[3].trim() : ''}`.replace(/\s+/g, ' ').trim();
      while (pila.length && RANK[pila[pila.length - 1].tipo] >= RANK[tipo]) pila.pop();
      pila.push({ tipo, numero: normalizarNumeroJerarquia(numeroRaw), nombre });
      enTransitorios = false;
      continue;
    }

    const a = RE_ARTICULO.exec(t);
    if (a) {
      let base = normalizarNumero(a[1]);
      // El numero puede ir unido al resto por el guion del PDF ("179-Bis").
      if (!base) continue;
      if (esOrdinalPalabra(base)) {
        base = `TRANSITORIO ${base.toUpperCase()}`;
        if (!enTransitorios) {
          pila.length = 0;
          pila.push(...RUTA_TRANSITORIOS);
          enTransitorios = true;
        }
      }
      // El separador del PDF a veces queda partido ("ARTÍCULO ÚNICO. - El...").
      const resto = t.slice(a[0].length).replace(/^[\s.:\-–—]+/, '').trim();
      if (actual && actual.partes.length === 0 && actual.numero === base) {
        if (resto) actual.partes.push(resto);
        continue;
      }
      cerrar();
      const c = (usados.get(base) ?? 0) + 1;
      usados.set(base, c);
      if (process.env.DEPURAR && c > 1) console.log('  REPECIDA', base, '|', JSON.stringify(t.slice(0, 70)), '| anterior sin cuerpo:', !actual);
      actual = { numero: c === 1 ? base : `${base} (${c})`, partes: resto ? [resto] : [], fechas: [] };
      continue;
    }

    if (esAnotacion(t)) {
      if (actual) for (const f of t.match(RE_FECHA_POE) ?? []) {
        const d = fechaPoADate(f);
        if (d) actual.fechas.push(d);
      }
      continue;
    }

    // Encabezado de transitorio suelto dentro de la seccion ("PRIMERO.- ...").
    if (enTransitorios) {
      const suelto = /^([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\s*[.:–—-]{1,2}\s+(.*)$/.exec(t);
      if (suelto && esOrdinalPalabra(suelto[1])) {
        cerrar();
        const base = `TRANSITORIO ${normalizarNumero(suelto[1])}`;
        const c = (usados.get(base) ?? 0) + 1;
        usados.set(base, c);
        actual = { numero: c === 1 ? base : `${base} (${c})`, partes: [suelto[2].replace(/^[\s.:\-–—]+/, '').trim()], fechas: [] };
        continue;
      }
    }

    if (!actual) continue;
    actual.partes.push(t);
  }
  cerrar();

  return { meta, articulos };
}

function normalizarNumeroJerarquia(bruto: string): string {
  return sinAcentos(bruto).toUpperCase().replace(/\s+/g, ' ').trim();
}

function esAnotacion(linea: string): boolean {
  const l = linea.trim();
  if (!l) return false;
  if (RE_ANOTACION.test(l)) return true;
  // Nota suelta que solo aporta la fecha de reforma del parrafo anterior.
  return /^(reformado|adicionado|adicionada|derogado|modificado|sustituido|suprimido|rectificado)\b/i.test(l) && RE_FECHA_POE.test(l);
}

/* ------------------------------- CLI ------------------------------- */

function asegurarTexto(archivoBruto: string): { archivo: string; contenido: string } {
  const archivo = resolverArchivoDatos(archivoBruto);
  if (archivo.toLowerCase().endsWith('.pdf')) {
    const txt = archivo.replace(/\.pdf$/i, '.txt');
    if (!existsSync(txt) || statSync(txt).mtimeMs < statSync(archivo).mtimeMs) {
      execFileSync('pdftotext', ['-enc', 'UTF-8', archivo, txt], { stdio: 'inherit' });
    }
    return { archivo, contenido: readFileSync(txt, 'utf8') };
  }
  return { archivo, contenido: readFileSync(archivo, 'utf8') };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const seco = args.includes('--seco');
  const reescribir = args.includes('--reescribir');
  const limpiar = args.includes('--limpiar');
  const [archivo, slug] = args.filter((a) => !a.startsWith('--'));
  if (!archivo || !slug) {
    console.error('Uso: npm run importar:poe -- <pdf|txt> <slug-del-codigo> [--seco|--reescribir|--limpiar]');
    process.exit(1);
  }

  const datos = asegurarTexto(archivo);
  const { meta, articulos } = parsearTextoPdf(datos.contenido);
  const numericos = articulos.filter((a) => /^\d+$/.test(a.numero));
  const transitorios = articulos.filter((a) => /^TRANSITORIO\b/i.test(a.numero));
  const sufijados = articulos.length - numericos.length - transitorios.length;
  console.log(`[importar:poe] ${meta.titulo || slug}`);
  console.log(`[importar:poe] ${articulos.length} articulos (${numericos.length} numerados, ${sufijados} con sufijo, ${transitorios.length} transitorios) | ultima reforma POE ${meta.ultimaReforma || '?'}`);

  // Diagnostico de integridad: la numeracion de un codigo mexicano es continua,
  // asi que un hueco o un duplicado delata un error de analisis.
  if (numericos.length) {
    const vistos = new Set<number>();
    const duplicados: number[] = [];
    for (const a of numericos) {
      const n = Number(a.numero);
      if (vistos.has(n)) duplicados.push(n);
      vistos.add(n);
    }
    const max = Math.max(...numericos.map((a) => Number(a.numero)));
    const huecos: number[] = [];
    for (let n = 1; n <= max; n++) if (!vistos.has(n)) huecos.push(n);
    const conFecha = articulos.filter((a) => a.fechaReforma).length;
    const vacios = articulos.filter((a) => a.texto.length < 12).length;
    console.log(`[importar:poe] numeracion 1..${max}: ${vistos.size} distintos | huecos ${huecos.length}${huecos.length ? ' (' + huecos.slice(0, 25).join(',') + ')' : ''} | duplicados ${duplicados.length}${duplicados.length ? ' (' + [...new Set(duplicados)].slice(0, 15).join(',') + ')' : ''}`);
    console.log(`[importar:poe] con fecha de reforma ${conFecha} | textos cortos ${vacios} | secciones del arbol ${new Set(articulos.map((a) => a.ruta.map((n) => `${n.tipo}:${n.numero}`).join('/'))).size}`);
    if (process.env.DEPURAR) {
      const cortos = articulos.filter((a) => a.texto.length < 12).slice(0, 10);
      for (const a of cortos) console.log('  CORTO', a.numero, '|', JSON.stringify(a.texto));
      for (const a of articulos.slice(-4)) console.log('  COLA', a.numero, '|', JSON.stringify(a.texto.slice(0, 90)));
    }
  }

  await cargarLibro(
    slug,
    {
      sigla: 'POE QR',
      etiqueta: 'POE',
      ultimaReforma: meta.ultimaReforma,
      procedencia: [
        `Texto oficial integro del PDF consolidado del Congreso de Quintana Roo: ${datos.archivo}`,
        'Extraido de web.archive.org (captura del PDF vigente en documentos.congresoqroo.gob.mx) y convertido con pdftotext -enc UTF-8',
        'Se excluyo el apendice de transitorios de decretos de reforma y el historial de decretos: no es texto normativo vigente',
      ],
    },
    articulos,
    { seco, reescribir, limpiar },
  );
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/importar-poe.ts')) {
  main().catch((e) => {
    console.error('[importar:poe] fallo:', e);
    process.exit(1);
  }).finally(() => prisma.$disconnect());
}
