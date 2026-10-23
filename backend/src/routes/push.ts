// Zona 9 — Rutas PUBLICAS del push (la misma filosofia que favoritos Zona 5:
// identidad = device_id, SIN cuenta/contrasena). La app web de consulta:
//   1) lee nuestra clave VAPID publica para poder suscribirse, y
//   2) registra / da de baja su suscripcion como un DispositivoPush.
//
// La clave publica VAPID NO es secreta (se entrega al navegador). La privada
// jams sale del servidor. Los tokens nativos (android/ios/desktop) tambien se
// pueden registrar aqui: Zona 10 conectara su transporte real.
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { getPublicKey } from '../notificaciones/webpush.js';
import { Plataforma } from '../generated/prisma/client.js';

export const pushRouter = Router();

const PLATAFORMAS = Object.values(Plataforma); // ['web','android','ios','desktop']
const MAX_ENDPOINT = 2048;
const MAX_KEY = 512;
const MAX_DEVICE = 200;

/** Recorta y valida una cadena de entrada; null si no es string util. */
function txt(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

/** Endpoint embebido en tokenPush (web: JSON; nativo: crudo). */
function endpointDe(tokenPush: string): string | null {
  try {
    const o = JSON.parse(tokenPush) as { endpoint?: unknown };
    if (typeof o.endpoint === 'string') return o.endpoint;
  } catch {
    /* no es JSON: se trata como token nativo crudo */
  }
  return tokenPush;
}

// 1) Clave publica VAPID (la app la pasa a pushManager.subscribe()).
pushRouter.get('/push/vapid-public-key', (_req, res) => {
  const publicKey = getPublicKey();
  if (!publicKey) {
    res.status(500).json(errorJson('vapid_no_configurado'));
    return;
  }
  res.status(200).json({ publicKey });
});

// 2) Registrar (o actualizar) un dispositivo. Idempotente por endpoint+plataforma.
//    body: { deviceId?, endpoint, keys?:{p256dh,auth}, plataforma }
pushRouter.post('/app/dispositivos', async (req, res) => {
  const cuerpo = (req.body ?? {}) as {
    deviceId?: unknown;
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown } | null;
    plataforma?: unknown;
  };

  const plataforma = typeof cuerpo.plataforma === 'string' ? cuerpo.plataforma : '';
  if (!PLATAFORMAS.includes(plataforma as Plataforma)) {
    res.status(400).json(errorJson('plataforma_invalida'));
    return;
  }

  const endpoint = txt(cuerpo.endpoint, MAX_ENDPOINT);
  if (!endpoint) {
    res.status(400).json(errorJson('endpoint_requerido'));
    return;
  }

  const esWeb = plataforma === 'web';
  let tokenPush: string;
  if (esWeb) {
    const p256dh = typeof cuerpo.keys?.p256dh === 'string' ? cuerpo.keys.p256dh.trim() : '';
    const auth = typeof cuerpo.keys?.auth === 'string' ? cuerpo.keys.auth.trim() : '';
    if (!p256dh || !auth || p256dh.length > MAX_KEY || auth.length > MAX_KEY) {
      res.status(400).json(errorJson('keys_invalidas'));
      return;
    }
    // FORMATO WEB: suscripcion completa (endpoint + claves de cifrado).
    tokenPush = JSON.stringify({ endpoint, keys: { p256dh, auth } });
  } else {
    // FORMATO NATIVO: token crudo de la plataforma (FCM/APNs/desktop).
    tokenPush = endpoint;
  }

  // Vinculacion opcional al usuario anonimo (por device_id); sin cuenta/contrasena.
  let usuarioAppId: string | null = null;
  const deviceId = txt(cuerpo.deviceId, MAX_DEVICE);
  if (deviceId) {
    const usuario = await prisma.usuarioApp.upsert({
      where: { deviceId },
      update: {},
      create: { deviceId },
      select: { id: true },
    });
    usuarioAppId = usuario.id;
  }

  // Idempotencia: buscamos un registro con el MISMO endpoint y plataforma. Si
  // existe, lo actualizamos (token/keys y vinculacion) en vez de duplicarlo.
  const existentes = await prisma.dispositivoPush.findMany({
    where: { plataforma: plataforma as Plataforma },
    select: { id: true, tokenPush: true, usuarioAppId: true },
  });
  const igual = existentes.find((e) => endpointDe(e.tokenPush) === endpoint);

  if (igual) {
    const actualizado = await prisma.dispositivoPush.update({
      where: { id: igual.id },
      data: {
        tokenPush,
        // No se desvincula si ahora viene sin deviceId (undefined = no tocar).
        ...(usuarioAppId ? { usuarioAppId } : {}),
      },
      select: { id: true, plataforma: true },
    });
    res
      .status(200)
      .json({ dispositivo: { id: actualizado.id, plataforma: actualizado.plataforma } });
    return;
  }

  const creado = await prisma.dispositivoPush.create({
    data: { tokenPush, plataforma: plataforma as Plataforma, usuarioAppId },
    select: { id: true, plataforma: true },
  });
  res.status(201).json({ dispositivo: { id: creado.id, plataforma: creado.plataforma } });
});

// 3) Dar de baja: DELETE /api/app/dispositivos  { endpoint }  (o ?endpoint=...).
//    Borra TODAS las filas con ese endpoint (puede repetirse en varios usuarios
//    si el mismo navegador se registró con/sin deviceId).
pushRouter.delete('/app/dispositivos', async (req, res) => {
  const query = typeof req.query.endpoint === 'string' ? req.query.endpoint : undefined;
  const cuerpo = (req.body ?? {}) as { endpoint?: unknown };
  const endpoint = txt(query ?? cuerpo.endpoint, MAX_ENDPOINT);
  if (!endpoint) {
    res.status(400).json(errorJson('endpoint_requerido'));
    return;
  }

  const filas = await prisma.dispositivoPush.findMany({ select: { id: true, tokenPush: true } });
  const aBorrar = filas.filter((f) => endpointDe(f.tokenPush) === endpoint).map((f) => f.id);

  if (aBorrar.length > 0) {
    await prisma.dispositivoPush.deleteMany({ where: { id: { in: aBorrar } } });
  }
  res.status(200).json({ ok: true, eliminados: aBorrar.length });
});
