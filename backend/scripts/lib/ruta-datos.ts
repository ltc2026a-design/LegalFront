// Los importadores reciben un archivo de datos como argumento. `npm run importar:*`
// ejecuta con cwd = backend/, pero desde la raiz del monorepo se documentan con
// prefijo "backend/"; esta funcion resuelve ambas escrituras sin duplicar comandos.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function resolverArchivoDatos(p: string): string {
  if (isAbsolute(p) || existsSync(p)) return p;
  for (const alterno of [join(RAIZ_REPO, 'backend', p), join(RAIZ_REPO, p)]) {
    if (existsSync(alterno)) return alterno;
  }
  return p;
}
