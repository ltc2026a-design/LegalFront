// Fase 2 — middleware de la sesion de persona (app de consulta).
//
// Igual que requireAdmin: `Authorization: Bearer <JWT>` o 401 `no_autenticado`.
// Ademas relee la fila en la base, así que una cuenta borrada por el dueno deja de
// funcionar al instante (el token seguiria siendo criptograficamente valido).
import type { NextFunction, Request, Response } from 'express';
import { errorJson } from '../http/errors.js';
import { verificarTokenApp } from '../auth/jwt-app.js';
import { prisma } from '../lib/prisma.js';

export interface UsuarioAppContexto {
  id: string;
  deviceId: string;
  nombre: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuarioApp?: UsuarioAppContexto;
    }
  }
}

export function requireAppUser(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }
  const claims = verificarTokenApp(token);
  if (!claims) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }
  prisma.usuarioApp
    .findUnique({
      where: { id: claims.sub },
      select: { id: true, deviceId: true, nombre: true, loginEmail: true },
    })
    .then((fila) => {
      if (!fila || !fila.loginEmail) {
        res.status(401).json(errorJson('no_autenticado'));
        return;
      }
      req.usuarioApp = { id: fila.id, deviceId: fila.deviceId, nombre: fila.nombre ?? '' };
      next();
    })
    .catch(() => {
      res.status(500).json(errorJson('error_interno'));
    });
}
