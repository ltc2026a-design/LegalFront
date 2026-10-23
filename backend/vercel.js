// Entrada que ve Vercel: el servicio `api` de vercel.json declara
// "entrypoint": "vercel.js".
//
// Por que este archivo y no `dist/vercel.js` directamente: Vercel valida el
// entrypoint CONTRA EL CODIGO FUENTE, antes de ejecutar la buildCommand, y
// `dist/` no existe hasta que corre `npm run build` en el despliegue
// (ENTRYPOINT_NOT_FOUND). Este archivo si viaja en el repo y solo reexporta la
// app compilada, que es la que realmente levanta la funcion.
export { default } from './dist/vercel.js';
