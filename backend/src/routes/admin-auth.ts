// Zona 7 — autenticacion del admin.
//
// REGLA DURA DE PRODUCTO: NO existe autorregistro de administradores ni
// recuperacion de contrasena. Las credenciales SOLO se crean por CLI
// (`npm run admin:create`, ver src/cli/crear-admin.ts). Esta ruta unicamente
// verifica credenciales ya existentes.
//
// `POST /auth/login` va SIN requireAdmin (es la puerta de entrada) y LLEVA un
// loginLimiter (5 fallos / 15 min) que se le aplica desde la factoria de app
// (ver src/app.ts y src/middleware/limiters.ts), no aqui, para poder
// desactivar/relajar los limites en la suite de pruebas. `GET /auth/me` si usa
// requireAdmin. El resto de /api/admin/* se protege en su propio router.
import argon2 from 'argon2';
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { firmarToken, type AdminSesion } from '../auth/jwt.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const adminAuthRouter = Router();

// Mensaje GENERIC (mismo codigo y estado) para email inexistente, contrasena
// incorrecta o campos vacios: no se revela que campo fallo.
adminAuthRouter.post('/auth/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(401).json(errorJson('credenciales_invalidas'));
    return;
  }

  const admin = await prisma.usuarioAdmin.findUnique({ where: { email } });
  if (!admin) {
    res.status(401).json(errorJson('credenciales_invalidas'));
    return;
  }

  let valido: boolean;
  try {
    valido = await argon2.verify(admin.passwordHash, password);
  } catch {
    valido = false;
  }
  if (!valido) {
    res.status(401).json(errorJson('credenciales_invalidas'));
    return;
  }

  const sesion: AdminSesion = {
    id: admin.id,
    nombre: admin.nombre,
    email: admin.email,
    rol: admin.rol,
  };
  const token = firmarToken(sesion);
  res.status(200).json({ token, admin: sesion });
});

adminAuthRouter.get('/auth/me', requireAdmin, (req, res) => {
  res.status(200).json({ admin: req.admin });
});
