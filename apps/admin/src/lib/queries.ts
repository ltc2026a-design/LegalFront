// Zona 7 — hooks de datos (TanStack Query) para el panel.
// Zona 8 — anade codigos/estructura/fuentes con sus invalidaciones.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aprobarCambio,
  deleteJson,
  getCambiosPendientes,
  getCodigos,
  getDetalleCambio,
  getEstructura,
  getFuentes,
  getNotificaciones,
  getResumen,
  patchJson,
  postBatch,
  postJson,
  postNotificacionGeneral,
  rechazarCambio,
  syncFuente,
} from './api';

export const claves = {
  resumen: ['admin', 'resumen'] as const,
  pendientes: (tipo?: string, codigo?: string) =>
    ['admin', 'cambios-pendientes', tipo ?? null, codigo ?? null] as const,
  detalle: (id: string) => ['admin', 'cambio', id] as const,
  codigos: ['admin', 'codigos'] as const,
  estructura: (slug: string) => ['admin', 'estructura', slug] as const,
  fuentes: ['admin', 'fuentes'] as const,
  notificaciones: ['admin', 'notificaciones'] as const,
};

export function useResumen() {
  return useQuery({ queryKey: claves.resumen, queryFn: () => getResumen() });
}

export function usePendientes(filtros?: { tipo?: string; codigo?: string }) {
  return useQuery({
    queryKey: claves.pendientes(filtros?.tipo, filtros?.codigo),
    queryFn: () => getCambiosPendientes(filtros),
  });
}

export function useDetalle(id: string) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () => getDetalleCambio(id),
    enabled: Boolean(id),
  });
}

/** Aprobar o rechazar: invalida bandeja + resumen al tener exito. */
export function useResolver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accion }: { id: string; accion: 'aprobar' | 'rechazar' }) =>
      accion === 'aprobar' ? aprobarCambio(id) : rechazarCambio(id),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'cambios-pendientes'] });
      qc.invalidateQueries({ queryKey: claves.resumen });
      qc.removeQueries({ queryKey: claves.detalle(id) });
    },
  });
}

// ---------- Zona 8 — contenido ----------

export function useCodigos() {
  return useQuery({ queryKey: claves.codigos, queryFn: getCodigos });
}

export function useEstructura(slug: string) {
  return useQuery({
    queryKey: claves.estructura(slug),
    queryFn: () => getEstructura(slug),
    enabled: Boolean(slug),
  });
}

export function useFuentes() {
  return useQuery({ queryKey: claves.fuentes, queryFn: getFuentes });
}

/** Mutation generica de contenido: invalida listado + estructura + fuentes + resumen. */
function useContenido<TVars, TRes>(fn: (vars: TVars) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.codigos });
      qc.invalidateQueries({ queryKey: ['admin', 'estructura'] });
      qc.invalidateQueries({ queryKey: claves.fuentes });
      qc.invalidateQueries({ queryKey: claves.resumen });
      qc.invalidateQueries({ queryKey: ['admin', 'cambios-pendientes'] });
    },
  });
}

export function useCrearCodigo() {
  return useContenido((body: unknown) => postJson('/admin/codigos', body));
}
export function useEditarCodigo() {
  return useContenido(({ id, body }: { id: string; body: unknown }) =>
    patchJson(`/admin/codigos/${id}`, body),
  );
}
export function useBorrarCodigo() {
  return useContenido((id: string) => deleteJson(`/admin/codigos/${id}`));
}

export function useCrearSeccion() {
  return useContenido(({ codigoId, body }: { codigoId: string; body: unknown }) =>
    postJson(`/admin/codigos/${codigoId}/secciones`, body),
  );
}
export function useEditarSeccion() {
  return useContenido(({ id, body }: { id: string; body: unknown }) =>
    patchJson(`/admin/secciones/${id}`, body),
  );
}
export function useBorrarSeccion() {
  return useContenido((id: string) => deleteJson(`/admin/secciones/${id}`));
}
export function useOrdenSecciones() {
  return useContenido(
    ({ codigoId, items }: { codigoId: string; items: { id: string; orden: number }[] }) =>
      postJson(`/admin/codigos/${codigoId}/secciones/orden`, { items }),
  );
}

export function useCrearArticulo() {
  return useContenido(({ codigoId, body }: { codigoId: string; body: unknown }) =>
    postJson(`/admin/codigos/${codigoId}/articulos`, body),
  );
}
export function useEditarArticulo() {
  return useContenido(({ id, body }: { id: string; body: unknown }) =>
    patchJson(`/admin/articulos/${id}`, body),
  );
}
export function useBorrarArticulo() {
  return useContenido((id: string) => deleteJson(`/admin/articulos/${id}`));
}
export function useBatch(codigoId: string) {
  return useContenido((body: unknown) => postBatch(codigoId, body));
}

export function useCrearFuente() {
  return useContenido((body: unknown) => postJson('/admin/fuentes', body));
}
export function useEditarFuente() {
  return useContenido(({ id, body }: { id: string; body: unknown }) =>
    patchJson(`/admin/fuentes/${id}`, body),
  );
}
export function usePausaFuente() {
  return useContenido(({ id, activa }: { id: string; activa: boolean }) =>
    postJson(`/admin/fuentes/${id}/pausa`, { activa }),
  );
}
export function useSyncFuente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => syncFuente(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.fuentes });
      qc.invalidateQueries({ queryKey: ['admin', 'cambios-pendientes'] });
      qc.invalidateQueries({ queryKey: claves.resumen });
    },
  });
}

// ---------- Zona 9 — notificaciones ----------

/** Listado reciente de avisos enviados. */
export function useNotificaciones() {
  return useQuery({ queryKey: claves.notificaciones, queryFn: () => getNotificaciones() });
}

/** Difundir un aviso general: al tener exito refresca el listado. */
export function useDifundir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ titulo, mensaje }: { titulo: string; mensaje: string }) =>
      postNotificacionGeneral(titulo, mensaje),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.notificaciones });
    },
  });
}
