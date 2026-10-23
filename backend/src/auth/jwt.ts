// Zona 7 — emision y verificacion de tokens JWT de sesion del panel de admin.
// Unico mecanismo de sesion del admin: no hay cookies, no hay recuperacion de
// contrasena. El secreto y la duracion vienen del entorno
// (backend/.env: JWT_SECRET, JWT_EXPIRES).
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import type { RolAdmin } from '../generated/prisma/client.js';

function requireSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error(
      'Falta JWT_SECRET en el entorno (backend/.env). Sin el secreto no se pueden firmar tokens de administracion.',
    );
  }
  return s;
}

// El secreto se lee AL FIRMAR/VERIFICAR, no al importar el modulo: en una funcion
// de Vercel la app Express se construye antes de la primera peticion y un throw
// ahi deja el despliegue como `FUNCTION_INVOCATION_FAILED` sin ninguna pista.
const EXPIRES = process.env.JWT_EXPIRES ?? '8h';

/** Reclamos que van dentro del token. */
export interface AdminClaims {
  sub: string;
  nombre: string;
  rol: RolAdmin;
}

/** Datos de sesion que devuelve el login (incluye email, que no va en el token). */
export interface AdminSesion {
  id: string;
  nombre: string;
  email: string;
  rol: RolAdmin;
}

export function firmarToken(admin: AdminSesion): string {
  const claims: AdminClaims = { sub: admin.id, nombre: admin.nombre, rol: admin.rol };
  const options = { expiresIn: EXPIRES } as SignOptions;
  return jwt.sign(claims, requireSecret(), options);
}

/** Devuelve los reclamos si el token es valido; null en cualquier otro caso. */
export function verificarToken(token: string): AdminClaims | null {
  const secreto = requireSecret();
  try {
    const dec = jwt.verify(token, secreto);
    if (typeof dec === 'string') return null;
    const p = dec as JwtPayload;
    if (!p.sub || typeof p.nombre !== 'string') return null;
    // Un token de la app de consulta (Fase 2) NUNCA autentica admin, aunque compartan
    // el secreto: los dos mecanismos se invalidan cruzados por esta marca.
    if (p.tipo === 'app') return null;
    return { sub: String(p.sub), nombre: p.nombre, rol: p.rol as RolAdmin };
  } catch {
    return null;
  }
}
