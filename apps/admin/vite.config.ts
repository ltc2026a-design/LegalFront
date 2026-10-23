import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tailwind CSS v4: el plugin de Vite sustituye a tailwind.config.js (ver src/index.css).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Base absoluta: el panel vive en / y en rutas hondas (/cambios, /contenido/...);
  // con './' el navegador resolveria los assets relativos a la ruta actual y daria 404.
  base: '/',
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
});
