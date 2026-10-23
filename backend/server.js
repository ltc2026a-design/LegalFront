// Entrada que ve Vercel: el servicio `api` de `vercel.json` declara
// "entrypoint": "server.js".
//
// Por que no es `dist/vercel.js` directamente: Vercel valida el entrypoint
// contra el CODIGO FUENTE, antes de correr la buildCommand, y `dist/` todavia
// no existe ahi (revienta con ENTRYPOINT_NOT_FOUND).
//
// Por que el `import()` es perezoso, dentro del handler: con un re-export
// estatico (`export { default } from './dist/vercel.js'`) cualquier fallo del
// grafo de modulos — que falte una variable de entorno, que no viaje el
// binario nativo de argon2 — ocurre antes de la primera peticion y Vercel solo
// muestra su pagina genérica `FUNCTION_INVOCATION_FAILED`, sin stack y sin
// forma de leerlo desde fuera. Cargando la app al atender la peticion, el
// motivo se responde en JSON (nombre de la variable, nunca su valor) y el
// despliegue se puede diagnosticar con un simple `curl`.
const MARCA = 'api-vercel-v5';
const CLAVES = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ENV_FILE',
  'TRUST_PROXY',
  'PG_POOL_MAX',
  'VERSION_DEPLOY',
];

let app;
let fallo;

async function cargar() {
  if (app || fallo) return;
  try {
    ({ default: app } = await import('./dist/vercel.js'));
  } catch (error) {
    fallo = error;
  }
}

function ocultar(texto) {
  return String(texto ?? '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`),]+/gi, '[url oculta]')
    .slice(0, 400);
}

function responder(res, cuerpo) {
  res.statusCode = 500;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(cuerpo, null, 2));
}

export default async function handler(req, res) {
  await cargar();
  if (fallo) {
    responder(res, {
      ok: false,
      marca: MARCA,
      error: 'la app no se pudo cargar dentro de la funcion',
      tipo: fallo?.name,
      detalle: ocultar(fallo?.message),
      presentes: Object.fromEntries(
        CLAVES.map((clave) => [clave, Boolean(process.env[clave]?.trim())]),
      ),
    });
    return;
  }
  try {
    app(req, res);
  } catch (error) {
    responder(res, {
      ok: false,
      marca: MARCA,
      error: 'la app fallo al atender la peticion',
      tipo: error?.name,
      detalle: ocultar(error?.message ?? error),
    });
  }
}
