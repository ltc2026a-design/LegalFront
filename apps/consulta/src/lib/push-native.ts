// Zona 10 — Push NATIVO (Capacitor / Android).
//
// Convive con push.ts (Zona 9, Web Push VAPID) sin tocarlo: aqui solo se ejecuta
// cuando la app corre EMPAQUETADA (Capacitor.isNativePlatform()) y en Android.
// El flujo web (SW + push.ts) queda INTACTO para las visitas por navegador.
//
// Que hace: pide permiso, registra el dispositivo en FCM con
// @capacitor/push-notifications y, al obtener el token, lo da de alta en el
// backend via POST /api/app/dispositivos con plataforma 'android' (mismo endpoint
// que usa la web). El backend (envio.ts) hoy trata android como STUB de Zona 10.
//
// TODO (necesita credenciales del dueño): colocar `android/app/google-services.json`
// del proyecto Firebase. Sin ese archivo, PushNotifications.register() dispara
// 'registrationError' y NUNCA llega token: el alta real y el envio FCM requieren
// la cuenta de servicio / server key del proyecto Firebase del dueño.
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { API_BASE } from './api';
import { getDeviceId } from './device';

/** Flag local: ya se registro un token android en este dispositivo. */
const REGISTERED_FLAG = 'legal.pushNativeRegistered';

let inicializado = false;

/** Alta del token crudo de FCM en el backend (plataforma android). */
async function registrarTokenAndroid(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/app/dispositivos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        endpoint: token,
        plataforma: 'android',
      }),
    });
  } catch {
    // Backend caido o sin red: se reintentara en el proximo arranque de la app.
  }
}

/** Muestra el aviso con LocalNotifications cuando la app esta en primer plano. */
async function mostrarLocal(n: { title?: string | null; body?: string | null }): Promise<void> {
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 100000),
          title: n.title ?? 'Consulta Legal',
          body: n.body ?? '',
        },
      ],
    });
  } catch {
    // Permiso de notificacion denegado: nada que hacer, no rompe el arranque.
  }
}

/**
 * Punto de entrada. Debe llamarse SOLO en plataforma nativa. Es idempotente y
 * nunca lanza hacia afuera: cualquier fallo se limita a un aviso en consola.
 */
export async function initNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== 'android') return; // iOS/desktop: fuera de Zona 10
  if (inicializado) return;
  inicializado = true;

  try {
    // Los listeners se registran ANTES de pedir permiso / register().
    await PushNotifications.addListener('registration', (value) => {
      try {
        localStorage.setItem(REGISTERED_FLAG, Date.now().toString());
      } catch {
        /* almacenamiento no disponible */
      }
      void registrarTokenAndroid(value.value);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      // Sin google-services.json el token nunca llega: TODO de credenciales Firebase.
      console.warn('[push:native] registro FCM fallido (falta google-services.json?):', err.error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (n) => {
      // En primer plano, FCM no pinta el aviso: lo delegamos a LocalNotifications.
      void mostrarLocal(n);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data as Record<string, unknown> | undefined;
      const url = typeof data?.url === 'string' ? data.url : undefined;
      if (url && typeof window !== 'undefined') {
        window.location.assign(url);
      }
    });

    const permiso = await PushNotifications.requestPermissions();
    if (permiso.receive === 'granted') {
      await PushNotifications.register();
    }
  } catch (e) {
    console.warn('[push:native] no se pudo inicializar el push nativo:', (e as Error).message);
  }
}
