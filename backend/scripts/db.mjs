// ---------------------------------------------------------------------------
// Zona 0 - Base de datos PostgreSQL EMBEBIDA (no hay PostgreSQL instalado en el
// sistema y no se usa Docker).
//
//   npm run db     -> levanta PostgreSQL y se queda escuchando hasta Ctrl+C
//
// Configuracion:
//   host      localhost        puerto  5544  (no estandar, evita conflictos)
//   usuario   postgres         password postgres
//   base      legal
//   DATABASE_URL = postgresql://postgres:postgres@localhost:5544/legal
//
// DONDE SE GUARDAN LOS DATOS (importante en Windows):
//   Los binarios de PostgreSQL (initdb.exe / postgres.exe) fallan cuando la
//   carpeta de datos contiene ESPACIOS o caracteres no ASCII. Este proyecto
//   vive en "C:\Users\harol\Desktop\App de asistencia de trabajo", que tiene
//   espacios, por lo que backend/.pgdata NO es una ubicacion segura.
//   Por eso el directorio de datos se fija fuera del proyecto, en una ruta
//   absoluta sin espacios:  C:/Users/harol/.legal-pgdata
//   (variable PGDATA_DIR en backend/.env; ver .env.example).
//   backend/.pgdata/ sigue ignorado en .gitignore por si en el futuro el
//   proyecto se mueve a una ruta sin espacios.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PORT = 5544;
const USER = 'postgres';
const PASSWORD = 'postgres';
const DATABASE = 'legal';

/** Rutas que PostgreSQL puede manejar en Windows: solo ASCII y sin espacios. */
function isSafeWindowsPath(candidate) {
  return typeof candidate === 'string' && /^[A-Za-z0-9:._/\\-]+$/.test(candidate);
}

/**
 * Orden de resolucion del directorio de datos:
 *  1. PGDATA_DIR (backend/.env) si es segura.
 *  2. backend/.pgdata dentro del proyecto, si la ruta del proyecto no tiene
 *     espacios ni caracteres raros (funciona cuando el repo se clona en C:/dev/...).
 *  3. Fallback: ~/.legal-pgdata (ruta absoluta sin espacios) <- caso de esta maquina.
 */
function resolveDatabaseDir() {
  const fromEnv = process.env.PGDATA_DIR?.trim();
  if (fromEnv) {
    return { dir: path.resolve(fromEnv), source: 'PGDATA_DIR (backend/.env)' };
  }

  const inProject = path.join(backendDir, '.pgdata');
  if (isSafeWindowsPath(inProject)) {
    return { dir: inProject, source: 'backend/.pgdata (ruta del proyecto sin espacios)' };
  }

  return {
    dir: path.join(os.homedir(), '.legal-pgdata'),
    source: '~/.legal-pgdata (fallback por espacios en la ruta del proyecto)',
  };
}

const { dir: databaseDir, source: databaseDirSource } = resolveDatabaseDir();
fs.mkdirSync(databaseDir, { recursive: true });

const connectionString = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;

/**
 * ¿Ya hay un PostgreSQL nuestro escuchando? Se probea consultando de verdad (no
 * solo el puerto) para no confundir un `postmaster.pid` viejo de un cierre brusco
 * con un servidor vivo: en ese caso hay que seguir adelante y dejar que start()
 * informe del lock.
 */
async function baseYaLevantada() {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

console.log('[db] PostgreSQL embebida');
console.log(`[db]   datos    : ${databaseDir}`);
console.log(`[db]   origen   : ${databaseDirSource}`);
console.log(`[db]   conexion : ${connectionString}`);

if (!isSafeWindowsPath(databaseDir)) {
  console.error(
    '[db] ERROR: la ruta de datos contiene caracteres no soportados por PostgreSQL.\n' +
      '[db]        Ajusta PGDATA_DIR en backend/.env a una ruta sin espacios y solo ASCII.',
  );
  process.exit(1);
}

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  // persistent: true -> al detenerse NO se borran los datos (se conservan entre arranques).
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C', '--nosync'],
  onLog: (message) => console.log(`[postgres] ${message}`),
  onError: (message) => console.error(`[postgres] ${message}`),
});

if (await baseYaLevantada()) {
  // Idempotencia: si `npm run db` ya corre en otra terminal, no intentar un
  // segundo postmaster sobre el mismo PGDATA (Postgres lo rechaza con el lock).
  console.log(`[db] ya hay un PostgreSQL escuchando en localhost:${PORT}, no se arranca otro.`);
  console.log('[db] para reiniciarlo: Ctrl+C en la ventana donde lo corriste y vuelve a ejecutar este comando.');
  console.log(`[db] lista para usar -> DATABASE_URL=${connectionString}`);
  process.exit(0);
}

// initialise() solo la primera vez (crea el claster con initdb).
if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) {
  console.log('[db] iniciando el claster (initdb, unos segundos)...');
  await postgres.initialise();
} else {
  console.log('[db] el claster ya existe, se omite initdb.');
}

try {
  await postgres.start();
} catch (error) {
  // embedded-postgres rechaza con un texto suelto, no con un Error.
  const detalle = typeof error === 'string' ? error : (error?.message ?? String(error));
  console.error(`[db] ERROR: no se pudo iniciar PostgreSQL.\n[db]   ${detalle.trim()}`);
  if (/postmaster\.pid|already exists/i.test(detalle)) {
    console.error(
      `[db]   el claster lo tiene otro proceso: cierra esa terminal con Ctrl+C, o mata el\n` +
        `      postgres.exe del PID indicado. Si ya no hay ninguno, borra el postmaster.pid\n` +
        `      que quedó viejo dentro de ${databaseDir}.`,
    );
  }
  process.exit(1);
}
console.log(`[db] escuchando en localhost:${PORT} (Ctrl+C para detener)`);

// La base "legal" no la crea initdb: se crea si falta.
const admin = postgres.getPgClient('postgres', 'localhost');
try {
  await admin.connect();
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DATABASE]);
  if (rows.length === 0) {
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    console.log(`[db] base de datos "${DATABASE}" creada`);
  } else {
    console.log(`[db] base de datos "${DATABASE}" ya existe`);
  }
} finally {
  await admin.end().catch(() => {});
}

console.log(`[db] lista para usar -> DATABASE_URL=${connectionString}`);

// Quedarse vivo hasta que el usuario interrumpa. embedded-postgres registra su
// propio cleanup de salida, pero paramos el servidor de forma explicita y ordenada.
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n[db] recibido ${signal}, deteniendo PostgreSQL...`);
  try {
    await postgres.stop();
  } catch (error) {
    console.error('[db] error al detener:', error?.message ?? error);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// El proceso hijo de PostgreSQL no mantiene vivo el event loop de Node.
setInterval(() => {}, 1 << 30);
