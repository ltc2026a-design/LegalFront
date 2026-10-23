// Fase 3 — Estado de la SESION de persona (la cuenta la crea el dueno con el CLI).
//
// NO hay alta desde la app: aqui solo se guarda el token que devuelve
// POST /api/app/login. El modulo a proposito NO hace fetch (lo hace lib/api.ts,
// que si importa de aqui) para que no haya ciclo de dependencias.
//
// Persistencia: localStorage. Si el almacenamiento falla (modo privado, Cuota),
// la sesion vive en memoria y se pierde al recargar: la app sigue funcionando
// como anonima por device_id, que es su modo historico.
import { useSyncExternalStore } from 'react';
import type { UsuarioCuenta } from './types';
import { getDeviceId } from './device';

const STORAGE_KEY = 'legal.sesion.v1';

export interface Sesion {
  token: string;
  usuario: UsuarioCuenta;
}

let sesion: Sesion | null = null;
const oyentes = new Set<() => void>();

function notificar(): void {
  for (const cb of oyentes) cb();
}

/** Snapshot inmutable para useSyncExternalStore (devuelve SIEMPRE el mismo objeto). */
let instantanea: Sesion | null = null;

function cambiar(nueva: Sesion | null): void {
  sesion = nueva;
  instantanea = nueva;
  try {
    if (nueva) localStorage.setItem(STORAGE_KEY, JSON.stringify(nueva));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento: la sesion sigue valida en memoria durante esta carga.
  }
  notificar();
}

/** Descarta una sesion guardada que ya no sirve (token caduco o cuenta borrada). */
function descartar(): void {
  if (sesion) cambiar(null);
}

/** Lee y valida lo guardado. Un JSON roto o sin token no debe romper el arranque. */
function cargar(): Sesion | null {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as Partial<Sesion> | null;
    const token = typeof datos?.token === 'string' ? datos.token : '';
    const usuario = datos?.usuario;
    if (!token || !usuario || typeof usuario.id !== 'string' || typeof usuario.deviceId !== 'string') {
      return null;
    }
    return {
      token,
      usuario: {
        id: usuario.id,
        deviceId: usuario.deviceId,
        nombre: typeof usuario.nombre === 'string' ? usuario.nombre : '',
        email: typeof usuario.email === 'string' ? usuario.email : '',
      },
    };
  } catch {
    return null;
  }
}

sesion = cargar();
instantanea = sesion;

/** Suscripcion para useSyncExternalStore. */
export function suscribirSesion(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

/** La sesion actual (null = sin iniciar sesion). Referencia estable entre cambios. */
export function obtenerSesion(): Sesion | null {
  return instantanea;
}

/** El token para las rutas protegidas; null si no hay sesion. */
export function tokenSesion(): string | null {
  return sesion?.token ?? null;
}

/**
 * El device_id con el que trabaja la app: el de la CUENTA si la persona inicio
 * sesion (asi sus favoritos la siguen entre dispositivos), el del telefono si no.
 * Toda la capa de favoritos pasa por aqui.
 */
export function deviceIdActivo(): string {
  return sesion?.usuario.deviceId ?? getDeviceId();
}

/** Guarda la sesion recien obtenida del login. */
export function guardarSesion(s: Sesion): void {
  cambiar(s);
}

/** Cierra la sesion local (el JWT no se lista en el servidor: dura lo que dura). */
export function cerrarSesion(): void {
  cambiar(null);
}

/**
 * El backend relee la cuenta en cada peticion protegida: si el dueno la borro o
 * el token vencio, responde 401 `no_autenticado`. Descifrar ese caso evita que la
 * app se quede preguntando por una sesion muerta.
 */
export function esSesionInvalida(error: unknown): boolean {
  const e = error as { status?: number; code?: string | null };
  const invalida = e?.status === 401 && e?.code === 'no_autenticado';
  if (invalida) descartar();
  return invalida;
}

/** Clave de localStorage de la sesion (util para depuracion/pruebas). */
export const SESION_STORAGE_KEY = STORAGE_KEY;

/**
 * El device_id activo como estado reactivo: al entrar o salir de la cuenta las
 * pantallas que usan favoritos se re-renderizan con la lista nueva (la clave de
 * consulta de TanStack Query incluye el id, asi que no hace falta limpiar cache).
 */
export function useDeviceIdActivo(): string {
  return useSyncExternalStore(suscribirSesion, deviceIdActivo, deviceIdActivo);
}
