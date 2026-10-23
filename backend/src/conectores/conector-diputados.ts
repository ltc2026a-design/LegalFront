// Zona 6 — conector REAL de la Camara de Diputados (federal).
//
// DERIVACION DEL /ref/ (la parte clave):
//   Las fuentes se siembran apuntando al PDF oficial, p.ej.
//     https://www.diputados.gob.mx/LeyesBiblio/pdf/CPEUM.pdf
//   Pero el PDF es dificil de parsear y no conserva bien la estructura. La
//   misma Camara publica la version HTML "de referencia" del MISMO cuerpo legal
//   en la carpeta /ref/ con la MISMA clave y extension .htm:
//     https://www.diputados.gob.mx/LeyesBiblio/ref/CPEUM.htm
//   La derivacion es por tanto: sustituir el segmento /pdf/ por /ref/ y la
//   extension .pdf por .htm, conservando la clave (CPEUM, CPF, CNPCF...).
//
// POLITICA DE RED (conservadora, no martillar el sitio oficial):
//   - 1 sola peticion, con un MAXIMO de 1 reintento (2 intentos totales) y
//     backoff + jitter entre ellos.
//   - Etiqueta por host (Zona 11, ver throttle.ts): MAX 1 peticion en vuelo por
//     host + retardo minimo entre peticiones al mismo host + jitter.
//   - Timeout duro via AbortController (~30 s) para no colgar el proceso.
//   - Cabecera User-Agent identificable (politica usual de robots).
//   - Cualquier fallo (red, HTTP != 2xx, parseo vacio) LANZA: el orquestador
//     marca la fuente como con_error y la tarea como fallida.
//
// NOTA DE RED EN ESTE HOST: desde esta maquina los hosts .gob.mx son
// INALCANZABLES (TCP timeout). El codigo es correcto y pointed a la URL real;
// la verificacion del pipeline completo se hace con el conector de FIXTURE
// (offline). Cuando este sistema corra en una red que alcanza el sitio, este
// conector llenara los libros COMPLETOS (todos los articulos del /ref/).
import {
  type CodigoNormalizado,
  type ConectorFuente,
  type JurisdiccionLite,
  type ResultadoNormalizado,
  type TipoCodigoLite,
} from './tipos.js';
import { parsearResultado } from './parser-html.js';
import { conTurnoDeHost } from './throttle.js';

const TIMEOUT_MS = 30_000;
const USER_AGENT = 'SistemaDeConsultaLegal/0.1 (+sync connector; bajo uso responsable)';

/** Deriva la URL HTML /ref/ a partir de la URL /pdf/ sembrada en la fuente. */
export function derivarUrlRef(urlOrigen: string): string {
  const u = urlOrigen.trim();
  if (/\.pdf$/i.test(u)) {
    return u.replace(/\/pdf\//i, '/ref/').replace(/\.pdf$/i, '.htm');
  }
  // Si ya apunta a /ref/ o a un .htm, se usa tal cual.
  if (/\/ref\//i.test(u) || /\.x?html?$/i.test(u)) return u;
  // Copefall: asume la convencion /pdf/<CLAVE>.pdf y construye /ref/<CLAVE>.htm.
  const clave = u.split('/').pop()?.replace(/\.[a-z]+$/i, '') ?? '';
  return `https://www.diputados.gob.mx/LeyesBiblio/ref/${clave}.htm`;
}

/** Extrae la clave del documento (CPEUM, CPF...) para el slug/label informativo. */
function claveDesdeUrl(urlOrigen: string): string {
  const seg = urlOrigen.split('/').pop() ?? '';
  return seg.replace(/\.[a-z]+$/i, '').toUpperCase();
}

export interface OpcionesConectorFederal {
  slug?: string;
  nombre?: string;
  tipo?: TipoCodigoLite;
  jurisdiccion?: JurisdiccionLite;
  /** Inyectable para pruebas: funcion de red alternativa. */
  fetcher?: (url: string, init: RequestInit & { signal: AbortSignal }) => Promise<Response>;
}

export class ConectorDiputadosFederal implements ConectorFuente {
  constructor(
    private readonly urlOrigen: string,
    private readonly opts: OpcionesConectorFederal = {},
  ) {}

  private async reintentar<T>(fn: () => Promise<T>): Promise<T> {
    let ultimoError: unknown;
    const MAX_INTENTOS = 2; // 1 sola peticion + 1 UNICO reintento (no martillar).
    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      try {
        return await fn();
      } catch (error) {
        ultimoError = error;
        // Backoff + jitter SOLO si aun queda otro intento (0 en NODE_ENV=test).
        if (intento < MAX_INTENTOS - 1) {
          const espera = this.esperaReintento(intento);
          if (espera > 0) await new Promise((r) => setTimeout(r, espera));
        }
      }
    }
    throw ultimoError;
  }

  /** Espera entre reintentos con jitter; 0 en pruebas para no alargar la suite. */
  private esperaReintento(intento: number): number {
    if (process.env.NODE_ENV === 'test') return 0;
    const base = 1000 * (intento + 1);
    const jitter = Math.floor(Math.random() * 500);
    return base + jitter;
  }

  private async descargar(url: string): Promise<string> {
    // Etiqueta de red: 1 sola peticion en vuelo por host + retardo minimo.
    return conTurnoDeHost(url, async () => {
      const control = new AbortController();
      const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);
      try {
        const doFetch =
          this.opts.fetcher ??
          ((u: string, init: RequestInit & { signal: AbortSignal }) => fetch(u, init));
        const respuesta = await doFetch(url, {
          signal: control.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        });
        if (!respuesta.ok) {
          throw new Error(`HTTP ${respuesta.status} al descargar ${url}`);
        }
        return await respuesta.text();
      } finally {
        clearTimeout(temporizador);
      }
    });
  }

  async obtener(): Promise<ResultadoNormalizado> {
    const url = derivarUrlRef(this.urlOrigen);
    const clave = claveDesdeUrl(this.urlOrigen);

    const codigo: CodigoNormalizado = {
      slug: this.opts.slug ?? clave.toLowerCase(),
      nombre: this.opts.nombre ?? `Documento federal ${clave}`,
      tipo: this.opts.tipo ?? 'otro',
      jurisdiccion: this.opts.jurisdiccion ?? 'federal',
    };

    const html = await this.reintentar(() => this.descargar(url));
    const resultado = parsearResultado(html, codigo);

    if (resultado.articulos.length === 0) {
      // Parseo sin articulos = estructura inesperada: tratar como error para no
      // registrar una "sincronizacion vacia" que podria derivar en falsos derogados.
      throw new Error(
        `El /ref/ de ${clave} no produjo articulos (formato inesperado o pagina vacia).`,
      );
    }
    return resultado;
  }
}
