// Zona 4 — Wrapper minimo de fetch sobre la API publica de consulta (Zona 3).
// Zona 5 — Anade las llamadas de favoritos/registro y la senal "servido desde
// cache / sin conexion" que usa el banner de offline.
// Fase 3 — Las rutas de cuenta (/app/login, /app/yo, /app/preferencias) adjuntan
// el Bearer que guardaria el login; el resto sigue siendo anonimo por device_id.
// La base viene de VITE_API_URL; por defecto apunta al backend de desarrollo local.
import { tokenSesion } from './sesion';
import type {
  ApartadosClaveResponse,
  ArticuloDetalle,
  BusquedaResponse,
  CodigoDetalle,
  EstadoAsistente,
  FavoritoResponse,
  FavoritosResponse,
  FuenteAsistente,
  ListaCodigosResponse,
  LoginResponse,
  PreferenciasApp,
  PreferenciasResponse,
  RegistroResponse,
  RespuestaAsistente,
  RespuestaGuiada,
  SaltoResponse,
  TurnoAsistente,
  YoResponse,
} from './types';

/**
 * Un solo build vale para web publicada, APK y Live Updates:
 *  - En navegador, si la pagina y la API comparten origen (lo sirven el mismo
 *    proceso o nginx), se pide la RUTA RELATIVA: cero CORS y el Service Worker
 *    puede cachear same-origin.
 *  - Dentro del APK / del escritorio no existe ese origen comun, asi que se
 *    respeta la URL absoluta quemada en VITE_API_URL.
 *  - En desarrollo (SPA en :5173, API en :3000) los origenes difieren y
 *    tambien se usa la URL absoluta de siempre.
 */
function dentroDeAppNativa(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
    __TAURI_INTERNALS__?: unknown;
  };
  return w.Capacitor?.isNativePlatform?.() === true || Boolean(w.__TAURI_INTERNALS__);
}

function resolverApiBase(): string {
  const quemada = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
  if (dentroDeAppNativa()) return quemada;
  try {
    const absoluta = new URL(quemada, window.location.href);
    if (absoluta.origin === window.location.origin) return absoluta.pathname.replace(/\/$/, '');
  } catch {
    // URL malformada: mejor usarla tal cual y que falle en el fetch que reventar el arranque.
  }
  return quemada;
}

export const API_BASE: string = resolverApiBase();

// ---------- Senal global "contenido sin conexion" ----------
// El Service Worker (public/sw.js) responde los GET de /api desde su cache
// cuando no hay red y les pone la cabecera `X-Served-By: cache`. Ademas, si el
// navegador avisa de que estamos sin conexion, cualquier respuesta exitosa ya
// no puede considerarse "en vivo". Guardamos ese estado a nivel de modulo para
// que cualquier pantalla pueda mostrar el aviso amber "sin conexion".

let servidoDeCache = false;
const oyentes = new Set<(valor: boolean) => void>();

/** Estado actual: true si lo ultimo que se sirvio vino de la cache / no hay red. */
export function estaServidoDeCache(): boolean {
  return servidoDeCache;
}

/** Suscripcion para re-renderizar cuando cambia el estado (usa useSyncExternalStore). */
export function suscribirCache(cb: (valor: boolean) => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

function marcarCache(valor: boolean): void {
  if (servidoDeCache === valor) return;
  servidoDeCache = valor;
  for (const cb of oyentes) cb(valor);
}

/** True si el navegador esta fisicamente sin conexion. */
export function sinConexion(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Error de API con estado HTTP y codigo de error del backend (p. ej. "no_encontrado"). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get esNotFound(): boolean {
    return this.status === 404;
  }
}

function leerCabecera(res: Response, nombre: string): string | null {
  try {
    return res.headers.get(nombre);
  } catch {
    return null;
  }
}

function extraerCodigo(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error?: unknown }).error;
    return typeof e === 'string' ? e : null;
  }
  return null;
}

/**
 * GET tipado contra la API. Lanza ApiError en cualquier respuesta no-2xx.
 * El 404 se propaga como ApiError({status:404}) para que las paginas
 * puedan mostrar un estado amigable de "no encontrado".
 */
export async function apiGet<T>(path: string, signal?: AbortSignal, auth = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(auth && tokenSesion() ? { Authorization: `Bearer ${tokenSesion()}` } : {}),
      },
      signal,
    });
  } catch (e) {
    // Sin red y sin cache disponible (el SW dejo pasar el fallo): avisamos igual.
    if (sinConexion()) marcarCache(true);
    throw e;
  }

  // Cabecera puesta por el Service Worker al servir desde cache, o navegador
  // sin red: activa el aviso "Mostrando contenido guardado (sin conexion)".
  const deCache = leerCabecera(res, 'X-Served-By')?.toLowerCase() === 'cache';
  marcarCache(deCache || sinConexion());

  if (!res.ok) {
    let code: string | null = null;
    try {
      code = extraerCodigo(await res.json());
    } catch {
      // cuerpo no JSON: se conserva el estado y se deja code = null
    }
    throw new ApiError(res.status, code, `API ${res.status} en ${path}`);
  }

  return (await res.json()) as T;
}

/** POST / PATCH / DELETE tipados. En no-2xx lanzan ApiError con el codigo del backend. */
async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        // Las rutas de cuenta leen el token del store de sesion (lib/sesion.ts).
        ...(tokenSesion() ? { Authorization: `Bearer ${tokenSesion()}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    // Una mutacion sin red falla: el banner "sin conexion" debe aparecer.
    if (sinConexion()) marcarCache(true);
    throw e;
  }

  if (!res.ok) {
    let code: string | null = null;
    try {
      code = extraerCodigo(await res.json());
    } catch {
      // cuerpo no JSON
    }
    throw new ApiError(res.status, code, `API ${res.status} en ${path}`);
  }

  return (await res.json()) as T;
}

// ---------- Endpoints tipados (Zona 3, lectura) ----------

export function getCodigos(signal?: AbortSignal) {
  return apiGet<ListaCodigosResponse>('/codigos', signal);
}

export function getCodigo(slug: string, signal?: AbortSignal) {
  return apiGet<CodigoDetalle>(`/codigos/${encodeURIComponent(slug)}`, signal);
}

export function getArticulo(slug: string, numero: string, signal?: AbortSignal) {
  return apiGet<ArticuloDetalle>(
    `/codigos/${encodeURIComponent(slug)}/articulos/${encodeURIComponent(numero)}`,
    signal,
  );
}

export function getApartadosClave(signal?: AbortSignal) {
  return apiGet<ApartadosClaveResponse>('/apartados-clave', signal);
}

export function buscar(
  params: { q: string; codigo?: string; limit?: number },
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams();
  qs.set('q', params.q);
  if (params.codigo) qs.set('codigo', params.codigo);
  if (params.limit != null) qs.set('limit', String(params.limit));
  return apiGet<BusquedaResponse>(`/buscar?${qs.toString()}`, signal);
}

// ---------- Zona 4b: salto directo por numero de articulo ----------

/**
 * GET /api/salto — localiza el articulo por su numero ("art 151", "11 bis",
 * "transitorio primero civil"). No sustituye a la busqueda: solo devuelve los
 * candidatos, que son poquisimos, y el Service Worker lo cachea igual que el resto
 * de GET de /api (funciona sin conexion).
 */
export function saltoArticulo(
  params: { q: string; codigo?: string },
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams();
  qs.set('q', params.q);
  if (params.codigo) qs.set('codigo', params.codigo);
  return apiGet<SaltoResponse>(`/salto?${qs.toString()}`, signal);
}

// ---------- Zona 12: asistente de consultas con IA ----------

export function getEstadoAsistente(signal?: AbortSignal) {
  return apiGet<EstadoAsistente>('/asistente/estado', signal);
}

/** GET /api/asistente/guiado — chat sin IA: misma recuperacion, sin llamar al proveedor. */
export function getAsistenteGuiado(q: string, signal?: AbortSignal) {
  const qs = new URLSearchParams();
  qs.set('q', q);
  return apiGet<RespuestaGuiada>(`/asistente/guiado?${qs.toString()}`, signal);
}

export interface OpcionesChat {
  deviceId: string;
  pregunta: string;
  /** Conversacion previa (se manda recortada; el servidor pone el limite). */
  historial: TurnoAsistente[];
  onFuente?: (f: FuenteAsistente) => void;
  onToken?: (texto: string) => void;
  signal?: AbortSignal;
}

/**
 * POST /api/asistente/chat consumiendo el stream ndjson: `onToken` se llama con cada
 * fragmento para ir pintando la respuesta. Rechaza ApiError con el codigo `lm_*`
 * que mando el backend (o "sin_conexion" si el navegador no llegó al servidor).
 */
export async function preguntarAsistente(opciones: OpcionesChat): Promise<RespuestaAsistente> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/asistente/chat`, {
      method: 'POST',
      headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: opciones.deviceId,
        pregunta: opciones.pregunta,
        historial: opciones.historial,
      }),
      signal: opciones.signal,
    });
  } catch (e) {
    // "Detener" aborta el fetch: no es una falla de red, no debe avisar de offline.
    if (opciones.signal?.aborted) throw new ApiError(499, 'lm_cancelado', 'Respuesta cancelada.');
    if (sinConexion()) marcarCache(true);
    throw new ApiError(0, 'sin_conexion', `No se pudo hablar con el asistente: ${(e as Error).message}`);
  }

  if (!res.ok) {
    let code: string | null = null;
    try {
      code = extraerCodigo(await res.json());
    } catch {
      // cuerpo no JSON
    }
    throw new ApiError(res.status, code, `API ${res.status} en /asistente/chat`);
  }
  if (!res.body) throw new ApiError(502, 'lm_sin_respuesta', 'El asistente no devolvió cuerpo.');

  const fuentes: FuenteAsistente[] = [];
  let texto = '';
  let sinFuentes = false;
  let sugerencias: string[] = [];

  const procesarLinea = (linea: string) => {
    const evento = linea.trim();
    if (!evento) return;
    let ev: {
      tipo?: string;
      texto?: string;
      fuente?: FuenteAsistente;
      sinFuentes?: boolean;
      sugerencias?: unknown;
      error?: string;
    };
    try {
      ev = JSON.parse(evento);
    } catch {
      return; // linea parcial o ruido: se ignora, la respuesta sigue llegando
    }
    if (ev.tipo === 'fuente' && ev.fuente) {
      fuentes.push(ev.fuente);
      opciones.onFuente?.(ev.fuente);
    } else if (ev.tipo === 'token' && typeof ev.texto === 'string') {
      texto += ev.texto;
      opciones.onToken?.(ev.texto);
    } else if (ev.tipo === 'fin') {
      sinFuentes = Boolean(ev.sinFuentes);
      if (Array.isArray(ev.sugerencias)) {
        sugerencias = ev.sugerencias.filter((s): s is string => typeof s === 'string');
      }
    } else if (ev.tipo === 'error') {
      throw new ApiError(502, ev.error ?? 'lm_no_responde', 'El asistente no pudo responder.');
    }
  };

  const lector = res.body.getReader();
  const decodificador = new TextDecoder();
  let sobra = '';
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      sobra += decodificador.decode(value, { stream: true });
      const lineas = sobra.split('\n');
      sobra = lineas.pop() ?? '';
      for (const l of lineas) procesarLinea(l);
    }
  } catch (e) {
    // Un ApiError aqui ya viene con su codigo (`lm_*` del evento error o cancelacion).
    if (e instanceof ApiError) throw e;
    if (opciones.signal?.aborted) throw new ApiError(499, 'lm_cancelado', 'Respuesta cancelada.');
    throw new ApiError(502, 'lm_sin_respuesta', `Se cortó la respuesta: ${(e as Error).message}`);
  }
  procesarLinea(sobra);

  return { texto, fuentes, sinFuentes, sugerencias };
}

// ---------- Endpoints tipados (Zona 5, favoritos por device_id) ----------

export function getFavoritos(deviceId: string, signal?: AbortSignal) {
  return apiGet<FavoritosResponse>(`/favoritos?deviceId=${encodeURIComponent(deviceId)}`, signal);
}

export function postFavorito(deviceId: string, articuloId: string) {
  return apiSend<FavoritoResponse>('POST', '/favoritos', { deviceId, articuloId });
}

export function deleteFavorito(favoritoId: string, deviceId: string) {
  return apiSend<{ ok: boolean; id: string }>(
    'DELETE',
    `/favoritos/${encodeURIComponent(favoritoId)}?deviceId=${encodeURIComponent(deviceId)}`,
  );
}

/** Etiqueta OPCIONAL del dispositivo (nombre/correo). No es un registro con contrasena. */
export function postRegistro(params: { deviceId: string; nombre?: string; email?: string }) {
  return apiSend<RegistroResponse>('POST', '/app/registro', params);
}

// ---------- Fase 2/3: cuenta de persona ----------
//
// NO existe endpoint de alta: la cuenta la crea el dueno con `npm run usuario:create`.
// El login manda el device_id del telefono para que el servidor COPIE a la cuenta los
// favoritos que esa persona ya tenia (es la unica fusion que hace falta: no se borra
// la lista del dispositivo).

export function postLoginApp(params: { email: string; password: string; deviceId?: string }) {
  return apiSend<LoginResponse>('POST', '/app/login', params);
}

/** Estado de la cuenta: datos, total de favoritos y preferencias guardadas. */
export function getYoApp(signal?: AbortSignal) {
  return apiGet<YoResponse>('/app/yo', signal, true);
}

/** Guardado PARCIAL de preferencias: solo se manda lo que cambio. */
export function patchPreferenciasApp(datos: Partial<PreferenciasApp>) {
  return apiSend<PreferenciasResponse>('PATCH', '/app/preferencias', datos);
}
