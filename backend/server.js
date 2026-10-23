// Entrada que ve Vercel (servicio `api` de vercel.json, framework "express").
//
// El preset de Express de Vercel busca la aplicacion en archivos con nombre
// reservado y en este orden: `app.*`, `index.*`, `server.*`, `src/app.*`,
// `src/index.*`, `src/server.*`. Por eso este archivo existe y se llama
// `server.js`: con `entrypoint: "vercel.js"` la construccion pasaba pero la
// funcion moria antes de ejecutar una sola linea (500 generico,
// FUNCTION_INVOCATION_FAILED, incluso con una entrada que no importaba nada).
//
// Tampoco puede senalar `src/server.ts`, que es el arranque real del monorepo:
// `src/app.ts` se comprueba ANTES y solo exporta `crearApp` por nombre, sin
// default ni `listen`. Y `dist/` no sirve como entrada porque Vercel valida el
// entrypoint contra el codigo fuente, antes de correr la buildCommand.
//
// La app compilada (`dist/vercel.js`) es un `export default crearApp()` sin
// `listen`, que es justamente lo que el receiver de Vercel convierte en la
// funcion que atiende `/api/*` con la URL original.
export { default } from './dist/vercel.js';
