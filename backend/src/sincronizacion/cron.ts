// Zona 6 — PROGRAMADOR de sincronizacion (node-cron).
//
// Traduce FuenteOficial.frecuenciaSincronizacion (string) a una expresion cron y
// agenda cada fuente sincronizable (conectorKey no nula, estado 'activa'). Cada
// ejecucion va aislada en try/catch para que un conector que falle (p.ej. red
// inalcanzable) no tumbe el resto del cron ni la API.
//
// Zona 11: este programador ya NO se arranca desde la API (src/server.ts). Vive
// SOLO en el proceso dedicado del worker (`npm run worker` ->
// src/sincronizacion/worker.ts), para que un conector lento/que falla (p. ej. red
// filtrada hacia los .gob.mx) nunca degrade la latencia de la API publica ni
// dispare llamadas de red inesperadas desde el servidor HTTP.
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { ejecutarSincronizacion } from './orquestador.js';

const FRECUENCIAS: Record<string, string> = {
  por_hora: '0 * * * *',
  diaria: '0 3 * * *',
  semanal: '0 3 * * 1',
};

const SIN_AGENDA = new Set(['manual', 'nunca', '']);

/** Devuelve la expresion cron para una frecuencia o null si no se programa. */
export function mapearFrecuencia(frecuencia: string | null): string | null {
  if (!frecuencia) return null;
  const f = frecuencia.trim().toLowerCase();
  if (SIN_AGENDA.has(f)) return null;
  if (FRECUENCIAS[f]) return FRECUENCIAS[f];
  // Si ya parece una expresion cron (5 campos separados por espacio), usarla tal cual.
  const campos = f.split(/\s+/);
  if (campos.length === 5) return campos.join(' ');
  return null;
}

const tareas: ScheduledTask[] = [];

/** Agenda las fuentes sincronizables. Idempotente: limpia antes de volver a agendar. */
export function iniciarProgramador(): number {
  detenerProgramador();

  const fuentesPromise = prisma.fuenteOficial.findMany({
    where: { estado: 'activa', conectorKey: { not: null } },
    select: { id: true, nombre: true, frecuenciaSincronizacion: true, conectorKey: true },
  });

  fuentesPromise
    .then((fuentes) => {
      let programadas = 0;
      for (const fuente of fuentes) {
        const expr = mapearFrecuencia(fuente.frecuenciaSincronizacion);
        if (!expr) continue;
        const task = cron.schedule(expr, () => {
          // Aislamiento por fuente: nunca deja salir el rechazo al event loop.
          ejecutarSincronizacion(fuente.id).catch((err) => {
            console.error(`[cron] fallo al sincronizar ${fuente.nombre}:`, err);
          });
        });
        tareas.push(task);
        programadas += 1;
        console.log(`[cron] programada ${fuente.nombre} -> "${expr}"`);
      }
      console.log(`[cron] ${programadas} fuente(s) programadas.`);
    })
    .catch((err) => {
      console.error('[cron] no se pudieron cargar las fuentes:', err);
    });

  return tareas.length;
}

/** Detiene todas las tareas de cron (usado en shutdown / reinicio). */
export function detenerProgramador(): void {
  for (const t of tareas) {
    try {
      t.stop();
    } catch {
      /* ignorar */
    }
  }
  tareas.length = 0;
}
