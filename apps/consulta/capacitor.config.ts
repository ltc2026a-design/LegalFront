import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Zona 10 — Configuracion de Capacitor para la app de consulta (@legal/consulta).
 *
 * `webDir` es la salida de `npm run build` (Vite). El `base: './'` de vite.config.ts
 * ya hace que el bundle funcione servido desde el scheme nativo.
 *
 * `server.androidScheme: 'http'`: la SPA se sirve desde http://localhost y la API
 * local del equipo tambien es http://, asi que NO hay "mixed content" al llamar a
 * una URL LAN tipo http://192.168.x.x:3000/api. En produccion (Zona 11), con
 * dominio https real, se puede volver a 'https'.
 */
const config: CapacitorConfig = {
  appId: 'mx.consulta.legal',
  appName: 'Consulta Legal',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
  },
  android: {
    // Permite peticiones http (API LAN en desarrollo) desde el WebView.
    allowMixedContent: true,
  },
  plugins: {
    // Live Updates (@capgo/capacitor-updater, autohospedado). La comprobación NO usa
    // la nube de Capgo: `revisarActualizaciones()` lee el manifiesto estatico que
    // publicamos en el propio front (Vercel) y descarga el zip de alli.
    // Con autoUpdate apagado el plugin nunca habla con un servidor externo.
    CapacitorUpdater: {
      autoUpdate: false,
      // "" desactiva la telemetria de estadisticas del plugin.
      statsUrl: '',
      // Numero maximo de versiones de bundle que se guardan en el telefono.
      maxVersion: 2,
    },
  },
};

export default config;
