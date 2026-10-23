// Zona 3: cliente Prisma compartido por la API publica de consulta (SOLO LECTURA).
// Mismo patron que el seed: Prisma 7 + adaptador pg, con la URL desde el entorno.
//
// Postgres administrado (Neon, Supabase, Railway...): la URL lleva el modo SSL.
// Con Supabase tiene que ser `sslmode=no-verify`, no `require`: este driver `pg`
// trata `require` como `verify-full` y la cadena de certificados del pooler no es
// verificable en publico. En un VPS con Postgres en la misma maquina la URL va sin
// ese parametro y cifrar seria un gasto inutil.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Falta DATABASE_URL en el entorno (backend/.env).');
}

// Tope de conexiones: en el servidor gratuito (1 GB de RAM) cada conexion viva
// a Postgres cuesta unos 10 MB, y entre la API y el worker no pueden abrirlos
// todos. Con 10 por proceso sobra para el trafico de una biblioteca legal.
const limite = Number(process.env.PG_POOL_MAX ?? 10);

export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    max: limite,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  }),
});
