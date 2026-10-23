// SONDA DE DESEMPLEO (temporal, se borra al diagnosticar). Vive en la RAIZ del
// espejo LegalFront; la entrada declarada del servicio `api` esta en
// `backend/vercel.js`. Las dos tienen el mismo cuerpo con marca distinta
// (`sonda-raiz-v8` / `sonda-backend-v8`): la marca que llegue dice desde donde
// resuelve Vercel el `entrypoint` del servicio, y `aqui` dice que archivos hay
// dentro de la funcion desplegada.
//
// No importa nada de `backend/`: si el fallo estuviera en el grafo de modulos
// (variable de entorno, binario nativo de argon2, `dist/`), aqui no hay grafo y
// el JSON tiene que salir igual.
import fs from 'node:fs';

const MARCA = 'sonda-raiz-v8';
const CLAVES = ['DATABASE_URL', 'JWT_SECRET', 'ENV_FILE', 'TRUST_PROXY', 'PG_POOL_MAX', 'VERSION_DEPLOY'];

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

export default async function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify(
      {
        ok: true,
        marca: MARCA,
        node: process.version,
        esteArchivo: ocultar(import.meta.url),
        aqui: leer(new URL('.', import.meta.url)),
        backend: leer(new URL('./backend/', import.meta.url)),
        ruta: ocultar(req.url),
        presentes: Object.fromEntries(
          CLAVES.map((clave) => [clave, Boolean(process.env[clave]?.trim())]),
        ),
      },
      null,
      2,
    ),
  );
}
