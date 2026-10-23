// Publicacion — entrada de la funcion Node que atiende `/api/*` en Vercel
// (servicio `api` de `vercel.json`).
//
// No es `server.ts`: ese levanta un puerto y aqui no hay proceso persistente que
// escuche. Vercel convierte el export por defecto en la funcion, la monta sobre
// su propio servidor y llama a las rutas con la URL original (`/api/codigos`),
// que es exactamente como `crearApp()` ya tiene montados los routers.
import './lib/entorno.js';
import { crearApp } from './app.js';

export default crearApp();
