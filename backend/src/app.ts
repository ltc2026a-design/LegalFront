// Zona 11 — FACTORIA de la app Express, separada del arranque del servidor.
//
// `crearApp()` construye y devuelve el `app` (middlewares, CORS, rate limiting y
// routers) SIN llamar a `listen()`. Esto permite:
//   - `server.ts`: crear la app y levantarla (proceso API, sin cron; Zona 11
//     movio el programador de sincronizacion a un worker aparte),
//   - la suite de pruebas: crear una app con limites bajos/desactivados y
//     ejercitarla con supertest, sin abrir puertos.
import 'dotenv/config';
import cors from 'cors';
import express, { type Express } from 'express';
import { apiErrorHandler, apiNotFound } from './http/errors.js';
import { consultaRouter } from './routes/consulta.js';
import { asistenteRouter } from './routes/asistente.js';
import { favoritosRouter } from './routes/favoritos.js';
import { pushRouter } from './routes/push.js';
import { adminAuthRouter } from './routes/admin-auth.js';
import { adminCambiosRouter } from './routes/admin-cambios.js';
import { adminNotificacionesRouter } from './routes/admin-notificaciones.js';
import { adminCodigosRouter } from './routes/admin-codigos.js';
import { adminEstructuraRouter } from './routes/admin-estructura.js';
import { adminFuentesRouter } from './routes/admin-fuentes.js';
import { appUsuarioRouter } from './routes/usuarios-app.js';
import { montarFrentes } from './servir-frentes.js';
import { prisma } from './lib/prisma.js';
import {
  configPorDefecto,
  crearLimitadores,
  type ConfigLimitadores,
} from './middleware/limiters.js';

// Origenes de siempre para el desarrollo local, mas los de las apps nativas:
// el WebView de Capacitor vive en `https://localhost` (androidScheme https) y
// Tauri en `tauri://localhost`, y ambos llaman al API publicado por internet,
// o sea que su Origin SI llega y hay que aceptarlo. No es un agujero: ahi no
// hay cookies (la identidad es el JWT en localStorage, que el navegador jamas
// adjunta solo), el API escrito exige token y los limitadores van por IP.
const ORIGENES_DEV = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost.localhost',
  'tauri://localhost',
  // Tauri v2 en Windows sirve el bundle en `http://tauri.localhost`; en macOS/Linux es
  // `tauri://localhost`. Sin esta entrada la app de escritorio no puede llamar al API.
  'http://tauri.localhost',
  'https://tauri.localhost',
];

// Quita de un mensaje de error cualquier cadena `proto://usuario:contrasena@host`
// antes de sacarlo por una ruta publica: `/api/health` informa del estado de la
// base sin entregar nunca la credencial.
function ocultarCredenciales(texto: string): string {
  return texto
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`),]+/gi, '[cadena de conexion oculta]')
    .replace(/:[^\s/@'"`]+@/g, ':****@');
}

function allowedOrigins(): Set<string> {
  const extra = (process.env.ORIGINES_PERMITIDAS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set([...ORIGENES_DEV, ...extra]);
}

/**
 * Las entradas con `*` valen como patron: con el frente publicado en Vercel el
 * host exacto cambia entre previews (`https://legalfont-git-main-usuario.vercel.app`),
 * asi que se autoriza `ORIGINES_PERMITIDAS=https://*.vercel.app` en vez de estar
 * pegando URLs nuevo en cada despliegue. Sin comodines, la comparacion es exacta.
 */
function origenPermitido(entradas: Set<string>, origin: string): boolean {
  if (entradas.has(origin)) return true;
  for (const entrada of entradas) {
    if (!entrada.includes('*')) continue;
    const patron = entrada
      .split('*')
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    if (new RegExp(`^${patron}$`).test(origin)) return true;
  }
  return false;
}

/** `TRUST_PROXY=1|true|on` (cualquier otro valor o vacio = false). */
function BooleanoEnv(nombre: string): boolean {
  const v = (process.env[nombre] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'si' || v === 'sí';
}

export interface OpcionesApp {
  /** Overrides de los limites (los tests pasan umbrales bajos para forzar 429). */
  limites?: Partial<ConfigLimitadores>;
  /** true detras de un proxy reverso (confia en X-Forwarded-For). */
  trustProxy?: boolean;
}

export function crearApp(opciones: OpcionesApp = {}): Express {
  const app = express();
  // Detras de nginx (o de cualquier PaaS) la IP real viene en X-Forwarded-For;
  // sin esto TODOS los usuarios parecerian salir del propio servidor y el rate
  // limiting por IP bloquearia en bloque a la app entera.
  app.set('trust proxy', opciones.trustProxy ?? BooleanoEnv('TRUST_PROXY'));

  app.use(express.json());

  // CORS de la app de consulta en desarrollo. El API es anonima (identidad =
  // device_id local), asi que credentials = false (no se envian cookies).
  // GET/POST/PATCH/DELETE: lectura (Zona 3), favoritos por dispositivo (Zona 5) y
  // gestion manual del panel de administracion (Zonas 7/8). X-Served-By lo pone
  // el Service Worker de la app al servir desde cache; se expone para que el
  // frontend pueda leerlo (prueba de la senal offline en Zona 11).
  const ALLOWED_ORIGINS = allowedOrigins();
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || origenPermitido(ALLOWED_ORIGINS, origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      exposedHeaders: ['X-Served-By'],
    }),
  );

  const L = crearLimitadores(configPorDefecto(opciones.limites));

  // Health (preexistente desde la Zona 0). `version` es lo que confirma desde
  // fuera que el servidor ya corro el despliegue nuevo.
  //
  // `base` dice si la funcion alcanza el Postgres, y siempre se responde con 200:
  // dentro de una funcion de Vercel un 5xx puede quedar tapado por la pagina
  // generica del borde, y esto es lo unico que se puede leer desde un `curl`
  // cuando algo falla. Nunca se manda la cadena de conexion: solo si las
  // variables existen y la primera linea del error sin credenciales.
  app.get('/api/health', async (_req, res) => {
    const faltantes = ['DATABASE_URL', 'JWT_SECRET'].filter((k) => !(process.env[k] ?? '').trim());
    const estado: { ok: boolean; error?: string } = { ok: false };
    if (faltantes.length === 0) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        estado.ok = true;
      } catch (error) {
        estado.error = ocultarCredenciales(String((error as Error)?.message ?? error)).split(
          '\n',
        )[0];
      }
    } else {
      estado.error = `faltan ${faltantes.join(', ')}`;
    }
    res
      .status(200)
      .json({ ok: true, version: process.env.VERSION_DEPLOY ?? 'desarrollo', base: estado });
  });

  // LIMITADOR GENERAL: toda la superficie /api (por IP).
  app.use('/api', L.general);

  // LIMITADOR ESTRICTO en la consulta de texto completo (la mas cara).
  app.get('/api/buscar', L.buscar);

  // LIMITADOR DE ESCRITURAS POR DISPOSITIVO (IP + device_id).
  app.post('/api/favoritos', L.dispositivo);
  app.post('/api/app/registro', L.dispositivo);
  app.post('/api/app/dispositivos', L.dispositivo);

  // LIMITADOR DE LOGIN (5 fallos / 15 min). Vale para el admin y para la sesion de
  // persona: el limiter esta claveado por IP+correo, así que un atacante que pruebe
  // cuentas de la app no agota a la vez el login del panel.
  app.post('/api/admin/auth/login', L.login);
  app.post('/api/app/login', L.login);

  // LIMITADOR DEL ASISTENTE (Zona 12): cada pregunta se paga con la cuota del
  // proveedor de IA, así que va por IP + device_id y es la cuota mas ajustada.
  app.post('/api/asistente/chat', L.asistente);

  // API publica de consulta (Zona 3): /codigos, /buscar, /apartados-clave, etc.
  app.use('/api', consultaRouter);
  // Favoritos por device_id + etiqueta opcional (Zona 5).
  app.use('/api', favoritosRouter);
  // Zona 9 — push publico: clave VAPID + alta/baja de dispositivos.
  app.use('/api', pushRouter);
  // Zona 12 — asistente de consultas (estado + chat en streaming).
  app.use('/api', asistenteRouter);
  // Fase 2 — sesion de persona (login + perfil). Sin autorregistro: las credenciales
  // las crea el dueno por CLI.
  app.use('/api', appUsuarioRouter);

  // Zona 7 — panel de administracion (autenticado). El login va desprotegido de
  // auth (solo con el limiter); el resto de /api/admin/* exige Bearer JWT.
  app.use('/api/admin', adminAuthRouter);
  app.use('/api/admin', adminCambiosRouter);
  // Zona 9 — difusion general + listado reciente (requireAdmin).
  app.use('/api/admin', adminNotificacionesRouter);
  // Zona 8 — gestion manual de contenido y fuentes (todo requireAdmin).
  app.use('/api/admin', adminCodigosRouter);
  app.use('/api/admin', adminEstructuraRouter);
  app.use('/api/admin', adminFuentesRouter);

  // 404 JSON para cualquier otra ruta /api desconocida.
  app.use('/api', apiNotFound);

  // Publicacion — si el entorno apunta a los `dist` compilados, ESTE mismo
  // proceso sirve la web de consulta en `/` y el panel en `/admin`. Con eso el
  // deploy es un solo servicio detras de un unico HTTPS: sin CORS, sin segundo
  // servidor, y el APK y la web apuntan al mismo host.
  montarFrentes(app);

  // Handler de errores central: nunca expone detalles internos (500 generico).
  app.use(apiErrorHandler);

  return app;
}
