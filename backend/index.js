// Entrada del servicio `api` en Vercel (`vercel.json`: root backend, framework
// express, entrypoint index.js).
//
// Por que este archivo se llama `index.js`: el preset de Express de Vercel NO usa
// el `entrypoint` declarado — detecta la aplicacion buscando un archivo que
// importe `express` en `app.*`, `index.*`, `server.*`, `src/app.*`, `src/index.*`,
// `src/server.*` (en ese orden). Mientras la entrada se llamo `vercel.js` el
// preset nunca la miro, tomo `src/app.ts` (que solo exporta `crearApp` por nombre,
// sin default ni `listen`) y de ahi salio SIEMPRE el mismo 500
// `FUNCTION_INVOCATION_FAILED` de Vercel: la funcion existia, pero no tenia app
// que atender. Con `index.js` la deteccion y el `entrypoint` apuntan al mismo
// archivo y ya no hay ambiguedad.
//
// Por que envuelve en una app de Express y no re-exporta la app compilada: un
// re-export estatico (`export { default } from './dist/vercel.js'`) hace que
// cualquier fallo del grafo — una variable de entorno que falta, el binario nativo
// de argon2, `dist/` no incluido en el bundle — reviente al cargar el modulo, antes
// de la primera peticion, y Vercel solo muestra su pagina generica sin stack y sin
// forma de leerla desde fuera (no hay acceso al dashboard ni a los Runtime Logs).
// Exportando una app propia, el fallo se atiende como peticion normal y se responde
// en JSON: nombre de la variable o del modulo, nunca secretos.
//
// El `import()` con literal es el que ve el trazador de dependencias de Vercel, y
// por eso `dist/` viaja dentro de la funcion; se intenta tambien relativo a
// `import.meta.url` por si el preset reescribe la ruta.
import express from 'express';

const MARCA = 'api-v9';
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

async function cargar() {
  if (app) return;
  intentos = [];
  const opciones = [
    ['literal', () => import('./dist/vercel.js')],
    ['import.meta.url', () => import(new URL('./dist/vercel.js', import.meta.url))],
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
      esteArchivo: ocultar(import.meta.url),
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

export default porta;
