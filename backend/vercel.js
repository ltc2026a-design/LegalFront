// Entrada que ve Vercel: el servicio `api` de `vercel.json` declara
// "framework": "node" + "entrypoint": "vercel.js".
//
// Por que `node` y no `express`: con el preset de Express el default export tiene
// que ser la app real, y el wrapper del preset se ejecuta al cargar la funcion,
// antes que cualquier try/catch propio. Eso produce exactamente lo unico que este
// despliegue devolvio siete veces: 500 `FUNCTION_INVOCATION_FAILED` con la pagina
// generica de Vercel por encima, sin JSON y sin stack. Con el runtime Node plano
// el handler ES el default export, y aqui si se puede capturar todo.
//
// Por que el `import()` es perezoso: si el grafo de modulos falla — que falte una
// variable de entorno, que no viaje el binario nativo de argon2, que `dist/` no
// este en el bundle — el motivo se responde en JSON en vez de quedar oculto bajo
// la pagina de Vercel. Se prueban dos especificadores porque el bundle del runtime
// reescribe las rutas: el literal (que el trazador de dependencias si ve y por eso
// copia `dist/` a la funcion) y el relativo a `import.meta.url` (que resuelve el
// `dist/` real cuando el literal apunta al directorio equivocado).
//
// Por que el archivo se llama `vercel.js` y no `server.js`: el preset de Express
// reserva `app.*`, `index.*` y `server.*` para detectar la aplicacion.
const MARCA = 'api-vercel-v7';
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

async function cargar() {
  if (app) return;
  intentos = [];
  const opciones = [
    () => import('./dist/vercel.js'),
    () => import(new URL('./dist/vercel.js', import.meta.url)),
  ];
  for (const opcion of opciones) {
    try {
      ({ default: app } = await opcion());
      return;
    } catch (error) {
      intentos.push({ tipo: error?.name, detalle: ocultar(error?.message) });
    }
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
  if (!app) {
    responder(res, 200, {
      ok: false,
      marca: MARCA,
      error: 'la app no se pudo cargar dentro de la funcion',
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
    responder(res, 500, {
      ok: false,
      marca: MARCA,
      error: 'la app fallo al atender la peticion',
      tipo: error?.name,
      detalle: ocultar(error?.message ?? error),
    });
  }
}
