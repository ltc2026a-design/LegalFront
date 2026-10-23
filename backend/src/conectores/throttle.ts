// Zona 11 — ETIQUETA DE RED para los conectores HTTP.
//
// El host de ejecución tiene poco ancho de banda y parte de él está filtrado, y
// el requisito de producto es NO saturar la conexión real ni martillar los
// sitios oficiales. Este módulo impone, POR HOST:
//   - un semáforo de concurrencia (MAX 1 petición en vuelo por host),
//   - un retardo mínimo entre peticiones al mismo host,
//   - un jitter aleatorio adicional (desincroniza reintentos/rejas).
//
// No añade reintentos: el que los haga sigue siendo UNO como máximo (ver
// conector-diputados.ts). Solo serializa y espaacia lo que ya se pide.
//
// Los valores se pueden relajar en pruebas con variables de entorno para no
// alargar la suite:
//   CONNECTOR_MIN_DELAY_MS  (defecto 1200)  -> a 0 en tests unitarios
//   CONNECTOR_JITTER_MS     (defecto 800)
function leerNum(nombre: string, defecto: number): number {
  const v = Number(process.env[nombre]);
  return Number.isFinite(v) && v >= 0 ? v : defecto;
}

const CONCURRENCIA_POR_HOST = 1;
const DELAY_MIN_MS = leerNum('CONNECTOR_MIN_DELAY_MS', 1200);
const JITTER_MAX_MS = leerNum('CONNECTOR_JITTER_MS', 800);

interface EstadoHost {
  enVuelo: number;
  cola: (() => void)[];
  ultimoInicioEn: number;
}

const estados = new Map<string, EstadoHost>();

const esperar = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((res) => setTimeout(res, ms)) : Promise.resolve();

/** Jitter determinista en pruebas (para que la suite no sea lenta ni aleatoria). */
function calcularJitter(max: number): number {
  if (max <= 0) return 0;
  if (process.env.NODE_ENV === 'test') return 0;
  return Math.floor(Math.random() * max);
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function estadoDe(host: string): EstadoHost {
  let e = estados.get(host);
  if (!e) {
    e = { enVuelo: 0, cola: [], ultimoInicioEn: 0 };
    estados.set(host, e);
  }
  return e;
}

/**
 * Ejecuta `fn` con turno exclusivo por host + retardo mínimo de cortesía.
 * Máximo 1 petición en vuelo al mismo host; las demás encolan.
 */
export async function conTurnoDeHost<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = hostDe(url);
  const e = estadoDe(host);

  // 1) Semaphore de concurrencia (1 por host).
  if (e.enVuelo >= CONCURRENCIA_POR_HOST) {
    await new Promise<void>((resolve) => e.cola.push(resolve));
  }
  e.enVuelo += 1;

  try {
    // 2) Retardo mínimo desde el último INICIO a este host + jitter.
    const desdeUltimo = Date.now() - e.ultimoInicioEn;
    const espera = Math.max(0, DELAY_MIN_MS - desdeUltimo) + calcularJitter(JITTER_MAX_MS);
    await esperar(espera);
    e.ultimoInicioEn = Date.now();

    return await fn();
  } finally {
    e.enVuelo -= 1;
    const siguiente = e.cola.shift();
    if (siguiente) siguiente();
  }
}

/** Estado interno del semáforo (solo para pruebas/depuración). */
export function _estadoThrottle(): { hosts: string[] } {
  return { hosts: [...estados.keys()] };
}
