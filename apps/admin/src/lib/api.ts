// Zona 7 — cliente de la API del admin. Adjunta siempre `Authorization: Bearer <JWT>`
// desde memoria + localStorage('admin.token'). Un 401 en una ruta PROTEGIDA limpia
// el token y avisa al AuthContext (evento 'admin:unauthorized') para cerrar sesion.
import type {
  CambiosPendientesResponse,
  CodigosResponse,
  CodigoAdminItem,
  DetalleCambio,
  DifundirResponse,
  EstructuraResponse,
  FuentesResponse,
  LoteResultado,
  LoginResponse,
  MeResponse,
  NotificacionesResponse,
  ResolucionResponse,
  ResumenDashboard,
  SincronizarResponse,
} from './types';

// Si el panel se sirve desde el mismo host que la API (el deploy lo monta en /admin),
// se usa la ruta relativa: no interviene CORS y el URL del servidor no hace falta
// quemarlo en el build. En desarrollo (:5174 vs :3000) los origenes difieren y se
// mantiene la URL absoluta de siempre.
function resolverApiBase(): string {
  const quemada = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
  try {
    const absoluta = new URL(quemada, window.location.href);
    if (absoluta.origin === window.location.origin) return absoluta.pathname.replace(/\/$/, '');
  } catch {
    // URL malformada: se usa tal cual para que falle en el fetch, no al arrancar.
  }
  return quemada;
}

export const API_BASE: string = resolverApiBase();

const TOKEN_KEY = 'admin.token';

// Token en memoria (por si localStorage no esta disponible) + persistencia.
let tokenMemoria: string | null | undefined = undefined;

export function getToken(): string | null {
  if (tokenMemoria === undefined) {
    try {
      tokenMemoria = localStorage.getItem(TOKEN_KEY);
    } catch {
      tokenMemoria = null;
    }
  }
  return tokenMemoria;
}

export function setToken(token: string | null): void {
  tokenMemoria = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage no disponible: el token queda solo en memoria para la sesion.
  }
}

/** Error de API con estado HTTP y codigo { error } del backend. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function extraerCodigo(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error?: unknown }).error;
    return typeof e === 'string' ? e : null;
  }
  return null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const esLogin = path === '/admin/auth/login';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let code: string | null = null;
    try {
      code = extraerCodigo(await res.json());
    } catch {
      // cuerpo no JSON
    }
    // Solo las rutas protegidas: un 401 aqui significa token invalido/expirado.
    if (res.status === 401 && !esLogin) {
      setToken(null);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin:unauthorized'));
    }
    throw new ApiError(res.status, code, `API ${res.status} en ${path}`);
  }

  return (await res.json()) as T;
}

// ---------- Auth ----------

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/admin/auth/login', { email, password });
}

export function me(): Promise<MeResponse> {
  return request<MeResponse>('GET', '/admin/auth/me');
}

// ---------- Cambios pendientes / revision ----------

export function getResumen(): Promise<ResumenDashboard> {
  return request<ResumenDashboard>('GET', '/admin/dashboard/resumen');
}

export function getCambiosPendientes(filtros?: {
  tipo?: string;
  codigo?: string;
}): Promise<CambiosPendientesResponse> {
  const qs = new URLSearchParams();
  if (filtros?.tipo) qs.set('tipo', filtros.tipo);
  if (filtros?.codigo) qs.set('codigo', filtros.codigo);
  const query = qs.toString();
  return request<CambiosPendientesResponse>(
    'GET',
    `/admin/cambios-pendientes${query ? `?${query}` : ''}`,
  );
}

export function getDetalleCambio(id: string): Promise<DetalleCambio> {
  return request<DetalleCambio>('GET', `/admin/cambios/${encodeURIComponent(id)}`);
}

export function aprobarCambio(id: string): Promise<ResolucionResponse> {
  return request<ResolucionResponse>('POST', `/admin/cambios/${encodeURIComponent(id)}/aprobar`);
}

export function rechazarCambio(id: string): Promise<ResolucionResponse> {
  return request<ResolucionResponse>('POST', `/admin/cambios/${encodeURIComponent(id)}/rechazar`);
}

// ---------- Zona 8 — codigos ----------

export function getCodigos(): Promise<CodigosResponse> {
  return request<CodigosResponse>('GET', '/admin/codigos');
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export function deleteJson<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

export type CodigoCreado = CodigoAdminItem & { descripcion: string; creadoEn: string };

export function getEstructura(slug: string): Promise<EstructuraResponse> {
  return request<EstructuraResponse>(
    'GET',
    `/admin/codigos/${encodeURIComponent(slug)}/estructura`,
  );
}

export function postBatch(codigoId: string, body: unknown): Promise<LoteResultado> {
  return request<LoteResultado>(
    'POST',
    `/admin/codigos/${encodeURIComponent(codigoId)}/articulos/batch`,
    body,
  );
}

// ---------- Zona 8 — fuentes oficiales ----------

export function getFuentes(): Promise<FuentesResponse> {
  return request<FuentesResponse>('GET', '/admin/fuentes');
}

export function syncFuente(id: string): Promise<SincronizarResponse> {
  return request<SincronizarResponse>(
    'POST',
    `/admin/fuentes/${encodeURIComponent(id)}/sincronizar`,
  );
}

// ---------- Zona 9 — notificaciones push ----------

/** Listado reciente de notificaciones (avisos enviados). */
export function getNotificaciones(limit = 30): Promise<NotificacionesResponse> {
  return request<NotificacionesResponse>('GET', `/admin/notificaciones?limit=${limit}`);
}

/** Difundir un aviso general a TODOS los dispositivos registrados. */
export function postNotificacionGeneral(
  titulo: string,
  mensaje: string,
): Promise<DifundirResponse> {
  return request<DifundirResponse>('POST', '/admin/notificaciones/general', { titulo, mensaje });
}
