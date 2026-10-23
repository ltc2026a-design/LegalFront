// Fase 4 — Preferencias de la persona: tema, tamaño de letra, libro anclado, avisos
// con franja de silencio e historial.
//
// Store de modulo (igual que lib/sesion.ts) y NO de TanStack Query: el tema y el
// tamaño de letra tienen que aplicarse al documento de forma sincronica desde
// cualquier pantalla, incluida la portada, antes de que React termine de montar.
//
// DOS destinos para los mismos datos:
//  - localStorage SIEMPRE: sin cuenta las preferencias viven en este telefono, y con
//    cuenta sirven de copia inmediata mientras llega la respuesta del servidor.
//  - PATCH /api/app/preferencias SOLO si hay sesion: se agrupan los cambios en una
//    rafaga (500 ms) para no escribir en la BD en cada toque del stepper de letra.
import { useSyncExternalStore } from 'react';
import { getYoApp, patchPreferenciasApp } from './api';
import { tokenSesion } from './sesion';
import type { PreferenciasApp } from './types';

const STORAGE_KEY = 'legal.preferencias.v1';

/** Base de datos compartida con el Service Worker: es el unico sitio donde el SW puede leerlas. */
const IDB_NOMBRE = 'legal-preferencias';
const IDB_STORE = 'preferencias';
const IDB_CLAVE = 'activos';

export const POR_DEFECTO: PreferenciasApp = {
  tema: 'auto',
  tamanoLetra: 100,
  codigoFavorito: null,
  notificaciones: true,
  silencioDesde: null,
  silencioHasta: null,
  guardarHistorial: true,
};

/** Donde quedaron guardadas las preferencias que se ven en pantalla. */
export type EstadoGuardado = 'local' | 'guardando' | 'cuenta' | 'error';

export interface SnapshotPreferencias {
  preferencias: PreferenciasApp;
  guardado: EstadoGuardado;
}

function esTema(v: unknown): v is PreferenciasApp['tema'] {
  return v === 'claro' || v === 'oscuro' || v === 'auto';
}

/** Hora "HH:MM" valida (la que produce <input type="time">); todo lo demues es null. */
export function horaValida(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : null;
}

function letraValida(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return POR_DEFECTO.tamanoLetra;
  return Math.min(140, Math.max(85, Math.round(v)));
}

function limpiar(cruedo: unknown): PreferenciasApp {
  const g = objetoSeguro(cruedo);
  return {
    tema: esTema(g.tema) ? g.tema : POR_DEFECTO.tema,
    tamanoLetra: letraValida(g.tamanoLetra),
    codigoFavorito: typeof g.codigoFavorito === 'string' && g.codigoFavorito ? g.codigoFavorito : null,
    notificaciones: typeof g.notificaciones === 'boolean' ? g.notificaciones : POR_DEFECTO.notificaciones,
    silencioDesde: horaValida(g.silencioDesde),
    silencioHasta: horaValida(g.silencioHasta),
    guardarHistorial:
      typeof g.guardarHistorial === 'boolean' ? g.guardarHistorial : POR_DEFECTO.guardarHistorial,
  };
}

/** JSON de localStorage puede venir roto o con claves de otra version: se ignora lo que no sirve. */
function objetoSeguro(crudo: unknown): Record<string, unknown> {
  if (!crudo || typeof crudo !== 'object') return {};
  return crudo as Record<string, unknown>;
}

function leerLocal(): PreferenciasApp {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return { ...POR_DEFECTO };
    return limpiar(JSON.parse(crudo));
  } catch {
    return { ...POR_DEFECTO };
  }
}

function escribirLocal(p: PreferenciasApp): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* almacenamiento lleno o en modo privado: las preferencias siguen valiendo en memoria */
  }
}

// ---------------------------------------------------------------------------
// Aplicacion al documento
// ---------------------------------------------------------------------------

const mql =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function temaResuelto(tema: PreferenciasApp['tema']): 'claro' | 'oscuro' {
  if (tema !== 'auto') return tema;
  return mql?.matches ? 'oscuro' : 'claro';
}

/** Pinta el tema y la escala de letra sobre <html>. Idempotente. */
function aplicarEnDocumento(p: PreferenciasApp): void {
  if (typeof document === 'undefined') return;
  const raiz = document.documentElement;
  raiz.dataset.tema = temaResuelto(p.tema);
  raiz.style.setProperty('--factor-letra', String(p.tamanoLetra / 100));
}

// ---------------------------------------------------------------------------
// Espejo para el Service Worker (aviso silencioso fuera del horario)
// ---------------------------------------------------------------------------

/**
 * El SW no tiene localStorage, asi que la franja de silencio se duplica en
 * IndexedDB. Solo se guardan los campos que necesita el listener de `push`.
 */
function espejarEnServiceWorker(p: PreferenciasApp): void {
  if (typeof indexedDB === 'undefined') return;
  try {
    const apertura = indexedDB.open(IDB_NOMBRE, 1);
    apertura.onupgradeneeded = () => {
      const db = apertura.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    apertura.onsuccess = () => {
      const db = apertura.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        return;
      }
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(
        {
          notificaciones: p.notificaciones,
          silencioDesde: p.silencioDesde,
          silencioHasta: p.silencioHasta,
        },
        IDB_CLAVE,
      );
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    };
    apertura.onerror = () => undefined;
    apertura.onblocked = () => undefined;
  } catch {
    /* IndexedDB bloqueado: el aviso se mostrara normal, sin bloquear nada mas */
  }
}

/** True si `fecha` cae dentro de la franja de silencio (soporta franjas que cruzan medianoche). */
export function enSilencio(p: PreferenciasApp, fecha: Date = new Date()): boolean {
  const desde = horaValida(p.silencioDesde);
  const hasta = horaValida(p.silencioHasta);
  if (!desde || !hasta) return false;
  const minutos = fecha.getHours() * 60 + fecha.getMinutes();
  const a = Number(desde.slice(0, 2)) * 60 + Number(desde.slice(3, 5));
  const b = Number(hasta.slice(0, 2)) * 60 + Number(hasta.slice(3, 5));
  return a <= b ? minutos >= a && minutos < b : minutos >= a || minutos < b;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let snapshot: SnapshotPreferencias = {
  preferencias: leerLocal(),
  guardado: tokenSesion() ? 'guardando' : 'local',
};
const oyentes = new Set<() => void>();
let envio: ReturnType<typeof setTimeout> | null = null;
/**
 * Las escrituras van en cola y con numero de serie: dos cambios seguidos (tema y
 * luego historial) pueden responder fuera de orden, y adoptar la respuesta vieja
 * haria que el interruptor "reviva" solo. `serie` es el ultimo envio pedido; solo
 * se acepta la respuesta que sigue siendo la mas reciente.
 */
let serie = 0;
let enCola: Promise<void> = Promise.resolve();

function notificar(): void {
  for (const oir of oyentes) oir();
}

function cambiar(parcial: Partial<SnapshotPreferencias>): void {
  snapshot = { ...snapshot, ...parcial };
  notificar();
}

/**
 * Escribe en el servidor lo que hay en `preferencias`. Se llama agrupado desde
 * `fijar`; si falla, el estado pasa a 'error' pero LOCAL ya esta guardado, asi que
 * la app sigue funcionando igual (es la regla de offline de todo el proyecto).
 */
async function enviarAlServidor(p: PreferenciasApp, mio: number): Promise<void> {
  if (!tokenSesion()) {
    cambiar({ guardado: 'local' });
    return;
  }
  try {
    const r = await patchPreferenciasApp(p);
    // Si ya hay un pedido mas nuevo en curso, su respuesta es la que vale.
    if (mio !== serie) return;
    // El servidor clampa y normaliza: se adopta su respuesta para que la pantalla
    // muestre exactamente lo que quedo guardado.
    const acceptadas = limpiar(r.preferencias);
    escribirLocal(acceptadas);
    aplicarEnDocumento(acceptadas);
    espejarEnServiceWorker(acceptadas);
    cambiar({ preferencias: acceptadas, guardado: tokenSesion() ? 'cuenta' : 'local' });
  } catch {
    if (mio === serie) cambiar({ guardado: 'error' });
  }
}

function programarEnvio(): void {
  // El numero se sube AHORA, al pedir el cambio, no cuando sale el PATCH. Asi la
  // respuesta de un envio que aun esta en vuelo se descarta en cuanto la persona
  // hace un cambio nuevo (si no, el servidor contestaria por lo anterior y el
  // interruptor "reviviria" solo).
  serie++;
  const mio = serie;
  if (envio) clearTimeout(envio);
  envio = setTimeout(() => {
    envio = null;
    // Encadenado: nunca dos PATCH concurrentes sobre la misma fila.
    enCola = enCola.then(() => enviarAlServidor(snapshot.preferencias, mio));
  }, 500);
}

/** Cambia solo lo que se pasa; el resto se conserva. */
export function fijar(parcial: Partial<PreferenciasApp>): void {
  const nuevas = limpiar({ ...snapshot.preferencias, ...parcial });
  if (JSON.stringify(nuevas) === JSON.stringify(snapshot.preferencias)) return;
  escribirLocal(nuevas);
  aplicarEnDocumento(nuevas);
  espejarEnServiceWorker(nuevas);
  if (tokenSesion()) {
    cambiar({ preferencias: nuevas, guardado: 'guardando' });
    programarEnvio();
  } else {
    cambiar({ preferencias: nuevas, guardado: 'local' });
  }
}

/**
 * Al iniciar sesion (o al abrir la app con sesion guardada) se adoptan las
 * preferencias de la cuenta: son el dato de la persona, no el de este telefono.
 * Si la cuenta no tiene ninguna, se suben las locales para que la fila exista.
 */
export async function sincronizarConCuenta(servidor: PreferenciasApp | null): Promise<void> {
  // Sin cuenta (al salir): lo que hay en el telefono pasa a llamarse "local".
  if (!tokenSesion()) {
    cambiar({ guardado: 'local' });
    return;
  }
  // Cambios locales en vuelo: el servidor aun responde por lo anterior, no se pisa.
  if (envio) return;
  if (!servidor) {
    const mio = ++serie;
    await enviarAlServidor(snapshot.preferencias, mio);
    return;
  }
  const aceptadas = limpiar(servidor);
  if (JSON.stringify(aceptadas) === JSON.stringify(snapshot.preferencias)) {
    cambiar({ guardado: tokenSesion() ? 'cuenta' : 'local' });
    return;
  }
  escribirLocal(aceptadas);
  aplicarEnDocumento(aceptadas);
  espejarEnServiceWorker(aceptadas);
  cambiar({ preferencias: aceptadas, guardado: tokenSesion() ? 'cuenta' : 'local' });
}

export function suscribirPreferencias(oir: () => void): () => void {
  oyentes.add(oir);
  return () => {
    oyentes.delete(oir);
  };
}

export function obtenerPreferencias(): SnapshotPreferencias {
  return snapshot;
}

export function usePreferencias(): SnapshotPreferencias {
  return useSyncExternalStore(suscribirPreferencias, obtenerPreferencias, obtenerPreferencias);
}

/**
 * Al arrancar con sesion guardada: el tema de la cuenta tiene que verse YA en la
 * portada, no cuando la persona entre a /perfil. Si la red no responde, manda lo
 * local (es lo que hay y la app funciona igual offline).
 */
export async function sincronizarAlArrancar(): Promise<void> {
  if (!tokenSesion()) return;
  try {
    const r = await getYoApp();
    await sincronizarConCuenta(r.preferencias);
  } catch {
    cambiar({ guardado: 'local' });
  }
}

// Arranque: lo que hay en localStorage manda desde el primer paint, y el cambio del
// sistema a tema oscuro se sigue en vivo mientras la preferencia sea 'auto'.
aplicarEnDocumento(snapshot.preferencias);
espejarEnServiceWorker(snapshot.preferencias);
mql?.addEventListener('change', () => {
  if (snapshot.preferencias.tema === 'auto') aplicarEnDocumento(snapshot.preferencias);
});
