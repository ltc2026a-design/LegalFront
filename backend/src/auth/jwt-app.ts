// Fase 2 — tokens de sesion de la app de consulta (persona, no admin).
//
// Es un mecanismo SEPARADO del de Zona 7 a proposito: si algun dia se comparte el
// secreto, un token de cliente no puede abrir el panel de administracion ni al reves.
// Para eso el payload lleva `tipo: 'app'` y `verificarTokenApp` lo exige; del otro
// lado, `auth/jwt.ts` rechaza cualquier token que traiga `tipo`.
//
// Duracion larga (60 dias por defecto): la app vive en el telefono, y pedir el correo
// cada semana empuja a la gente a anotar la contrasena en un papel.
// Envuelve en backend/.env: JWT_APP_SECRET (opcional, cae a JWT_SECRET), JWT_APP_EXPIRES.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';

const SECRET = process.env.JWT_APP_SECRET || process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error(
    'Falta JWT_SECRET (o JWT_APP_SECRET) en el entorno (backend/.env). Sin secreto no se pueden firmar sesiones de la app.',
  );
}
const EXPIRES = process.env.JWT_APP_EXPIRES ?? '60d';

export interface AppClaims {
  sub: string;
  deviceId: string;
  nombre: string;
}

/** Datos de sesion que devuelve el login. */
export interface AppSesion {
  id: string;
  deviceId: string;
  nombre: string;
  email: string;
}

export function firmarTokenApp(sesion: AppSesion): string {
  const claims = {
    sub: sesion.id,
    deviceId: sesion.deviceId,
    nombre: sesion.nombre,
    tipo: 'app',
  };
  return jwt.sign(claims, SECRET as string, { expiresIn: EXPIRES } as SignOptions);
}

/** Reclamos si el token es valido y es de cliente; null en cualquier otro caso. */
export function verificarTokenApp(token: string): AppClaims | null {
  try {
    const dec = jwt.verify(token, SECRET as string);
    if (typeof dec === 'string') return null;
    const p = dec as JwtPayload;
    if (p.tipo !== 'app' || !p.sub || !p.deviceId || typeof p.nombre !== 'string') return null;
    return { sub: String(p.sub), deviceId: String(p.deviceId), nombre: p.nombre };
  } catch {
    return null;
  }
}
