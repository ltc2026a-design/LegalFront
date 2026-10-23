// Entrada del servicio `api` en Vercel (`vercel.json`: root backend, framework
// express, entrypoint index.cjs).
//
// Por que `.cjs` y no `.js`: `backend/package.json` tiene `"type": "module"`, asi
// que un `.js` es ESM. El runtime Node de Vercel carga la funcion con `require()`
// del archivo trazado, y requerir un modulo ESM revienta con `ERR_REQUIRE_ESM` ANTES
// de la primera peticion: la funcion existe, el build pasa, y cada request devuelve
// la misma pagina generica 500 `FUNCTION_INVOCATION_FAILED` sin JSON posible. Eso es
// exactamente lo que este despliegue llevo once intentos repitiendo, sin importar que
// el archivo exportara (handler plano, app de Express, re-export de `dist/`), porque
// los once eran ESM. Con `.cjs` el modulo es CommonJS aunque el paquete sea ESM, y el
// `import()` dinamico sigue disponible dentro de CJS.
//
// Por que envuelve en una app propia en vez de re-exportar la app compilada: un
// re-export estatico hace que cualquier fallo del grafo — una variable de entorno que
// falta, el binario nativo de argon2, `dist/` no incluido en el bundle — reviente al
// cargar el modulo, otra vez sin forma de leer el motivo desde fuera (no hay acceso
// al dashboard ni a los Runtime Logs). Exportando una app propia, el fallo se atiende
// como peticion normal y se responde en JSON: nombre de la variable o del modulo,
// nunca secretos.
//
// El `import()` con literal es el que ve el trazador de dependencias de Vercel, y por
// eso `dist/` viaja dentro de la funcion.
const fs = require('node:fs');
const express = require('express');

const MARCA = 'api-v10-cjs';
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
