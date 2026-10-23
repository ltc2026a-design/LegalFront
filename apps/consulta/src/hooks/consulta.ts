// Zona 4 — Hooks de datos (TanStack Query) sobre la API publica de consulta.
// Reintentos: no se reintentan los 4xx (404 "no_encontrado" es una respuesta valida).
import { useQuery } from '@tanstack/react-query';
import {
  ApiError,
  buscar,
  getApartadosClave,
  getArticulo,
  getCodigo,
  getCodigos,
  saltoArticulo,
} from '../lib/api';
import { pareceNumeroArticulo } from '../lib/referencia';

/** No reintentar errores de cliente (4xx); reintentar el resto (max. 1). */
function retryEnErroresDeCliente(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

// ---------- Biblioteca / codigos ----------

export function useCodigos() {
  return useQuery({
    queryKey: ['codigos'],
    queryFn: ({ signal }) => getCodigos(signal),
    retry: retryEnErroresDeCliente,
  });
}

export function useApartadosClave() {
  return useQuery({
    queryKey: ['apartados-clave'],
    queryFn: ({ signal }) => getApartadosClave(signal),
    retry: retryEnErroresDeCliente,
  });
}

// ---------- Detalle de un codigo (arbol) ----------

export function useCodigo(slug: string) {
  return useQuery({
    queryKey: ['codigo', slug],
    queryFn: ({ signal }) => getCodigo(slug, signal),
    enabled: Boolean(slug),
    retry: retryEnErroresDeCliente,
  });
}

// ---------- Detalle de un articulo ----------

export function useArticulo(slug: string, numero: string) {
  return useQuery({
    queryKey: ['articulo', slug, numero],
    queryFn: ({ signal }) => getArticulo(slug, numero, signal),
    enabled: Boolean(slug && numero),
    retry: retryEnErroresDeCliente,
  });
}

// ---------- Busqueda de texto completo ----------

export function useBusqueda(q: string, codigo?: string, limit = 30) {
  return useQuery({
    queryKey: ['busqueda', q, codigo ?? null, limit],
    queryFn: ({ signal }) => buscar({ q, codigo, limit }, signal),
    enabled: q.trim().length > 0,
    retry: retryEnErroresDeCliente,
  });
}

// ---------- Salto directo por numero de articulo ----------

/** Solo se consulta si la consulta tiene pinta de numero: el resto no paga la llamada. */
export function useSalto(q: string, codigo?: string) {
  return useQuery({
    queryKey: ['salto', q, codigo ?? null],
    queryFn: ({ signal }) => saltoArticulo({ q, codigo }, signal),
    enabled: q.trim().length > 0 && pareceNumeroArticulo(q),
    retry: retryEnErroresDeCliente,
  });
}
