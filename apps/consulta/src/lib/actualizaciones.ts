// Zona 10 / Publicación — Live Updates: los cambios de diseño y de la app llegan
// solos a los teléfonos ya instalados, sin reinstalar el APK ni pasar por la tienda.
//
// Cómo funciona:
//  1. `npm run live:publicar` (en el monorepo) compila la app, mete el `dist` en un zip
//     y deja `check.json` + el zip dentro de `public/live-updates/`.
//  2. Ese carpeta viaja con el front a Vercel, así que el manifiesto se sirve de una
//     URL pública estática (gratis, sin backend de actualizaciones).
//  3. Cada vez que arranca la app nativa se lee el manifiesto. Si la versión es más
//     nueva que la del bundle activo, se descarga el zip y se marca para aplicar en el
//     siguiente arranque en frío. La app en uso no se corta a mitad de lectura.
//  4. Además de aplicarse solas, las versiones se AVISAN: cuando hay una descargada y
//     en espera sale la tarjeta «Actualización disponible» (`AvisoActualizacion`) y al
//     tocarla se reinicia la app ya con el código nuevo. Antes era silencioso y solo se
//     aplicaba en frío, así que en la práctica la gente no veía llegar nada.
//
// En web (navegador, iPhone y PC instalados como PWA) todo lo nativo es un no-op: ahí
// la actualización la detecta el Service Worker (`vigilarVersionWeb`) y se ofrece
// recargar la pestaña.
import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

/** URL del manifiesto. Vacía = live updates apagadas (desarrollo, o sin front publicado). */
const MANIFIESTO = (import.meta.env.VITE_LIVE_UPDATE_URL ?? '').trim();

/** Bundle ya descargado: evita re-bajar el mismo zip en cada arranque. */
const CLAVE_DESCARGADO = 'app.liveUpdate.version';

/** Mínimo entre dos revisiones por cambio de primer plano (la app se abre y cierra mucho). */
const PAUSA_ENTRE_REVISIONES = 5 * 60 * 1000;

function trozos(version: string): number[] {
  return version
    .split('.')
    .map((p) => Number.parseInt(p, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** Comparación numérica punto a punto: `2026.10.22.2` es más nuevo que `2026.10.22.1`. */
function esMasNueva(candidata: string, actual: string): boolean {
  const a = trozos(candidata);
  const b = trozos(actual);
  const largo = Math.max(a.length, b.length);
  for (let i = 0; i < largo; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Estado observable: qué versión espera y de dónde vino (nativo o Service Worker).
// ---------------------------------------------------------------------------

export interface EstadoActualizacion {
  /** Versión lista para aplicar, o `null` si la app está al día. */
  version: string | null;
  /** `nativo` = bundle de Capacitor; `web` = nuevo Service Worker instalado. */
  origen: 'nativo' | 'web' | null;
  /** `true` mientras se reinicia la app al pulsar «Actualizar». */
  aplicando: boolean;
}

const SIN_AVISO: EstadoActualizacion = { version: null, origen: null, aplicando: false };

// useSyncExternalStore compara por identidad: el objeto solo se reemplaza cuando cambia.
let estado: EstadoActualizacion = SIN_AVISO;
const oyentes = new Set<() => void>();

function publicar(cambios: Partial<EstadoActualizacion>): void {
  estado = { ...estado, ...cambios };
  for (const oír of oyentes) oír();
}

function suscribir(oír: () => void): () => void {
  oyentes.add(oír);
  return () => {
    oyentes.delete(oír);
  };
}

/** Para el componente del aviso: versión en espera + si se está aplicando. */
export function useActualizacion(): EstadoActualizacion {
  return useSyncExternalStore(
    suscribir,
    () => estado,
    () => SIN_AVISO,
  );
}

/** Oculta la tarjeta sin borrar la descarga: vuelve a salir en el próximo arranque. */
export function posponerActualizacion(): void {
  if (estado.version) publicar({ version: null, origen: null, aplicando: false });
}

/**
 * Avisa al plugin de que este bundle arrancó bien. Sin este aviso el plugin considera
 * el update "sin confirmar" y, si la app vuelve a fallar al iniciar, revierte sola al
 * bundle anterior. Es la red de seguridad del flujo.
 */
export async function confirmarArranque(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { CapacitorUpdater: updater } = await import('@capgo/capacitor-updater');
    await updater.notifyAppReady();
  } catch {
    // Plugin no disponible en este build: nada que confirmar.
  }
}

/** Busca e instala (para el próximo arranque) la versión publicada del bundle. */
export async function revisarActualizaciones(): Promise<{ instalada?: string; omiso?: string }> {
  if (!Capacitor.isNativePlatform() || !MANIFIESTO) return { omiso: 'sin-config' };
  if (estado.aplicando) return { omiso: 'aplicando' };

  let manifiesto: { version?: string; url?: string };
  try {
    const res = await fetch(MANIFIESTO, { cache: 'no-store' });
    if (!res.ok) return { omiso: `http-${res.status}` };
    manifiesto = (await res.json()) as { version?: string; url?: string };
  } catch {
    // Sin red: la app sigue funcionando con el bundle que ya trae el teléfono.
    return { omiso: 'sin-red' };
  }

  const { version, url } = manifiesto;
  if (!version || !url) return { omiso: 'manifiesto-invalido' };

  try {
    const { CapacitorUpdater: updater } = await import('@capgo/capacitor-updater');
    const activo = await updater.current();
    const vigente = activo?.bundle?.version ?? '0';
    if (!esMasNueva(version, vigente)) return { omiso: 'al-dia' };

    // Ya bajada en un arranque anterior pero sin aplicar (Android no siempre mata el
    // proceso al salir, así que el "próximo arranque en frío" puede tardar días):
    // se ofrece de inmediato en vez de volver a descargar el mismo zip.
    if (localStorage.getItem(CLAVE_DESCARGADO) === version) {
      publicar({ version, origen: 'nativo', aplicando: false });
      return { omiso: 'ya-descargada' };
    }

    // La URL del zip viene relativa al manifiesto, para que el mismo artefacto
    // funcione en la producción y en cualquier preview de Vercel.
    const bundle = await updater.download({ version, url: new URL(url, MANIFIESTO).href });
    await updater.next(bundle);
    localStorage.setItem(CLAVE_DESCARGADO, version);
    publicar({ version, origen: 'nativo', aplicando: false });
    return { instalada: version };
  } catch {
    return { omiso: 'descarga-fallida' };
  }
}

let ultimaRevision = 0;

/**
 * Arranca la vigilancia en el teléfono: confirma el bundle actual, revisa a los pocos
 * segundos (para no pelearse con el primer paint) y vuelve a revisar cada vez que la
 * app regresa a primer plano, con una pausa mínima para no martillar el manifiesto.
 */
export function vigilarVersionNativa(): void {
  if (!Capacitor.isNativePlatform() || !MANIFIESTO) return;
  void confirmarArranque();

  const revisar = (): void => {
    if (Date.now() - ultimaRevision < PAUSA_ENTRE_REVISIONES) return;
    ultimaRevision = Date.now();
    void revisarActualizaciones();
  };

  window.setTimeout(revisar, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revisar();
  });
}

/**
 * Aplica la versión en espera. En el teléfono reinicia la app con el bundle nuevo;
 * en el navegador recarga la pestaña, que ya está controlada por el SW nuevo.
 * El `await` de `reload()` puede no resolver nunca (destruye el contexto JS), así que
 * el botón se queda en «aplicando» a propósito.
 */
export async function aplicarActualizacion(): Promise<void> {
  const { version, origen, aplicando } = estado;
  if (!version || aplicando) return;
  publicar({ aplicando: true });

  try {
    if (origen === 'nativo') {
      const { CapacitorUpdater: updater } = await import('@capgo/capacitor-updater');
      await updater.reload();
      return;
    }
    const registro = await navigator.serviceWorker?.getRegistration();
    // `sw.js` llama a `skipWaiting()` al instalarse, pero por si el SW cambia de forma
    // se le pide explícitamente antes de recargar.
    registro?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  } catch {
    publicar({ aplicando: false });
  }
}

/**
 * Versión web/PWA: avisa cuando el Service Worker instaló código nuevo. Solo cuenta
 * como actualización si ya había un SW controlando la página — en la primera visita
 * también se dispara `updatefound` y ahí no hay nada que anunciar.
 */
export function vigilarVersionWeb(registro: ServiceWorkerRegistration): void {
  if (Capacitor.isNativePlatform()) return;

  const anunciar = (): void => {
    if (!estado.version) publicar({ version: 'web', origen: 'web', aplicando: false });
  };

  registro.addEventListener('updatefound', () => {
    const instalando = registro.installing;
    if (!instalando || !navigator.serviceWorker.controller) return;
    instalando.addEventListener('statechange', () => {
      if (instalando.state === 'installed') anunciar();
    });
  });

  // El SW nuevo puede estar ya instalado cuando se registra (pestaña abierta desde
  // antes del despliegue que vuelve a primer plano).
  if (registro.waiting && navigator.serviceWorker.controller) anunciar();
}
