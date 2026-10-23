// Zona 11 — entorno del WORKER de pruebas (setupFiles).
//
// Se ejecuta en el proceso de test ANTES de que cualquier modulo del backend
// (prisma.ts / jwt.ts / webpush.ts) lea `process.env` en su carga de modulo.
// Carga backend/.env (para JWT_SECRET, VAPID_*, DATABASE_URL base) y luego
// REDIRIGE la base a `legal_test` y apaga los limitadores para la suite.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as cargarDotenv } from 'dotenv';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
cargarDotenv({ path: path.join(backendDir, '.env') });

/** Reescribe el nombre de la base de una URL de Postgres (conserva query). */
export function conBase(url: string, base: string): string {
  const u = new URL(url);
  u.pathname = `/${base}`;
  return u.toString();
}

const base = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5544/legal';
process.env.DATABASE_URL = conBase(base, 'legal_test');

process.env.NODE_ENV = 'test';
// Los tests de 429 construyen su propia app con umbrales bajos; la app por
// defecto de la suite NO debe auto-limitar el resto.
process.env.RATE_LIMIT_DISABLED = '1';
// El worker no hace red real; se anulan las esperas del throttle de conectores.
process.env.CONNECTOR_MIN_DELAY_MS = '0';
process.env.CONNECTOR_JITTER_MS = '0';
