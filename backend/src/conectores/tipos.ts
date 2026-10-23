// Zona 6 — tipos normalizados de salida de los conectores de sincronizacion.
//
// Un conector NUNCA escribe en la base: solo produce un ResultadoNormalizado
// (una "fotografia" del texto oficial en un momento dado). El motor de diff
// (backend/src/sincronizacion/diff.ts) compara esa fotografia contra la base y
// deja los cambios como pendientes de revision.
import type { Jurisdiccion, TipoCodigo } from '../generated/prisma/client.js';

/** Aliases ligeros para que los conectores no dependan del generador al declarar opciones. */
export type TipoCodigoLite = TipoCodigo;
export type JurisdiccionLite = Jurisdiccion;

/** Jerarquia normativa que un conector puede emitir (mismo vocabulario que el enum TipoSeccion). */
export type TipoSeccionNormalizada = 'libro' | 'titulo' | 'capitulo' | 'seccion';

/** Nodo del arbol de secciones. `children` permite cualquier profundidad (capitulo dentro de titulo, etc.). */
export interface SeccionNormalizada {
  tipo: TipoSeccionNormalizada;
  /** Numero/identificador legible ("I", "Primero", "2"...) como aparece en el texto. */
  numero: string;
  nombre: string;
  children: SeccionNormalizada[];
}

/**
 * Clave canonica de una seccion dentro de un codigo. Se usa como "ruta":
 * un articulo declara la cadena de claves de secciones bajo las que vive.
 * Ej: "titulo:II/capitulo:3".
 */
export function claveSeccion(tipo: TipoSeccionNormalizada, numero: string): string {
  return `${tipo}:${numero.trim().toLowerCase()}`;
}

/** Normaliza un texto para comparaciones (recorta espacios y colapsa saltos multiples). */
export function normalizarTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

/** Igualdad de textos tras normalizar (se usa para detectar modificacion vs identidad). */
export function textosIguales(a: string, b: string): boolean {
  return normalizarTexto(a) === normalizarTexto(b);
}

export interface ArticuloNormalizado {
  /** Numero tal cual: "1", "3 A BIS", "14". */
  numero: string;
  texto: string;
  /**
   * Ruta de claves de seccion (de raiz a hoja) donde vive el articulo.
   * Vacio => sin seccion (adjunto directo del codigo).
   */
  rutaSecciones: string[];
  esApartadoClave?: boolean;
  /** false = derogado en la fuente (por defecto true). */
  vigente?: boolean;
}

export interface CodigoNormalizado {
  slug: string;
  nombre: string;
  tipo: TipoCodigo;
  jurisdiccion: Jurisdiccion;
  versionVigente?: string;
  fechaUltimaReforma?: Date;
}

export interface ResultadoNormalizado {
  codigo: CodigoNormalizado;
  secciones: SeccionNormalizada[];
  articulos: ArticuloNormalizado[];
}

/**
 * Contrato comun a toda implementacion de conector.
 * `obtener()` lanza en cualquier error de red/parseo: el orquestador lo captura
 * y marca la fuente como con_error. No debe escribir en la base.
 */
export interface ConectorFuente {
  obtener(): Promise<ResultadoNormalizado>;
}

/** Minimo de FuenteOficial que necesitan los conectores (evita acoplar al modelo completo). */
export interface FuenteParaConector {
  urlOrigen: string;
}
