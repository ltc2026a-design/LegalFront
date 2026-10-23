// Zona 11 — RATE LIMITING de la superficie publica y de las escrituras.
//
// Se montan en la factoria de app (src/app.ts):
//   - general    : toda la base /api (por IP).
//   - buscar     : mas estricto en GET /api/buscar (consulta de texto completo,
//                  la mas cara del sistema).
//   - dispositivo: escrituras por device_id (POST /api/favoritos,
//                  /api/app/registro, /api/app/dispositivos), clave IP+deviceId.
//   - login      : el de autenticacion de admin (5 fallos / 15 min); se mantiene
//                  aqui centralizado para poder desactivarlo/relajarlo en tests.
//
// TODOS se pueden desactivar con `NODE_ENV=test` o `RATE_LIMIT_DISABLED=1` para
// que la suite no se autoestrangule, pero por defecto van ON en dev/prod.
import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { errorJson } from '../http/errors.js';

export interface ConfigLimitadores {
  ventanadaMs: number;
  generalMax: number;
  buscarMax: number;
  dispositivoMax: number;
  loginMax: number;
  asistenteMax: number;
  /** true = todos los limitadores se saltean (suite de pruebas). */
  desactivados: boolean;
}

function leerNum(nombre: string, defecto: number): number {
  const v = Number(process.env[nombre]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : defecto;
}

/** Si la escritura la hace un device_id concreto, lo usa como parte de la clave. */
function deviceIdDe(req: Request): string {
  const body = req.body as { deviceId?: unknown } | undefined;
  const q = req.query as { deviceId?: unknown } | undefined;
  const d = typeof body?.deviceId === 'string' ? body.deviceId : typeof q?.deviceId === 'string' ? q.deviceId : '';
  return d.trim().toLowerCase().slice(0, 200);
}

/**
 * Construye un limiter. `max` <= 0 o `desactivados` => limiter pasatodo (skip).
 * Clave = IP normalizada (+ sufijo opcional). Responde el JSON { error } compartido.
 */
function crearLimiter(
  max: number,
  ventanadaMs: number,
  desactivados: boolean,
  codigoError: string,
  sufijo?: (req: Request) => string,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: ventanadaMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Envio de confianza: NO hay proxy delante; se usa el socket IP real.
    validate: { trustProxy: false },
    skip: () => desactivados || max <= 0,
    keyGenerator: (req: Request) => {
      const ip = ipKeyGenerator(req.ip ?? '0.0.0.0');
      return sufijo ? `${ip}|${sufijo(req)}` : ip;
    },
    handler: (_req: Request, res: Response) => {
      res.status(429).json(errorJson(codigoError));
    },
  });
}

export interface Limitadores {
  general: RateLimitRequestHandler;
  buscar: RateLimitRequestHandler;
  dispositivo: RateLimitRequestHandler;
  login: RateLimitRequestHandler;
  asistente: RateLimitRequestHandler;
}

/**
 * Config por defecto tomada del entorno, con los overrides que quiera el
 * llamador (la factoria de app los recibe; los tests pasan umbrales bajos).
 */
export function configPorDefecto(overrides: Partial<ConfigLimitadores> = {}): ConfigLimitadores {
  const porEntorno = (v: number | undefined, env: string, def: number): number =>
    v ?? leerNum(env, def);
  return {
    ventanadaMs: overrides.ventanadaMs ?? 15 * 60 * 1000,
    generalMax: porEntorno(overrides.generalMax, 'RATE_LIMIT_GENERAL_MAX', 300),
    buscarMax: porEntorno(overrides.buscarMax, 'RATE_LIMIT_BUSCAR_MAX', 60),
    dispositivoMax: porEntorno(overrides.dispositivoMax, 'RATE_LIMIT_DISPOSITIVO_MAX', 120),
    loginMax: porEntorno(overrides.loginMax, 'RATE_LIMIT_LOGIN_MAX', 5),
    // El chat del asistente sale del servidor hacia un proveedor de IA con cuota
    // propia: se limita mas fuerte que /buscar para no quemar la llave.
    asistenteMax: porEntorno(overrides.asistenteMax, 'RATE_LIMIT_ASISTENTE_MAX', 20),
    desactivados:
      overrides.desactivados ??
      (process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_DISABLED === '1'),
  };
}

export function crearLimitadores(cfg: ConfigLimitadores): Limitadores {
  return {
    general: crearLimiter(cfg.generalMax, cfg.ventanadaMs, cfg.desactivados, 'limite_excedido'),
    buscar: crearLimiter(cfg.buscarMax, cfg.ventanadaMs, cfg.desactivados, 'limite_excedido'),
    dispositivo: crearLimiter(
      cfg.dispositivoMax,
      cfg.ventanadaMs,
      cfg.desactivados,
      'limite_excedido',
      deviceIdDe,
    ),
    // Chat por dispositivo: la llave del proveedor es unica para todo el sistema.
    asistente: crearLimiter(
      cfg.asistenteMax,
      cfg.ventanadaMs,
      cfg.desactivados,
      'limite_excedido',
      deviceIdDe,
    ),
    // Login: solo cuentan los fallos (skipSuccessfulRequests) para no castigar
    // al usuario legitimo; clave IP+email igual que la Zona 7.
    login: rateLimit({
      windowMs: cfg.ventanadaMs,
      limit: cfg.loginMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      validate: { trustProxy: false },
      skip: () => cfg.desactivados || cfg.loginMax <= 0,
      keyGenerator: (req: Request) => {
        const email =
          typeof (req.body as { email?: unknown })?.email === 'string'
            ? String((req.body as { email: string }).email).trim().toLowerCase()
            : '';
        return `${ipKeyGenerator(req.ip ?? '0.0.0.0')}|${email}`;
      },
      handler: (_req: Request, res: Response) => {
        res.status(429).json(errorJson('demasiados_intentos'));
      },
    }),
  };
}
