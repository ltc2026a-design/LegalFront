// Entrada que ve Vercel: el servicio `api` de vercel.json declara
// "entrypoint": "vercel.js".
//
// Por que este archivo y no `dist/vercel.js` directamente: Vercel valida el
// entrypoint CONTRA EL CODIGO FUENTE, antes de ejecutar la buildCommand, y
// `dist/` no existe hasta que corre `npm run build` en el despliegue
// (ENTRYPOINT_NOT_FOUND). Este archivo si viaja en el repo y levanta la app
// compilada, que es la que realmente atiende las peticiones.
//
// El envoltorio con try/catch existe porque dentro de una funcion de Vercel no
// hay forma de ver el stack desde fuera: si el modulo revienta al importarse
// (falta una variable de entorno, no esta el binario nativo de argon2, el
// `dist/` no viajo en el bundle) el navegador solo recibe
// `FUNCTION_INVOCATION_FAILED`. Aqui se responde en JSON la causa, sin valores.
let app;
let fallo;
try {
  ({ default: app } = await import('./dist/vercel.js'));
} catch (error) {
  fallo = error;
}

const CLAVES = ['DATABASE_URL', 'JWT_SECRET', 'ENV_FILE', 'TRUST_PROXY', 'VERCEL_URL'];

function ocultar(texto) {
  return String(texto ?? '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`),]+/gi, '[url oculta]')
    .slice(0, 500);
}

export default function handler(req, res) {
  if (fallo) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify(
        {
          ok: false,
          error: 'el modulo de la funcion no arranco',
          tipo: fallo?.name,
          detalle: ocultar(fallo?.message),
          pila: ocultar(
            String(fallo?.stack ?? '')
              .split('\n')
              .slice(0, 6)
              .join(' | '),
          ),
          entorno: Object.fromEntries(CLAVES.map((k) => [k, Boolean(process.env[k]?.trim())])),
        },
        null,
        2,
      ),
    );
    return;
  }
  try {
    app(req, res);
  } catch (error) {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: false,
        error: 'excepcion al atender',
        detalle: ocultar(error?.message ?? error),
      }),
    );
  }
}
