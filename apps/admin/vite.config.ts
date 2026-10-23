import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tailwind CSS v4: el plugin de Vite sustituye a tailwind.config.js (ver src/index.css).
// Prefijo bajo el que se sirve el panel. En el monorepo y en Render es `/`; en el
// proyecto unico de Vercel (modo services) el panel vive detras de `/panel`, y ahi se
// construye con VITE_BASE=/panel/ para que el HTML apunte los assets a esa ruta y el
// router (/src/main.tsx derivea el basename de BASE_URL) recorte el prefijo.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Base absoluta: el panel vive en / y en rutas hondas (/cambios, /contenido/...);
  // con './' el navegador resolveria los assets relativos a la ruta actual y daria 404.
  base,
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
