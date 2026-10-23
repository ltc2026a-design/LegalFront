// Entrada del servicio `api` en Vercel. En `vercel.json` el servicio se declara con
// `root: "."` (la raiz del repo) y `entrypoint: "backend/index.cjs"`.
//
// Ese `root` es LA razon de que este archivo exista. Con `root: "backend"` Vercel busca la
// funcion con la ruta sin recortar el prefijo del servicio (`backend/index.cjs` dentro de
// un `/var/task` que ya ES `backend/`), asi que la invocacion moria en ~0.5 s con la
// pagina generica 500 `FUNCTION_INVOCATION_FAILED` pase lo que hubiera dentro del archivo:
// sin JSON, sin stack y sin forma de leerlo desde fuera. Cuesta 14 despliegues y once
// formas de entrada dar con ello (handler plano, re-export estatico, app de Express, ESM,
// CJS, `framework: node`, sin `entrypoint`, funcion clasica en `api/`, `main` reorientado).
//
// Por que `.cjs`: `backend/package.json` tiene `"type": "module"`, o sea un `.js` es ESM,
// y el runtime de la funcion lo cargaria con `require()`. Con `.cjs` es CommonJS sin tocar
// el resto del paquete, y el `import()` dinamico sigue funcionando dentro de CJS.
//
// Por que envuelve en una app propia en vez de re-exportar la app compilada: un re-export
// estatico hace que cualquier fallo del grafo — una variable de entorno que falta, el
// binario nativo de argon2, `dist/` no incluido en el bundle — reviente al cargar el
// modulo, otra vez sin forma de leer el motivo. Exportando una app propia, el fallo se
// atiende como peticion normal y se responde en JSON: nombre de la variable o del modulo,
// nunca secretos.
//
// El `import()` con literal es el que ve el trazador de dependencias de Vercel, y por eso
// `dist/` viaja dentro de la funcion.
//
// Y `main` de `backend/package.json` apunta aqui: antes apuntaba a `dist/server.js`, que
// hace `listen` y no exporta handler, y cualquier resolucion del paquete por su `main`
// acababa en un servidor que no atiende peticiones.
const fs = require('node:fs');
const express = require('express');

const MARCA = 'api-v12-raiz';
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
  try {
    const modulo = await import('./dist/vercel.js');
    if (typeof modulo?.default === 'function') {
      app = modulo.default;
      return;
    }
    intentos.push({ nombre: 'literal', detalle: 'el modulo no trae una app por defecto' });
  } catch (error) {
    intentos.push({ nombre: 'literal', tipo: error?.name, detalle: ocultar(error?.message) });
  }
}

const porta = express();

porta.use(async (req, res) => {
  res.setHeader('x-api-marca', MARCA);
  await cargar();
  if (!app) {
    res.status(200).json({
      ok: false,
      marca: MARCA,
      error: 'la app no se pudo cargar dentro de la funcion',
      node: process.version,
      esteArchivo: __filename,
      aqui: leer(__dirname),
      intentos,
      presentes: Object.fromEntries(
        CLAVES.map((clave) => [clave, Boolean(process.env[clave]?.trim())]),
      ),
    });
    return;
  }
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
});

module.exports = porta;
