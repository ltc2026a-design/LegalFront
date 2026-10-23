// Zona 5 — Senal global de "contenido servido sin conexion" (cache del Service Worker).
import { useSyncExternalStore } from 'react';
import { estaServidoDeCache, suscribirCache } from '../lib/api';

/**
 * True cuando la ultima respuesta del API vino de la cache del Service Worker
 * (cabecera X-Served-By: cache) o el navegador esta sin red.
 * useSyncExternalStore porque el estado vive en el modulo de API, no en React.
 */
export function useSinConexion(): boolean {
  return useSyncExternalStore(suscribirCache, estaServidoDeCache, () => false);
}
