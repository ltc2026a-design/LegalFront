// Mejora — Historial de BUSQUEDAS (las ultimas consultas de texto del buscador).
//
// Distinto de lib/historial.ts (que guarda articulos/libros abiertos = "continuar donde
// ibas"): aqui van los TERMINOS que la persona escribio, para repetirlos rapido.
//
// Mismo patron de store de modulo: vive SOLO en este telefono (localStorage) y NUNCA se
// sube a la cuenta. Respeta el boton de privacidad "Guardar mis preguntas"
// (preferencias.guardarHistorial): si esta apagado, no se registra ninguna busqueda.
import { useSyncExternalStore } from 'react';
import { obtenerPreferencias } from './preferencias';

const CLAVE_LS = 'legal.busquedas.v1';
const MAX = 8;

function normalizar(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase();
}

function leer(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE_LS);
    if (!crudo) return [];
    const arr: unknown = JSON.parse(crudo);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

let lista: string[] = leer();
const oyentes = new Set<() => void>();

function notificar(): void {
  for (const oir of oyentes) oir();
}

function persistir(): void {
  try {
    localStorage.setItem(CLAVE_LS, JSON.stringify(lista));
  } catch {
    /* almacenamiento lleno o modo privado: sigue valiendo en memoria */
  }
}

/**
 * Apunta una consulta. Dedupe (la mas reciente abre primero) y corta a MAX. Con el
 * historial apagado, se sale sin guardar. Se ignora lo demasiado corto para servir.
 */
export function registrarBusqueda(q: string): void {
  if (!obtenerPreferencias().preferencias.guardarHistorial) return;
  const termino = normalizar(q);
  if (termino.length < 2) return;
  lista = [termino, ...lista.filter((x) => x !== termino)].slice(0, MAX);
  persistir();
  notificar();
}

export function limpiarBusquedas(): void {
  if (lista.length === 0) return;
  lista = [];
  persistir();
  notificar();
}

function suscribir(oir: () => void): () => void {
  oyentes.add(oir);
  return () => {
    oyentes.delete(oir);
  };
}

function instantanea(): string[] {
  return lista;
}

export function useBusquedasRecientes(): string[] {
  return useSyncExternalStore(suscribir, instantanea, instantanea);
}
