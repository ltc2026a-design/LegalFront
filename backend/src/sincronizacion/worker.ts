// Zona 11 — WORKER de sincronizacion (proceso SEPARADO de la API).
//
// Antes (Zona 6) el cron de sincronizacion se arrancaba dentro del proceso de
// la API, protegido por ENABLE_CRON=1. A partir de Zona 11 pasa a su propio
// proceso para que un conector lento/que falla jamas degrade la latencia de la
// API publica. La API (src/server.ts) ya NO importa ni arranca el programador.
//
// Uso:
//   npm run worker        (o, desde la raiz: npm run worker)
//   -> tsx backend/src/sincronizacion/worker.ts
//
// Sincroniza SEGUN el FuenteOficial.frecuenciaSincronizacion de las fuentes
// activas con conectorKey. Cada ejecucion queda aislada (ver cron.ts /
// orquestador.ts: un fallo no tumba el worker). El disparo manual/on-demand
// (admin "forzar sincronizacion" y `npm run sync`) NO vive aqui: el admin lo
// invoca bajo demanda a traves del orquestador.
import '../lib/entorno.js';
import { prisma } from '../lib/prisma.js';
import { iniciarProgramador, detenerProgramador } from './cron.js';

const programadas = iniciarProgramador();
console.log(
  `[worker] programador de sincronizacion iniciado (fuentes programadas ~${programadas}). ` +
    'Proceso independiente de la API. Ctrl+C para detener.',
);

let cerrando = false;
async function cerrar(signal: string): Promise<void> {
  if (cerrando) return;
  cerrando = true;
  console.log(`[worker] ${signal}: deteniendo programador...`);
  detenerProgramador();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void cerrar('SIGINT'));
process.on('SIGTERM', () => void cerrar('SIGTERM'));
