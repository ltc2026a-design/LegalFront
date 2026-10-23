// Publicacion — carga el `.env` del backend por RUTA ABSOLUTA.
//
// `import 'dotenv/config'` busca el archivo en el directorio de trabajo del
// proceso. Con npm scripts eso siempre es `backend/`, pero systemd
// (WorkingDirectory=/opt/consulta), Docker (WORKDIR distinto) o un `node
// backend/dist/server.js` suelto cambian el cwd y el servicio arranca sin
// DATABASE_URL: el fallo se ve entonces como un "missing env" imposible de
// adivinar desde el log. Este modulo elimina esa dependencia del origen.
//
// Orden de precedencia: lo que ya venga del entorno del sistema manda (dotenv no
// pisa variables existentes), luego `ENV_FILE` si el servidor apunta a otro sitio,
// y si no el `.env` de backend/ (o el de la raiz del repo como respaldo).
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// src/lib o dist/lib -> backend/.
const CARPETA_BACKEND = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const candidatos = [
  process.env.ENV_FILE,
  resolve(CARPETA_BACKEND, '.env'),
  resolve(CARPETA_BACKEND, '..', '.env'),
].filter((p): p is string => Boolean(p?.trim()));

for (const ruta of candidatos) {
  if (existsSync(ruta)) config({ path: ruta });
}
