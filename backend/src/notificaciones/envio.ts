// Zona 9 — TRANSPORTE de notificaciones push (dispatch por plataforma).
//
// Este modulo reemplaza el STUB de la Zona 7: decide COMO se envia cada push
// segun la `plataforma` del dispositivo, aislando el resto del sistema del
// proveedor concreto (Web Push VAPID real hoy; FCM/APNs/desktop en Zona 10).
//
// FORMATO de DispositivoPush.tokenPush (documentado tambien en webpush.ts):
//   - web    -> JSON.stringify({ endpoint, keys: { p256dh, auth } })
//               (la suscripcion tal cual la entrega pushManager.subscribe() en
//                el navegador; la reenviamos a web-push sin tocarla).
//   - nativo -> token crudo de la plataforma (el `endpoint` del POST /app/dispositivos).
//
// REGLA DURA: enviarPush NUNCA lanza hacia afuera. Cada token se intenta en su
// propio try/catch y el resultado se agrega; un dispositivo malo no tumba el
// envio a los demas ni la peticion que lo origino (aprobar cambio / broadcast).
// NUNCA se loguea el contenido de tokenPush (sus claves p256dh/auth si lo son).
import { prisma } from '../lib/prisma.js';
import { asegurarConfigurado, webpush } from './webpush.js';

export type PlataformaPush = 'web' | 'android' | 'ios' | 'desktop';

/** Cuerpo visible del aviso; el Service Worker lo traduce a notificacion nativa. */
export interface PayloadPush {
  titulo: string;
  mensaje: string;
  /** Ruta interna a abrir al hacer clic (p. ej. "/codigo/cpeu/articulo/1"). */
  url?: string | null;
  articuloId?: string | null;
}

/** Un destino ya resuelto (fila de dispositivo_push). */
export interface Destinatario {
  id: string;
  tokenPush: string;
  plataforma: PlataformaPush;
}

export interface ResultadoEnvio {
  total: number;
  /** Envios web que el servicio de push acepto (2xx). */
  enviados: number;
  /** Fallos de red/HTTP al enviar (incluye suscripciones muertas). */
  fallidos: number;
  /** Suscripciones 404/410 (expiradas/dadas de baja) ELIMINADAS de la BD. */
  eliminados: number;
  /** Destinos nativos (android/ios/desktop): adaptador stub, pendiente Zona 10. */
  pendientes: number;
}

interface SuscripcionWeb {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Reconvierte el tokenPush JSON en la suscripcion que espera web-push. */
function parsearSuscripcion(tokenPush: string): SuscripcionWeb | null {
  try {
    const o = JSON.parse(tokenPush) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };
    if (
      typeof o.endpoint === 'string' &&
      o.keys &&
      typeof o.keys.p256dh === 'string' &&
      typeof o.keys.auth === 'string'
    ) {
      return { endpoint: o.endpoint, keys: { p256dh: o.keys.p256dh, auth: o.keys.auth } };
    }
    return null;
  } catch {
    return null;
  }
}

/** Identificador legable para logs SIN exponer secretos: solo el host del endpoint. */
function etiquetaSegura(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'endpoint-invalido';
  }
}

/** Envio WEB real via VAPID. Limpia suscripciones muertas (404/410). */
async function pushWeb(
  d: Destinatario,
  payload: PayloadPush,
): Promise<{ ok: boolean; muerto: boolean }> {
  try {
    asegurarConfigurado();
  } catch (e) {
    // Sin claves VAPID: es un error de configuracion, no de un token. Lo registramos
    // una vez y contamos el destino como fallido (sin lanzar).
    console.error('[push:web] web-push sin configurar:', (e as Error).message);
    return { ok: false, muerto: false };
  }

  const sub = parsearSuscripcion(d.tokenPush);
  if (!sub) {
    console.warn(`[push:web] tokenPush malformado (id=${d.id}); se omite el envio.`);
    return { ok: false, muerto: false };
  }

  try {
    // Nota: web-push 3.x expone `sendNotification(suscripcion, payload)`, que es el
    // envio real de una suscripcion (alias conceptual de "sendSubscription").
    await webpush.sendNotification(sub, JSON.stringify(payload), { timeout: 10000 });
    return { ok: true, muerto: false };
  } catch (err) {
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : undefined;

    // 404 (Gone) o 410 ( Gone/Unregistered): suscripcion expirada o el usuario se
    // dio de baja en el navegador. Borramos la fila para no volver a intentar.
    if (statusCode === 404 || statusCode === 410) {
      try {
        await prisma.dispositivoPush.delete({ where: { id: d.id } });
        console.log(
          `[push:web] suscripcion ${statusCode} (expirada/baja) -> eliminada fila id=${d.id} (${etiquetaSegura(sub.endpoint)}).`,
        );
        return { ok: false, muerto: true };
      } catch (e) {
        console.error(`[push:web] no se pudo eliminar fila id=${d.id}:`, (e as Error).message);
        return { ok: false, muerto: false };
      }
    }

    // Cualquier otro fallo (DNS, red, 400, 413...): se loguea y se cuenta, sin lanzar.
    console.warn(
      `[push:web] fallo al enviar id=${d.id} -> ${etiquetaSegura(sub.endpoint)} (status=${statusCode ?? 'n/d'}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { ok: false, muerto: false };
  }
}

// ---------- Adaptadores NATIVOS (STUBS · Zona 10) ----------
// Registran el token y dejan constancia, pero NO envian: requieren credenciales
// del dueño (Firebase para FCM, certificado APNs para iOS, Tauri para desktop),
// indisponibles en este entorno. Ver TODOs al pie de cada funcion.

/** TODO (Zona 10): usar Firebase Cloud Messaging (server key / cuenta de servicio
 *  del proyecto del dueño + plugin @capacitor/push-notifications en el cliente).
 *  El token nativo ya queda guardado en DispositivoPush.tokenPush (raw). */
function pushFCM(d: Destinatario, payload: PayloadPush): void {
  console.log(
    `[push:android] pendiente (Zona 10) — FCM no configurado; titulo="${payload.titulo}" (dispositivo id=${d.id}).`,
  );
}

/** TODO (Zona 10): Apple Push Notification service con el certificado/key APNs y
 *  Team Key del equipo del dueño (plugin cordova/capacitor push + build iOS). */
function pushAPNs(d: Destinatario, payload: PayloadPush): void {
  console.log(
    `[push:ios] pendiente (Zona 10) — APNs no configurado; titulo="${payload.titulo}" (dispositivo id=${d.id}).`,
  );
}

/** TODO (Zona 10): notificacion nativa de escritorio via Tauri (plugin notification).
 *  El token desktop se registra aqui pero el transporte real llega con el empaquetado. */
function pushDesktop(d: Destinatario, payload: PayloadPush): void {
  console.log(
    `[push:desktop] pendiente (Zona 10) — Tauri/desktop no empaquetado; titulo="${payload.titulo}" (dispositivo id=${d.id}).`,
  );
}

/**
 * DISPATCHER principal: recorre los destinatarios y delega en el adaptador de su
 * plataforma. Agrega estadisticas. Nunca propaga una excepcion al llamante.
 */
export async function enviarPush(params: {
  payload: PayloadPush;
  destinatarios: Destinatario[];
}): Promise<ResultadoEnvio> {
  const { payload, destinatarios } = params;
  const resultado: ResultadoEnvio = {
    total: destinatarios.length,
    enviados: 0,
    fallidos: 0,
    eliminados: 0,
    pendientes: 0,
  };

  for (const d of destinatarios) {
    try {
      if (d.plataforma === 'web') {
        const r = await pushWeb(d, payload);
        if (r.ok) resultado.enviados += 1;
        else {
          resultado.fallidos += 1;
          if (r.muerto) resultado.eliminados += 1;
        }
      } else if (d.plataforma === 'android') {
        pushFCM(d, payload);
        resultado.pendientes += 1;
      } else if (d.plataforma === 'ios') {
        pushAPNs(d, payload);
        resultado.pendientes += 1;
      } else if (d.plataforma === 'desktop') {
        pushDesktop(d, payload);
        resultado.pendientes += 1;
      } else {
        // Plataforma desconocida: no debe ocurrir (enum), pero se registra y sigue.
        console.warn(`[push] plataforma desconocida "${d.plataforma}" (id=${d.id}); se omite.`);
        resultado.fallidos += 1;
      }
    } catch (e) {
      // Cinturon de seguridad: ningun destino puede tumbar el lote.
      console.error(`[push] error inesperado enviando a id=${d.id}:`, (e as Error).message);
      resultado.fallidos += 1;
    }
  }

  return resultado;
}

/** Helper: convierte filas de DispositivoPush al tipo Destinatario. */
export function aDestinatario(fila: {
  id: string;
  tokenPush: string;
  plataforma: PlataformaPush;
}): Destinatario {
  return { id: fila.id, tokenPush: fila.tokenPush, plataforma: fila.plataforma };
}
