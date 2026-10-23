// Publicación — el mismo proceso que sirve el API deja de depender de un nginx
// para repartir los frentes: si en el entorno hay rutas de `dist`, la app de
// consulta se sirve en `/` y el panel en `/admin`.
//
// Por que esto importa: con API y frentes en UN solo origen el navegador no
// aplica CORS en produccion (el frontend pide `/api` relativo), el Service
// Worker puede cachear same-origin y el APK descargado apunta al mismo host.
//
// Cada montaje es OPT-IN por variable de entorno: si la carpeta no existe o no
// tiene index.html, ese frente simplemente no se monta (el API sigue solo, que
// es como corre en desarrollo y en las pruebas).
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';

// backend/src o backend/dist -> raiz del monorepo.
const RAIZ_MONOREPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Donde vive el `dist` compilado. */
function rutaFrente(variable: string): string | null {
  const crudo = process.env[variable]?.trim();
  if (!crudo) return null;
  if (isAbsolute(crudo)) {
    return existsSync(join(crudo, 'index.html')) ? crudo : null;
  }
  // Relativa: se prueba primero donde se lanzo el proceso y luego la raiz del
  // repo, porque `npm run start` corre dentro de backend/ pero el dist de la
  // app esta en apps/consulta/dist. Si ninguno tiene index.html, no se monta.
  const candidatas = [resolve(process.cwd(), crudo), resolve(RAIZ_MONOREPO, crudo)];
  return candidatas.find((c) => existsSync(join(c, 'index.html'))) ?? null;
}

/**
 * Estaticos con las cabeceras correctas: lo hashed (`/assets/*`) es inmutable
 * para siempre, y el HTML + el Service Worker NUNCA se guardan sin revalidar —
 * si no, un telefono se queda con el shell viejo y los cambios de diseno no
 * llegan ni con Live Updates.
 */
function estaticos(dir: string) {
  return express.static(dir, {
    index: false,
    fallthrough: true,
    // Sin esto, serve-static responde un 302 a la MISMA ruta cuando pide '/' y
    // no hay indice: bucle infinito. Con redirect:false la navegacion cae al
    // middleware de la SPA, que es el que debe devolver index.html.
    redirect: false,
    setHeaders(res, ruta) {
      const esAsset = ruta.includes(`${sep}assets${sep}`) || /-[A-Za-z0-9_]{8}\.(js|css)$/.test(ruta);
      if (esAsset) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
    },
  });
}

/** Navegaciones GET/HEAD que no casan con un archivo: al index del frente. */
function spa(dir: string, prefijo: string) {
  return (req: Request, res: Response, next: () => void): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    // El API tiene prioridad absoluta: /api/* jamas cae al HTML.
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    if (prefijo && !req.path.startsWith(prefijo)) {
      next();
      return;
    }
    res.sendFile(join(dir, 'index.html'));
  };
}

/** true si se monto algo; lo usa server.ts para avisar por consola. */
export function montarFrentes(app: Express): { consulta: boolean; admin: boolean } {
  const consulta = rutaFrente('FRENTE_CONSULTA_DIR');
  const admin = rutaFrente('FRENTE_ADMIN_DIR');

  if (admin) {
    // El index se resuelve ANTES de los estaticos: servir-estaticos responde a
    // la peticion de un directorio (`/admin/`) con un 302 a si misma, y ahi se
    // muere el navegador. `/admin` (sin barra) si debe redirigir a `/admin/`,
    // porque los assets del panel se piden con rutas relativas.
    const indice = join(admin, 'index.html');
    app.get('/admin/', (_req, res) => res.sendFile(indice));
    app.use('/admin', estaticos(admin));
    app.use(spa(admin, '/admin'));
  }

  if (consulta) {
    const indice = join(consulta, 'index.html');
    app.get('/', (_req, res) => res.sendFile(indice));
    app.use(estaticos(consulta));
    app.use(spa(consulta, ''));
  }

  return { consulta: Boolean(consulta), admin: Boolean(admin) };
}
