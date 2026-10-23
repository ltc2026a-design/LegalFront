// Zona 5 — Favoritos REALES por device_id (antes eran un placeholder en localStorage).
//
// Estado server-backed: la lista vive en la cache de TanStack Query bajo la clave
// ['favoritos', deviceId]. La estrella de la pantalla de articulo se pintaba con
// localStorage; ahora se pinta con `useToggleFavorito`, que hace una actualizacion
// OPTIMISTA: la estrella cambia al instante y, si el servidor falla, se revierte
// (rollback) al valor anterior.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, deleteFavorito, getFavoritos, postFavorito } from './api';
import { useDeviceIdActivo } from './sesion';
import type { FavoritoItem, FavoritosResponse } from './types';

/** Clave de consulta: incluye el deviceId para que dos dispositivos no compartan estado. */
export function claveFavoritos(deviceId: string) {
  return ['favoritos', deviceId] as const;
}

/** Prefijo de los ids optimistas (aun no existen en el servidor). */
const TEMP = 'temp-';

function idTemporal(): string {
  const c = globalThis.crypto;
  return `${TEMP}${c && typeof c.randomUUID === 'function' ? c.randomUUID() : Date.now().toString(36)}`;
}

/** Datos del articulo necesarios para pintar la tarjeta al instante. */
export interface DetalleOptimista {
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  esApartadoClave: boolean;
  vigente: boolean;
  extracto: string;
}

export interface ToggleFavoritoVariables {
  articuloId: string;
  /** Id del favorito existente (=> se BORRA); ausente => se CREA. */
  favoritoId?: string | null;
  /** Solo al crear: se usa para el item optimista. */
  detalle?: DetalleOptimista;
}

interface ContextoRollback {
  previo: FavoritosResponse | undefined;
}

// ---------- Query ----------

/** Lista de favoritos del dispositivo (orden server: creadoEn desc). */
export function useFavoritos(deviceId?: string) {
  const id = deviceId ?? useDeviceIdActivo();
  return useQuery({
    queryKey: claveFavoritos(id),
    queryFn: ({ signal }) => getFavoritos(id, signal),
    enabled: Boolean(id),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });
}

/** El favorito de un articulo concreto (o undefined si no lo es). */
export function buscarFavorito(
  favoritos: FavoritoItem[] | undefined,
  articuloId: string | undefined,
): FavoritoItem | undefined {
  if (!favoritos || !articuloId) return undefined;
  return favoritos.find((f) => f.articuloId === articuloId);
}

// ---------- Mutacion con actualizacion optimista ----------

export function useToggleFavorito(deviceId?: string) {
  const qc = useQueryClient();
  const id = deviceId ?? useDeviceIdActivo();
  const key = claveFavoritos(id);

  return useMutation({
    mutationFn: async (v: ToggleFavoritoVariables) => {
      // Un id optimista aun no existe en el servidor: no se borra alli
      // (onSettled reconcilia el estado con la lista real).
      if (v.favoritoId?.startsWith(TEMP)) {
        return { id: v.favoritoId, articuloId: v.articuloId, eliminado: true as const };
      }
      if (v.favoritoId) {
        const r = await deleteFavorito(v.favoritoId, id);
        return { id: r.id, articuloId: v.articuloId, eliminado: true as const };
      }
      const r = await postFavorito(id, v.articuloId);
      return { id: r.favorito.id, articuloId: r.favorito.articuloId, eliminado: false as const };
    },

    // 1) Pintar el cambio YA.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previo = qc.getQueryData<FavoritosResponse>(key);

      qc.setQueryData<FavoritosResponse>(key, (actual) => {
        const lista = actual?.favoritos ?? [];
        if (v.favoritoId) {
          return { favoritos: lista.filter((f) => f.id !== v.favoritoId) };
        }
        if (lista.some((f) => f.articuloId === v.articuloId)) {
          return { favoritos: lista }; // idempotente: ya estaba
        }
        const nuevo: FavoritoItem = {
          id: idTemporal(),
          articuloId: v.articuloId,
          codigoSlug: v.detalle?.codigoSlug ?? '',
          codigoNombre: v.detalle?.codigoNombre ?? '',
          numero: v.detalle?.numero ?? '',
          esApartadoClave: v.detalle?.esApartadoClave ?? false,
          vigente: v.detalle?.vigente ?? true,
          extracto: v.detalle?.extracto ?? '',
          creadoEn: new Date().toISOString(),
        };
        return { favoritos: [nuevo, ...lista] };
      });

      return { previo } satisfies ContextoRollback;
    },

    // 2) Si la red/servidor falla: rollback exacto.
    onError: (_e, _v, contexto) => {
      if (contexto?.previo) qc.setQueryData(key, contexto.previo);
    },

    // 3) En cualquier caso, reconciliar con el servidor (ids reales, orden real).
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}
