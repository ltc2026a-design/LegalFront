// Zona 0/11: arranque del backend. La app (middlewares, CORS, rate limiting y
// routers) se construye en `crearApp()` (src/app.ts) sin levantar el puerto, de
// modo que la misma app pueda ejercitarse en pruebas (supertest) sin abrir
// sockets. Este archivo SOLO levanta el servidor HTTP.
//
// IMPORTANTE (Zona 11 — aislamiento de procesos): el programador de
// sincronizacion (cron de Zona 6) ya NO corre en el proceso de la API. Un
// conector lento o que falla (p. ej. red filtrada hacia los .gob.mx) NUNCA debe
// afectar la latencia de la API. El cron vive ahora en un proceso aparte:
//   `npm run worker`  (backend/src/sincronizacion/worker.ts).
import './lib/entorno.js';
import { crearApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
// 127.0.0.1 es lo correcto cuando nginx termina el TLS en la MISMA maquina.
// En un contenedor (o si otro equipo llama directo al API) hay que poner
// HOST=0.0.0.0 en el entorno.
const host = process.env.HOST ?? '127.0.0.1';
const esProduccion = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';

// Cortafuegos de arranque: antes de exponer esto a internet es mejor reventar
// claro que levantarse con las credenciales por defecto. El login firma tokens
// con JWT_SECRET; sin valor, cualquiera podria forjar sesiones validas.
if (esProduccion) {
  const faltan = ['DATABASE_URL', 'JWT_SECRET'].filter((k) => !(process.env[k] ?? '').trim());
  if (faltan.length > 0) {
    console.error(`[backend] NODE_ENV=production y faltan en el entorno: ${faltan.join(', ')}.`);
    console.error('[backend] no se levanta: define las variables y vuelve a intentarlo.');
    process.exit(1);
  }
}

const app = crearApp();

app.listen(port, host, () => {
  console.log(`[backend] API http://${host}:${port}  ->  GET /api/health, /api/codigos ...`);
  console.log(
    '[backend] la sincronizacion NO corre aqui: usa `npm run worker` en otro proceso.',
  );
  // Que se sirva o no el frente depende solo de las rutas del entorno; se avisa
  // en el arranque para no discutir con un nginx "fantasma" mas tarde.
  const frentes = ['FRENTE_CONSULTA_DIR', 'FRENTE_ADMIN_DIR'].filter((k) => (process.env[k] ?? '').trim());
  console.log(
    frentes.length > 0
      ? `[backend] frentes montados desde: ${frentes.map((k) => `${k}=${process.env[k]}`).join('  ')}`
      : '[backend] solo API (sin frentes): define FRENTE_CONSULTA_DIR / FRENTE_ADMIN_DIR para servir la web desde este proceso.',
  );
});
