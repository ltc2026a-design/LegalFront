// Zona 9 — Configuracion de `web-push` con claves VAPID autogestionadas.
//
// Las claves VAPID se generan LOCALMENTE (ver backend/scripts/gen-vapid.mjs) y
// viven SOLO en backend/.env (ignorada por git). Con un par VAPID propio no se
// necesita ninguna cuenta externa (Firebase, Mozilla, etc.): el navegador se
// suscribe presentando nuestra clave publica y el servidor firma el envio con
// la privada. Cualquier servicio de push estandar (Chrome/Firefox/Edge/Safari
// en macOS) acepta ese encabezado VAPID.
//
// FORMATO ALMACENADO en DispositivoPush.tokenPush (documentado en envio.ts):
//   - web:     JSON.stringify({ endpoint, keys: { p256dh, auth } })  (suscripcion)
//   - nativo:  el token crudo de la plataforma (endpoint en la peticion POST).
import 'dotenv/config';
import webpush from 'web-push';

/** Clave publica VAPID para la app (GET /api/push/vapid-public-key). */
export function getPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

let configurado = false;

/**
 * Aplica las claves VAPID al modulo web-push (idempotente). Lanza si faltan:
 * sin ellas no se puede firmar ningun envio web, y es mejor un error claro en
 * el arranque de la operacion que un fallo silencioso por token.
 */
export function asegurarConfigurado(): void {
  if (configurado) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error(
      'Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en backend/.env. Ejecuta `npm run gen:vapid` (o `node backend/scripts/gen-vapid.mjs`).',
    );
  }
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@consulta-legal.local';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configurado = true;
}

export { webpush };
