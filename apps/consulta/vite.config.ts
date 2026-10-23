import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tailwind CSS v4: el plugin de Vite sustituye a tailwind.config.js (ver src/index.css).
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
