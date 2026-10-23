// Zona 6 — conector de IMPORTACION MANUAL (JSON).
//
// Permite que el dueno "cargue libros ahora" sin depender de un scraper. Lee un
// JSON desde la ruta dada (fuente.urlOrigen para el orquestador, o una ruta
// explicita para el "importar en lote" de la Zona 8) y la devuelve como
// ResultadoNormalizado. No escribe en la base: el diff decide que es cambio.
//
// SCHEMA DEL JSON:
// {
//   "codigo": { "slug": "...", "nombre": "...", "tipo": "codigo_penal",
//               "jurisdiccion": "federal", "versionVigente": "...",
//               "fechaUltimaReforma": "2024-01-01" },        // campos de fecha opcionales
//   "secciones": [ { "tipo":"titulo","numero":"I","nombre":"...",
//                    "children":[ ... ] } ],                  // arbol, misma forma que SeccionNormalizada
//   "articulos": [ { "numero":"7","texto":"...",
//                    "rutaSecciones":["titulo:i"],             // claves raiz->hoja
//                    "esApartadoClave": false, "vigente": true } ]
// }
import { readFile } from 'node:fs/promises';
import {
  type ArticuloNormalizado,
  type CodigoNormalizado,
  type ConectorFuente,
  type ResultadoNormalizado,
  type SeccionNormalizada,
  type TipoSeccionNormalizada,
} from './tipos.js';

const TIPOS_SECCION = new Set<TipoSeccionNormalizada>(['libro', 'titulo', 'capitulo', 'seccion']);

function error(mensaje: string): never {
  throw new Error(`[manual_import] ${mensaje}`);
}

function leerSecciones(bruto: unknown): SeccionNormalizada[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map((nodo, i): SeccionNormalizada => {
    if (typeof nodo !== 'object' || nodo === null) error(`secciones[${i}] no es objeto`);
    const n = nodo as Record<string, unknown>;
    const tipo = n.tipo as TipoSeccionNormalizada;
    if (!TIPOS_SECCION.has(tipo)) error(`secciones[${i}].tipo invalido: ${String(n.tipo)}`);
    return {
      tipo,
      numero: String(n.numero ?? ''),
      nombre: String(n.nombre ?? ''),
      children: leerSecciones(n.children),
    };
  });
}

function validar(bruto: unknown): ResultadoNormalizado {
  if (typeof bruto !== 'object' || bruto === null) error('la raiz del JSON no es un objeto');
  const doc = bruto as Record<string, unknown>;
  const c = doc.codigo;
  if (typeof c !== 'object' || c === null) error('falta el objeto "codigo"');
  const cc = c as Record<string, unknown>;
  if (!cc.slug || !cc.nombre) error('codigo.slug y codigo.nombre son obligatorios');

  const codigo: CodigoNormalizado = {
    slug: String(cc.slug),
    nombre: String(cc.nombre),
    tipo: (cc.tipo as CodigoNormalizado['tipo']) ?? 'otro',
    jurisdiccion: (cc.jurisdiccion as CodigoNormalizado['jurisdiccion']) ?? 'federal',
    versionVigente: cc.versionVigente !== undefined ? String(cc.versionVigente) : undefined,
    fechaUltimaReforma:
      cc.fechaUltimaReforma !== undefined ? new Date(String(cc.fechaUltimaReforma)) : undefined,
  };

  const secciones = leerSecciones(doc.secciones);

  const arr = Array.isArray(doc.articulos) ? doc.articulos : [];
  const articulos: ArticuloNormalizado[] = arr.map((a, i): ArticuloNormalizado => {
    if (typeof a !== 'object' || a === null) error(`articulos[${i}] no es objeto`);
    const x = a as Record<string, unknown>;
    if (x.numero === undefined || x.texto === undefined) {
      error(`articulos[${i}] requiere "numero" y "texto"`);
    }
    return {
      numero: String(x.numero),
      texto: String(x.texto),
      rutaSecciones: Array.isArray(x.rutaSecciones) ? x.rutaSecciones.map(String) : [],
      esApartadoClave: x.esApartadoClave === undefined ? undefined : Boolean(x.esApartadoClave),
      vigente: x.vigente === undefined ? true : Boolean(x.vigente),
    };
  });

  return { codigo, secciones, articulos };
}

export class ConectorManualImport implements ConectorFuente {
  constructor(private readonly rutaArchivo: string) {}

  async obtener(): Promise<ResultadoNormalizado> {
    const crudo = await readFile(this.rutaArchivo, 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(crudo);
    } catch (e) {
      error(`JSON invalido: ${(e as Error).message}`);
    }
    return validar(json);
  }
}
