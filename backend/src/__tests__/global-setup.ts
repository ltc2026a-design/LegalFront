// Zona 11 — GLOBAL SETUP de la suite (corre UNA vez, en el proceso principal).
//
// Prepara una base de PRUEBAS AISLADA `legal_test` en la misma instancia de
// PostgreSQL embebida (127.0.0.1:5544). Estrategia:
//   1. comprueba que la base embebida este levantada (`npm run db`); si no,
//      falla con un mensaje claro (no la arrancamos nosotros para no dejar
//      procesos colgados al terminar),
//   2. crea `legal_test` si falta y la deja en el ultimo estado de migraciones
//      (`prisma migrate deploy`, no interactivo),
//   3. TRUNCATE ... CASCADE de todas las tablas => re-ejecuciones estables,
//   4. siembra UNICAMENTE el administrador de pruebas (hash argon2, misma via
//      que el CLI `admin:create`: argon2 + upsert; no hay endpoint publico de
//      credenciales). El contenido de cada test se crea/limpia en su propio
//      beforeAll/afterAll.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Client } from 'pg';
import argon2 from 'argon2';
import { config as cargarDotenv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { ADMIN_TEST } from './helpers/constantes.js';

const require = createRequire(import.meta.url);
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
cargarDotenv({ path: path.join(backendDir, '.env') });

/** Reescribe el nombre de la base de una URL de Postgres (conserva query). */
function conBase(url: string, base: string): string {
  const u = new URL(url);
  u.pathname = `/${base}`;
  return u.toString();
}

function dividirUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

const URL_BASE = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5544/legal';
const URL_TEST = conBase(URL_BASE, 'legal_test');

async function main(): Promise<void> {
  const { host, port, user, password } = dividirUrl(URL_BASE);

  // 1) La base embebida debe estar levantada (`npm run db`).
  const admin = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    connectionTimeoutMillis: 4000,
  });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(
      `[test] PostgreSQL embebida no disponible en ${host}:${port} (${String(
        (e as Error).message,
      )}). Levanta primero la base con \`npm run db\` y vuelve a lanzar \`npm test\`.`,
      { cause: e },
    );
  }

  // 2) Crear legal_test si falta.
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      'legal_test',
    ]);
    if (rows.length === 0) {
      // Nombre fijo (no es dato de usuario): segura la interpolacion.
      await admin.query('CREATE DATABASE legal_test');
      console.log('[test] base legal_test creada.');
    }
  } finally {
    await admin.end().catch(() => undefined);
  }

  // 3) Migrar legal_test al ultimo estado (no interactivo).
  const prismaBin = require.resolve('prisma/build/index.js');
  const mig = spawnSync(process.execPath, [prismaBin, 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: URL_TEST },
    encoding: 'utf8',
  });
  if (mig.status !== 0) {
    throw new Error(
      `[test] fallo al migrar legal_test:\n${mig.stdout ?? ''}\n${mig.stderr ?? ''}`,
    );
  }

  // 4) Limpieza total + siembra del admin de pruebas.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_TEST }) });
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "usuario_admin","fuente_oficial","codigo","seccion","articulo",' +
        '"historial_cambio_articulo","tarea_sincronizacion","usuario_app","favorito",' +
        '"preferencias_app","notificacion_cambio","dispositivo_push" RESTART IDENTITY CASCADE',
    );

    const passwordHash = await argon2.hash(ADMIN_TEST.password);
    await prisma.usuarioAdmin.upsert({
      where: { email: ADMIN_TEST.email },
      update: { passwordHash, nombre: ADMIN_TEST.nombre, rol: 'administrador' },
      create: {
        id: ADMIN_TEST.id,
        email: ADMIN_TEST.email,
        nombre: ADMIN_TEST.nombre,
        passwordHash,
        rol: 'administrador',
      },
    });
    console.log(`[test] legal_test lista (migrada + truncada + admin de pruebas sembrado).`);
  } finally {
    await prisma.$disconnect();
  }
}

// Vitest ejecuta `setup` (y opcionalmente `teardown`) del globalSetup una sola
// vez, en el proceso principal, ANTES de cargar los archivos de test.
export async function setup(): Promise<void> {
  await main();
}
