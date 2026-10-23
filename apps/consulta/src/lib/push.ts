// Zona 9 — Suscripcion a Web Push (VAPID local) desde la app de consulta.
//
// REGLA DE UX (dura): NUNCA se pide el permiso de notificaciones al abrir la app.
// El flujo de permiso/subscribe se dispara SOLO tras accion del usuario (la
// primera vez que marca un favorito y acepta el mini-aviso). Notification
// .requestPermission() se ejecuta SIEMPRE dentro del click del usuario.
//
// Al suscribirse se registra la suscripcion como DispositivoPush(plataforma:'web')
// en el backend (POST /api/app/dispositivos) con el device_id, para que Zona 9
// pueda enviarle avisos de reformas a sus favoritos y difusiones generales.
import { API_BASE } from './api';
import { getDeviceId } from './device';

/** Flag local: ya existe suscripcion registrada en el servidor. */
const SUB_FLAG = 'legal.pushSubscribed';
/** Flag local: el usuario cerro el mini-aviso ("Ahora no") => no volver a mostrarlo. */
const POSPUESTO_FLAG = 'legal.pushPromptPospuesto';

export type EstadoPermiso = NotificationPermission | 'no-soportado';

export interface ResultadoPush {
  ok: boolean;
  /** 'suscrito' | 'cancelado' | 'denegado' | 'default' | 'no-soportado' | 'error' */
  estado: string;
}

function leerFlag(clave: string): boolean {
  try {
    return localStorage.getItem(clave) !== null;
  } catch {
    return false;
  }
}
function escribirFlag(clave: string): void {
  try {
    localStorage.setItem(clave, Date.now().toString());
  } catch {
    /* almacenamiento no disponible: no bloqueamos la UX */
  }
}
function borrarFlag(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    /* noop */
  }
}

/** El navegador soporta Web Push (SW + PushManager + Notification)? */
export function pushDisponible(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Estado actual del permiso de notificacion (sin pedirlo). */
export function estadoPermiso(): EstadoPermiso {
  if (!pushDisponible()) return 'no-soportado';
  return Notification.permission;
}

/** Ya se suscribio desde este navegador (flag local; el alta real esta en BD). */
export function estaSuscrito(): boolean {
  return leerFlag(SUB_FLAG);
}

/** El usuario pospuso el aviso ("Ahora no") en alguna ocasion. */
export function avisoPospuesto(): boolean {
  return leerFlag(POSPUESTO_FLAG);
}

/** Marca que ya no debe volver a mostrarse el mini-aviso. */
export function posponerAviso(): void {
  escribirFlag(POSPUESTO_FLAG);
}

/**
 * Debe ofrecerse el aviso de push? SOLO cuando:
 *  - el navegador lo soporta,
 *  - el permiso esta en 'default' (ni concedido ni denegado: nunca acosar tras
 *    un "bloquear"),
 *  - aun no esta suscrito, y
 *  - no lo habia pospuesto antes.
 */
export function debeOfrecerPush(): boolean {
  return (
    pushDisponible() &&
    Notification.permission === 'default' &&
    !estaSuscrito() &&
    !avisoPospuesto()
  );
}

/** Convierte la clave VAPID (base64url) al Uint8Array que exige applicationServerKey. */
function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Da de alta la suscripcion web. Debe llamarse tras un click del usuario en el
 * que ya se concedio el permiso. Idempotente en el backend (por endpoint).
 */
export async function suscribirPush(): Promise<ResultadoPush> {
  if (!pushDisponible()) return { ok: false, estado: 'no-soportado' };
  if (Notification.permission !== 'granted') {
    return { ok: false, estado: Notification.permission };
  }

  try {
    const reg = await navigator.serviceWorker.ready;

    // 1) Clave publica VAPID del backend.
    const resKey = await fetch(`${API_BASE}/push/vapid-public-key`);
    if (!resKey.ok) return { ok: false, estado: 'error' };
    const { publicKey } = (await resKey.json()) as { publicKey?: string };
    if (!publicKey) return { ok: false, estado: 'error' };

    // 2) Suscripcion del navegador (si ya existe, se reutiliza).
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    // 3) Registrar en BD (plataforma web, vinculada al device_id).
    const json = sub.toJSON();
    const resReg = await fetch(`${API_BASE}/app/dispositivos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        endpoint: json.endpoint,
        keys: json.keys,
        plataforma: 'web',
      }),
    });
    if (!resReg.ok) return { ok: false, estado: 'error' };

    escribirFlag(SUB_FLAG);
    return { ok: true, estado: 'suscrito' };
  } catch {
    return { ok: false, estado: 'error' };
  }
}

/**
 * DA IGUAL: se desuscribe del navegador y da de baja la fila en el backend.
 * Devuelve el resultado aunque algo falle parcialmente (limpieza local primero).
 */
export async function desuscribirPush(): Promise<ResultadoPush> {
  if (!pushDisponible()) return { ok: false, estado: 'no-soportado' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub?.toJSON().endpoint;
    if (sub && endpoint) {
      await sub.unsubscribe();
      await fetch(`${API_BASE}/app/dispositivos?endpoint=${encodeURIComponent(endpoint)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    borrarFlag(SUB_FLAG);
    return { ok: true, estado: 'cancelado' };
  } catch {
    borrarFlag(SUB_FLAG);
    return { ok: false, estado: 'error' };
  }
}

/**
 * Invocado por el CLICK del usuario en "Activar": pide el permiso (dentro del
 * gesto) y, si se concede, suscribe. Devuelve el estado final para la UI.
 */
export async function activarPushDesdeGesto(): Promise<ResultadoPush> {
  if (!pushDisponible()) return { ok: false, estado: 'no-soportado' };
  let permiso: NotificationPermission = Notification.permission;
  if (permiso === 'default') {
    try {
      permiso = await Notification.requestPermission();
    } catch {
      return { ok: false, estado: 'error' };
    }
  }
  if (permiso !== 'granted') return { ok: false, estado: permiso };
  return suscribirPush();
}
