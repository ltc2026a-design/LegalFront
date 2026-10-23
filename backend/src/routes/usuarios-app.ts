// Fase 2 — sesion de la app de consulta (persona).
//
// REGLA DURA DE PRODUCTO (requisito #1): NO hay autorregistro. No existe POST de alta
// ni UI de "crear cuenta": las credenciales las crea solo el dueno con
// `npm run usuario:create` (ver src/cli/crear-usuario.ts). Estas rutas solo verifican.
//
//   POST  /api/app/login        { email, password, deviceId? }  -> { token, usuario }
//   GET   /api/app/yo           (Bearer)  -> { usuario, favoritos, preferencias }
//   PATCH /api/app/preferencias (Bearer)  -> guarda el perfil de lectura/avisos
//
// El login va sin auth pero con el MISMO loginLimiter de Zona 7 (5 fallos / 15 min por
// IP+correo, montado en src/app.ts). El mensaje de fallo es generico: no dice si el
// correo existe.
//
// `deviceId` del telefono es opcional y sirve para una sola cosa: heredar en la cuenta
// los articulos que esa persona ya tenia marcados como favoritos en el dispositivo
// (así el perfil no arranca vacio). Es una COPIA: la lista del dispositivo sigue intacta
// para quien use la app sin iniciar sesion.
import { Router } from 'express';
import argon2 from 'argon2';
import { errorJson } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { firmarTokenApp, type AppSesion } from '../auth/jwt-app.js';
import { requireAppUser } from '../middleware/requireAppUser.js';

export const appUsuarioRouter = Router();

/** Copia (no mueve) los favoritos del dispositivo anonimo a la cuenta. */
async function heredarFavoritosDeDispositivo(usuarioAppId: string, deviceId: string): Promise<number> {
  const anonimo = await prisma.usuarioApp.findUnique({
    where: { deviceId },
    select: { id: true, favoritos: { select: { articuloId: true } } },
  });
  if (!anonimo || anonimo.id === usuarioAppId || anonimo.favoritos.length === 0) return 0;

  const yaEnCuenta = new Set(
    (
      await prisma.favorito.findMany({
        where: { usuarioAppId, articuloId: { in: anonimo.favoritos.map((f) => f.articuloId) } },
        select: { articuloId: true },
      })
    ).map((f) => f.articuloId),
  );
  const nuevos = anonimo.favoritos
    .filter((f) => !yaEnCuenta.has(f.articuloId))
    .map((f) => ({ usuarioAppId, articuloId: f.articuloId }));
  if (nuevos.length === 0) return 0;

  const r = await prisma.favorito.createMany({ data: nuevos, skipDuplicates: true });
  return r.count;
}

appUsuarioRouter.post('/app/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const deviceId =
    typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim().slice(0, 200) : '';

  if (!email || !password) {
    res.status(401).json(errorJson('credenciales_invalidas'));
    return;
  }

  const cuenta = await prisma.usuarioApp.findUnique({ where: { loginEmail: email } });
  if (!cuenta?.passwordHash) {
    res.status(401).json(errorJson('credenciales_invalidas'));
    return;
  }

  let valido: boolean;
  try {
    valido = await argon2.verify(cuenta.passwordHash, password);
  } catch {
    valido = false;
  }
  if (!valido) {
    res.status(401).json(errorJson('credenciales_invalidas'));
    return;
  }

  if (deviceId) {
    try {
      await heredarFavoritosDeDispositivo(cuenta.id, deviceId);
    } catch (e) {
      // La herencia es comoda, no critico: un fallo aqui no puede dejar a la persona
      // sin iniciar sesion.
      console.warn('[app/login] no se pudieron heredar los favoritos del dispositivo:', e);
    }
  }

  await prisma.usuarioApp
    .update({ where: { id: cuenta.id }, data: { ultimoAccesoEn: new Date() } })
    .catch(() => undefined);

  const sesion: AppSesion = {
    id: cuenta.id,
    // SIEMPRE el device_id de la CUENTA (no el del telefono que se uso para entrar):
    // es la clave bajo la que viven sus favoritos, así la lista sigue a la persona
    // de un teléfono a otro. El deviceId del cuerpo solo sirvió para la copia.
    deviceId: cuenta.deviceId,
    nombre: cuenta.nombre ?? cuenta.loginEmail ?? '',
    email: cuenta.loginEmail ?? '',
  };
  res.status(200).json({
    token: firmarTokenApp(sesion),
    usuario: { id: sesion.id, nombre: sesion.nombre, email: sesion.email, deviceId: sesion.deviceId },
  });
});

// ---- Preferencias (Fase 4) ---------------------------------------------------
//
// Guardado PARCIAL: solo se toca lo que viene en el cuerpo, así la pantalla de
// perfil puede mandar un solo switch al cambiarlo. Un valor invalido se rechaza
// con 400 `preferencias_invalidas` (sin escribir a medias).
const TEMAS = new Set(['claro', 'oscuro', 'auto']);
const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const LETRA_MIN = 85;
const LETRA_MAX = 140;

const PREFERENCIAS_SELECT = {
  tema: true,
  tamanoLetra: true,
  codigoFavorito: true,
  notificaciones: true,
  silencioDesde: true,
  silencioHasta: true,
  guardarHistorial: true,
} as const;

/** Campos escribibles del PATCH (los que manda la pantalla de perfil). */
interface PreferenciasEscritura {
  tema?: string;
  tamanoLetra?: number;
  codigoFavorito?: string | null;
  notificaciones?: boolean;
  silencioDesde?: string | null;
  silencioHasta?: string | null;
  guardarHistorial?: boolean;
}

appUsuarioRouter.get('/app/yo', requireAppUser, async (req, res) => {
  const id = req.usuarioApp!.id;
  const [usuario, totalFavoritos] = await Promise.all([
    prisma.usuarioApp.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        loginEmail: true,
        creadoEn: true,
        preferencias: { select: PREFERENCIAS_SELECT },
      },
    }),
    prisma.favorito.count({ where: { usuarioAppId: id } }),
  ]);
  if (!usuario) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }
  res.status(200).json({
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre ?? '',
      email: usuario.loginEmail ?? '',
      creadoEn: usuario.creadoEn,
    },
    favoritos: totalFavoritos,
    preferencias: usuario.preferencias ?? null,
  });
});

// ---- Preferencias (Fase 4) ---------------------------------------------------
//
// Guardado PARCIAL: solo se toca lo que viene en el cuerpo, asi la pantalla de
// perfil puede mandar un solo switch al cambiarlo. Un valor invalido se rechaza
// con 400 `preferencias_invalidas` (sin escribir a medias).
appUsuarioRouter.patch('/app/preferencias', requireAppUser, async (req, res) => {
  const cuerpo = (req.body ?? {}) as Record<string, unknown>;
  const datos: PreferenciasEscritura = {};
  const invalidos: string[] = [];

  if ('tema' in cuerpo) {
    if (typeof cuerpo.tema === 'string' && TEMAS.has(cuerpo.tema)) datos.tema = cuerpo.tema;
    else invalidos.push('tema');
  }
  if ('tamanoLetra' in cuerpo) {
    const n = Number(cuerpo.tamanoLetra);
    // El deslizador puede pasarse del rango: se ajusta en vez de devolver 400.
    if (Number.isFinite(n)) datos.tamanoLetra = Math.min(LETRA_MAX, Math.max(LETRA_MIN, Math.round(n)));
    else invalidos.push('tamanoLetra');
  }
  if ('codigoFavorito' in cuerpo) {
    if (cuerpo.codigoFavorito === null) datos.codigoFavorito = null;
    else if (typeof cuerpo.codigoFavorito === 'string') {
      const slug = cuerpo.codigoFavorito.trim().slice(0, 80);
      datos.codigoFavorito = slug || null;
    } else invalidos.push('codigoFavorito');
  }
  for (const campo of ['notificaciones', 'guardarHistorial'] as const) {
    if (!(campo in cuerpo)) continue;
    const v = cuerpo[campo];
    if (typeof v === 'boolean') datos[campo] = v;
    else invalidos.push(campo);
  }
  for (const campo of ['silencioDesde', 'silencioHasta'] as const) {
    if (!(campo in cuerpo)) continue;
    const v = cuerpo[campo];
    // '' == "sin franja" (un <input type="time"> vacio).
    if (v === null || v === '') datos[campo] = null;
    else if (typeof v === 'string' && HORA.test(v)) datos[campo] = v;
    else invalidos.push(campo);
  }

  if (invalidos.length > 0) {
    res.status(400).json({ error: 'preferencias_invalidas', campos: invalidos });
    return;
  }

  const usuarioAppId = req.usuarioApp!.id;
  const guardadas = await prisma.preferenciasApp.upsert({
    where: { usuarioAppId },
    update: datos,
    create: { usuarioAppId, ...datos },
    select: PREFERENCIAS_SELECT,
  });
  res.status(200).json({ preferencias: guardadas });
});
