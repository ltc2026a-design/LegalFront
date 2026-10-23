// Fase 5 — "Continuar donde ibas": historial local de lo ultimo que la persona abrio.
//
// Es un store de modulo (igual que lib/preferencias.ts y lib/sesion.ts): vive SOLO en
// este telefono (localStorage), NUNCA se sube a la cuenta. Se respeta el boton de
// privacidad "Guardar mis preguntas": si esta apagado, tampoco se registra la lectura.
import { useSyncExternalStore } from 'react';
import { obtenerPreferencias } from './preferencias';

export type VisitaTipo = 'articulo' | 'codigo';

export interface Visita {
  tipo: VisitaTipo;
  /** Identidad para dedupe: `${slug}::${numero}` o `${slug}`. */
  clave: string;
  slug: string;
  numero?: string;
  /** Linea fuerte: "Art. 151" o el nombre del codigo. */
  etiqueta: string;
  /** Linea suave: de que libro viene. */
  sub: string;
  vistoEn: number;
}

const CLAVE_LS = 'legal.historial.v1';
const MAX = 8;

function esVisita(v: unknown): v is Visita {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    (o.tipo === 'articulo' || o.tipo === 'codigo') &&
    typeof o.clave === 'string' &&
    typeof o.slug === 'string' &&
    typeof o.etiqueta === 'string' &&
    typeof o.sub === 'string'
  );
}

function leer(): Visita[] {
  try {
    const crudo = localStorage.getItem(CLAVE_LS);
    if (!crudo) return [];
    const arr: unknown = JSON.parse(crudo);
    return Array.isArray(arr) ? arr.filter(esVisita).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

let lista: Visita[] = leer();
const oyentes = new Set<() => void>();

function notificar(): void {
  for (const oir of oyentes) oir();
}

function persistir(): void {
  try {
    localStorage.setItem(CLAVE_LS, JSON.stringify(lista));
  } catch {
    /* almacenamiento lleno o modo privado: el historial sigue valiendo en memoria */
  }
}

/**
 * Registra una apertura. Dedupe por `clave` (lo ultimo abre primero) y corta a MAX.
 * Si la persona apago el historial, se sale sin guardar.
 */
export function registrarVisita(v: Omit<Visita, 'vistoEn'>): void {
  if (!obtenerPreferencias().preferencias.guardarHistorial) return;
  const nueva: Visita = { ...v, vistoEn: Date.now() };
  lista = [nueva, ...lista.filter((x) => x.clave !== nueva.clave)].slice(0, MAX);
  persistir();
  notificar();
}

export function limpiarHistorial(): void {
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

function instantanea(): Visita[] {
  return lista;
}

export function useHistorial(): Visita[] {
  return useSyncExternalStore(suscribir, instantanea, instantanea);
}

/** Ruta interna a la que lleva una visita. */
export function rutaVisita(v: Visita): string {
  return v.tipo === 'articulo'
    ? `/codigo/${v.slug}/articulo/${encodeURIComponent(v.numero ?? '')}`
    : `/codigo/${v.slug}`;
}
