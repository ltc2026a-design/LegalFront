// Funcion clasica de Vercel: con el servicio `api` SIN preset (`framework: null`),
// cualquier archivo dentro de `api/` del root del servicio se construye como Vercel
// Function tal cual, segun su ruta. `api/[...all].js` cubre `/api/*` y recibe la URL
// original, que es como `crearApp()` ya tiene montados sus routers.
//
// Es el camino mas viejo y menos magic de Vercel (ni Express ni Node "framework"): si
// aun asi la invocacion muere, el problema no es de este codigo sino del preset, del
// servicio o del proyecto, y eso solo se ve en el dashboard.
//
// El `import()` es dinamico y envuelto: si el grafo de la app falla (falta una
// variable de entorno, no viaja el binario nativo de argon2, no esta `dist/`), el
// motivo se responde en JSON en vez de quedar bajo la pagina generica de Vercel.
import fs from 'node:fs';

const MARCA = 'api-v11-clasica';
const CLAVES = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ENV_FILE',
  'TRUST_PROXY',
  'PG_POOL_MAX',
  'VERSION_DEPLOY',
];

let app;
let intentos = [];

function ocultar(texto) {
  return String(texto ?? '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`),]+/gi, '[url oculta]')
    .slice(0, 400);
}

function leer(dir) {
  try {
    return fs.readdirSync(dir).slice(0, 25);
  } catch (error) {
    return [`error: ${ocultar(error?.message)}`];
  }
}

async function cargar() {
  if (app) return;
  intentos = [];
  const opciones = [
    ['literal', () => import('../dist/vercel.js')],
    ['import.meta.url', () => import(new URL('../dist/vercel.js', import.meta.url))],
  ];
  for (const [nombre, opcion] of opciones) {
    try {
      const modulo = await opcion();
      if (typeof modulo?.default === 'function') {
        app = modulo.default;
        return;
      }
      intentos.push({ nombre, detalle: 'el modulo no trae una app por defecto' });
    } catch (error) {
      intentos.push({ nombre, tipo: error?.name, detalle: ocultar(error?.message) });
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('x-api-marca', MARCA);
  await cargar();
  if (app) {
    try {
      app(req, res);
    } catch (error) {
      res.status(500).json({
        ok: false,
        marca: MARCA,
        error: 'la app fallo al atender la peticion',
        tipo: error?.name,
        detalle: ocultar(error?.message ?? error),
      });
    }
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify(
      {
        ok: false,
        marca: MARCA,
        error: 'la app no se pudo cargar dentro de la funcion',
        node: process.version,
        esteArchivo: ocultar(import.meta.url),
        aqui: leer(new URL('.', import.meta.url)),
        intentos,
        presentes: Object.fromEntries(
          CLAVES.map((clave) => [clave, Boolean(process.env[clave]?.trim())]),
        ),
      },
      null,
      2,
    ),
  );
}
