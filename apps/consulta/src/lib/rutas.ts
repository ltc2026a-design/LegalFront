// Zona 12 — Ruta interna de un articulo del acervo. La usan el chat del asistente y
// cualquier lista de fuentes: el enlace tiene que armarse igual para que el Service
// Worker y el resaltado del articulo coincidan.
import type { FuenteAsistente } from './types';

export function rutaArticulo(
  f: Pick<FuenteAsistente, 'codigoSlug' | 'numero'>,
): string {
  return `/codigo/${f.codigoSlug}/articulo/${encodeURIComponent(f.numero)}`;
}
