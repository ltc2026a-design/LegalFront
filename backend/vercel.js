// Entrada que ve Vercel: el servicio `api` de vercel.json declara
// "entrypoint": "vercel.js".
//
// Por que este archivo y no `dist/vercel.js` directamente: Vercel valida el
// entrypoint CONTRA EL CODIGO FUENTE, antes de ejecutar la buildCommand, y
// `dist/` no existe hasta que corre `npm run build` en el despliegue
// (ENTRYPOINT_NOT_FOUND). Este archivo si viaja en el repo y levanta la app
// compilada, que es la que realmente atiende las peticiones.
//
// Dos golpes que dejaron forma a este archivo:
//
// 1. El `import()` de `dist/vercel.js` es LAZY, dentro del handler. Un `await`
//    en nivel global no cabe en el formato con el que el receiver de Vercel
//    transpila la entrada y revienta antes de correr nada.
// 2. Cada fallo se responde en JSON, con MARCA para saber que este codigo ya
//    esta publicado. Dentro de una funcion de Vercel no hay forma de ver el
//    stack desde fuera, y si el modulo cae al importarse (falta una variable de
//    entorno, no viajó el binario nativo de argon2, no está el `dist/`) el
//    navegador solo recibia `FUNCTION_INVOCATION_FAILED`. Nunca se imprimen
//    valores de las variables.
const MARCA = 'shim-v2';
const CLAVES = ['DATABASE_URL', 'JWT_SECRET', 'ENV_FILE', 'TRUST_PROXY', 'VERCEL_URL'];

let app;
let fallo;

function ocultar(texto) {
  return String(texto ?? '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`),]+/gi, '[url oculta]')
    .slice(0, 500);
}

async function cargar() {
  if (app || fallo) return;
  try {
    ({ default: app } = await import('./dist/vercel.js'));
  } catch (error) {
    fallo = error;
  }
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
      error: 'el modulo de la funcion no arranco',
      tipo: fallo?.name,
      detalle: ocultar(fallo?.message),
      pila: ocultar(
        String(fallo?.stack ?? '')
          .split('\n')
          .slice(0, 6)
          .join(' | '),
      ),
      entorno: Object.fromEntries(
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
      error: 'excepcion al atender',
      detalle: ocultar(error?.stack ?? error?.message ?? error),
    });
  }
}
