// Zona 11 — helpers HTTP para supertest.
import request from 'supertest';
import type { Express } from 'express';
import { crearApp, type OpcionesApp } from '../../app.js';
import { ADMIN_TEST } from './constantes.js';

/** App de pruebas. Sin opts: los limitadores van DESACTIVADOS (NODE_ENV=test). */
export function appDePrueba(opts: OpcionesApp = {}): Express {
  return crearApp(opts);
}

/** Login de admin -> token JWT (falla con contexto si el login no va). */
export async function tokenAdmin(app: Express): Promise<string> {
  const r = await request(app)
    .post('/api/admin/auth/login')
    .send({ email: ADMIN_TEST.email, password: ADMIN_TEST.password });
  if (r.status !== 200 || typeof r.body?.token !== 'string') {
    throw new Error(`login admin fallo: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.token;
}
