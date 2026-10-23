// Tour de bienvenida — el recorrido por las zonas de la app para quien llega por
// primera vez a un dispositivo (Fase 7).
//
// La marca de "ya lo vi" es LOCAL a propósito: la pregunta que responde es "¿este
// teléfono/PC ya vio el tour?", no "¿esta cuenta ya lo vio?". Si viviera en
// `lib/preferencias.ts` (que se espeja al servidor), la app no se volvería a explicar
// nunca en el dispositivo donde de verdad se va a usar — que es justo donde hace falta.
import { useSyncExternalStore } from 'react';

const CLAVE = 'legal.tour.v1';

let abierto = false;
const oyentes = new Set<() => void>();

function notificar(): void {
  for (const oír of oyentes) oír();
}

/** `false` en cuanto el dispositivo ya terminó (o saltó) el recorrido. */
export function tourPendiente(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== 'visto';
  } catch {
    return false; // navegador sin almacenamiento (modo privado estricto): no insistir
  }
}

export function abrirTour(): void {
  abierto = true;
  notificar();
}

/** Sale del recorrido y marca la tarjeta de "ya lo vi" en este dispositivo. */
export function cerrarTour(): void {
  abierto = false;
  try {
    localStorage.setItem(CLAVE, 'visto');
  } catch {
    /* sin almacenamiento: el tour volverá a salir, no hay forma de recordarlo */
  }
  notificar();
}

function suscribir(oír: () => void): () => void {
  oyentes.add(oír);
  return () => {
    oyentes.delete(oír);
  };
}

export function useTourAbierto(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => abierto,
    () => false,
  );
}
