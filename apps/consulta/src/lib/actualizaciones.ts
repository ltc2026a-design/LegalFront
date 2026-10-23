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
//
// En web (navegador) todo esto es un no-op: ahí la actualización ya es automática
// porque el HTML siempre se pide al servidor.
import { Capacitor } from '@capacitor/core';

/** URL del manifiesto. Vacía = live updates apagadas (desarrollo, o sin front publicado). */
const MANIFIESTO = (import.meta.env.VITE_LIVE_UPDATE_URL ?? '').trim();

/** Bundle ya descargado: evita re-bajar el mismo zip en cada arranque. */
const CLAVE_DESCARGADO = 'app.liveUpdate.version';

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
    if (localStorage.getItem(CLAVE_DESCARGADO) === version) return { omiso: 'ya-descargada' };

    // La URL del zip viene relativa al manifiesto, para que el mismo artefacto
    // funcione en la producción y en cualquier preview de Vercel.
    const bundle = await updater.download({ version, url: new URL(url, MANIFIESTO).href });
    await updater.next(bundle);
    localStorage.setItem(CLAVE_DESCARGADO, version);
    return { instalada: version };
  } catch {
    return { omiso: 'descarga-fallida' };
  }
}
