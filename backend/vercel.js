// Entrada que ve Vercel: el servicio `api` de `vercel.json` declara
// "entrypoint": "vercel.js".
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
//
// Por que el archivo se llama `vercel.js` y no `server.js`: el preset de
// Express reserva `app.*`, `index.*` y `server.*` (en la raiz y en `src/`) para
// detectar la aplicacion, y con `server.*` espera el patron de `app.listen`.
// Con `entrypoint: "vercel.js"` la funcion si se ejecuto; renombrarla a
// `server.js` volvio a la pagina generica sin JSON. Y la ruta se resuelve con
// `import.meta.url` porque el preset reescribe la entrada: con el literal
// `'./dist/vercel.js'` busco `/var/task/vercel.js` en vez del `dist/` real.
const MARCA = 'api-vercel-v6';
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
    ({ default: app } = await import(new URL('./dist/vercel.js', import.meta.url)));
  } catch (error) {
    fallo = error;
  }
}

function ocultar(texto) {
  return String(texto ?? '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`),]+/gi, '[url oculta]')
    .slice(0, 400);
}

function responder(res, estado, cuerpo) {
  // 200 a proposito en el fallo de arranque: con 5xx el borde de Vercel pone su
  // pagina `FUNCTION_INVOCATION_FAILED` por encima del cuerpo y la causa deja de
  // leerse desde fuera. Aqui lo que importa es que el JSON se vea.
  res.statusCode = estado;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(cuerpo, null, 2));
}

export default async function handler(req, res) {
  await cargar();
  if (fallo) {
    responder(res, 200, {
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
    responder(res, 500, {
      ok: false,
      marca: MARCA,
      error: 'la app fallo al atender la peticion',
      tipo: error?.name,
      detalle: ocultar(error?.message ?? error),
    });
  }
}
