// SONDA DE DESEMPLEO (temporal). Entrada declarada del servicio `api`
// (`vercel.json`: root backend, entrypoint vercel.js). Responde JSON SIEMPRE, con
// 200, y nunca importa nada en la carga del modulo: si este handler corre, el
// cuerpo dice donde esta la funcion, que hay a su lado y por que no arranco la
// app. Si Vercel sigue devolviendo su pagina `FUNCTION_INVOCATION_FAILED`, es que
// este codigo no se ejecuto en absoluto.
//
// `backend/vercel.js` (marca `sonda-backend-v8`) y el `vercel.js` de la raiz del
// espejo (marca `sonda-raiz-v8`) son la misma sonda desde dos sitios: la marca
// que llegue revela desde donde resuelve Vercel el `entrypoint`.
import fs from 'node:fs';

const MARCA = 'sonda-backend-v8';
const CLAVES = ['DATABASE_URL', 'JWT_SECRET', 'ENV_FILE', 'TRUST_PROXY', 'PG_POOL_MAX', 'VERSION_DEPLOY'];

function ocultar(texto) {
  return String(texto ?? '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`),]+/gi, '[url oculta]')
    .slice(0, 400);
}

function leerDirectorio(urlBase) {
  try {
    return fs.readdirSync(new URL('.', urlBase)).slice(0, 25);
  } catch (error) {
    return [`error: ${ocultar(error?.message)}`];
  }
}

async function cargarApp(intentos) {
  const opciones = [
    ['literal', () => import('./dist/vercel.js')],
    ['import.meta.url', () => import(new URL('./dist/vercel.js', import.meta.url))],
    ['absoluto', () => import('/var/task/dist/vercel.js')],
  ];
  for (const [nombre, opcion] of opciones) {
    try {
      const modulo = await opcion();
      if (modulo?.default) return modulo.default;
      intentos.push({ nombre, detalle: 'el modulo no trae default export' });
    } catch (error) {
      intentos.push({ nombre, tipo: error?.name, detalle: ocultar(error?.message) });
    }
  }
  return undefined;
}

export default async function handler(req, res) {
  const intentos = [];
  const app = await cargarApp(intentos);
  res.setHeader('x-sonda-marca', MARCA);
  if (app) {
    // La app cargo: se ve en el header y el JSON de `/api/health` reporta la base.
    app(req, res);
    return;
  }
  const cuerpo = {
    ok: false,
    marca: MARCA,
    node: process.version,
    esteArchivo: ocultar(import.meta.url),
    aqui: leerDirectorio(import.meta.url),
    ruta: ocultar(req.url),
    intentos,
    presentes: Object.fromEntries(
      CLAVES.map((clave) => [clave, Boolean(process.env[clave]?.trim())]),
    ),
  };
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(cuerpo, null, 2));
}
