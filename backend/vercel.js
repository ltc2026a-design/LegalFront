// Entrada que ve Vercel: el servicio `api` de vercel.json declara
// "entrypoint": "vercel.js".
//
// VERSION SONDA (tarea #92). No importa NADA de `dist/` al evaluarse el modulo
// y responde SIEMPRE 200. Serve para separar los dos fallos que desde fuera se
// ven iguales, como `FUNCTION_INVOCATION_FAILED`:
//   a) que este archivo no se ejecute (la entrada no le sirve al receiver de
//      Vercel: formato ESM/CJS con `type: module`, framework "express",
//      trazado del bundle), o
//   b) que el problema este dentro de `dist/vercel.js` (faltan variables de
//      entorno o no viajó el binario nativo de argon2).
// Si `/api/health` contesta este JSON, la entrada esta bien y el fallo es (b);
// si sigue en 500, es (a). En cuanto responda se vuelve al handler normal.
// Solo se reportan presencias de variables, nunca sus valores.
const MARCA = 'sonda-v3';
const CLAVES = ['DATABASE_URL', 'JWT_SECRET', 'ENV_FILE', 'TRUST_PROXY', 'VERCEL_REGION'];

function ocultar(texto) {
  return String(texto ?? '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`),]+/gi, '[url oculta]')
    .slice(0, 400);
}

export default async function handler(req, res) {
  let dist;
  try {
    const modulo = await import('./dist/vercel.js');
    dist = { cargo: true, tipo: typeof modulo.default };
  } catch (error) {
    dist = { cargo: false, tipo: error?.name, detalle: ocultar(error?.message) };
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify(
      {
        ok: true,
        marca: MARCA,
        node: process.version,
        ruta: req?.url,
        entorno: Object.fromEntries(CLAVES.map((clave) => [clave, Boolean(process.env[clave]?.trim())])),
        dist,
      },
      null,
      2,
    ),
  );
}
