// Zona 3: forma de error JSON compartida por toda la API publica de consulta.
// Todos los errores devuelven { error: "<codigo>" }.
import type { NextFunction, Request, Response } from 'express';

export interface ErrorJson {
  error: string;
}

/** Construye el cuerpo de error { error: codigo }. */
export function errorJson(codigo: string): ErrorJson {
  return { error: codigo };
}

/** 404 para rutas /api desconocidas (se monta despues de todos los routers). */
export function apiNotFound(_req: Request, res: Response): void {
  res.status(404).json(errorJson('ruta_no_encontrada'));
}

/**
 * Middleware de errores. Express 5 enruta aqui tambien los rechazos de
 * promesas de los handlers async. Nunca filtra detalles internos al cliente.
 */
export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  console.error('[api] error no controlado:', err);
  res.status(500).json(errorJson('error_interno'));
}
