import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Sello de build en el Service Worker.
 *
 * El navegador decide si hay un SW nuevo comparando los BYTES de `sw.js`, y ese archivo
 * vive en `public/` y no cambia entre despliegues. Sin este sello nunca se dispararía
 * `updatefound`: la pestaña abierta (o la PWA instalada en iPhone/PC) seguiría con el
 * código viejo y sin avisar, que es justo lo que se quiere evitar.
 */
function sellarServiceWorker(): Plugin {
  let destino = '';
  return {
    name: 'sellar-service-worker',
    apply: 'build',
    configResolved(config) {
      destino = resolve(config.root, config.build.outDir, 'sw.js');
    },
    async closeBundle() {
      await appendFile(destino, `\n/* build ${new Date().toISOString()} */\n`);
    },
  };
}

// Tailwind CSS v4: el plugin de Vite sustituye a tailwind.config.js (ver src/index.css).
export default defineConfig({
  plugins: [react(), tailwindcss(), sellarServiceWorker()],
  // Base absoluta: el SPA se sirve en / y en rutas hondas (/codigo/.../articulo/5),
  // y con './' el navegador resolveria los assets relativos a la ruta actual y daria
  // 404. Capacitor y Tauri tambien sirven desde la raiz de su scheme (http://localhost,
  // tauri://localhost), asi que el mismo build sirve para web, APK y escritorio.
  base: '/',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
});
