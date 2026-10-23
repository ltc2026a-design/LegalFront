// Zona 7 — middleware de autenticacion del admin. Valida `Authorization: Bearer <JWT>`
// y, si es correcto, cuelga req.admin = { id, nombre, rol }. Cualquier otro caso
// responde 401 { error: "no_autenticado" }. Se aplica a TODA la ruta /api/admin/*
// excepto el login (ver routes/admin-auth.ts y el montaje en server.ts).
import type { NextFunction, Request, Response } from 'express';
import { errorJson } from '../http/errors.js';
import { verificarToken } from '../auth/jwt.js';
import type { RolAdmin } from '../generated/prisma/client.js';

export interface AdminContexto {
  id: string;
  nombre: string;
  rol: RolAdmin;
}

// Ampliacion del Request de Express para exponer la identidad del admin.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContexto;
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }
  const claims = verificarToken(token);
  if (!claims) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }
  req.admin = { id: claims.sub, nombre: claims.nombre, rol: claims.rol };
  next();
}
