# LegalFront — Sistema de Consulta Legal (frentes publicados en Vercel)

Este repositorio se genera desde el monorepo de desarrollo con:

```bash
npm run preparar:repos -- front
```

No edites aquí el código: la fuente de verdad es `C:\Users\harol\Desktop\App de asistencia de trabajo`.
Cualquier cambio se hace allá y se vuelve a correr el script.

Contiene dos proyectos Vite + React independientes:

| Carpeta          | Paquete          | Puerto local | Qué es                                     |
| ---------------- | ---------------- | ------------ | ------------------------------------------ |
| `apps/consulta`  | `@legal/consulta`| 5173         | La app que usan las personas (web + APK)   |
| `apps/admin`     | `@legal/admin`   | 5174         | El panel de administración (solo dueñ@)    |

## Variables de entorno

| Variable               | Dónde                          | Valor                                                          |
| ---------------------- | ------------------------------ | -------------------------------------------------------------- |
| `VITE_API_URL`         | Project Settings → Environment | `https://<tu-backend>.onrender.com/api`                        |
| `VITE_BASE`            | Project Settings → Environment | `/panel/` (solo la consume el panel; la consulta la ignora)    |
| `VITE_LIVE_UPDATE_URL` | Project Settings → Environment | `https://<este-proyecto>.vercel.app/live-updates/check.json`   |

Copia `.env.example` → `apps/consulta/.env` y `apps/admin/.env` solo para desarrollo local.
En Vercel las variables se ponen en el panel; no se sube ningún `.env`.
**Todas se leen en el build** (Vite las quema en el bundle): si cambias una, hay que
volver a desplegar.

## Publicar en Vercel (un proyecto, dos servicios)

El `vercel.json` de la raíz activa el modo **services**: una sola URL, una sola tabla de
rutas públicas y las variables compartidas.

| Servicio   | Carpeta          | Ruta pública      | Qué es                                    |
| ---------- | ---------------- | ----------------- | ----------------------------------------- |
| `consulta` | `apps/consulta`  | `/` (todo lo demás)| La app que usan las personas              |
| `panel`    | `apps/admin`     | `/panel/`         | El panel de administración (solo dueñ@)   |

1. Importa el repositorio **una sola vez** como proyecto Vercel. La raíz del proyecto es
   la raíz del repo (no `apps/…`); Vercel construye cada servicio por su cuenta.
2. Pon las tres variables de arriba en _Environment Variables_ (Production y Preview).
3. El panel se sirve bajo prefijo, y un servicio **recibe la ruta original sin recortar**.
   Por eso el build del panel usa `VITE_BASE=/panel/` (los assets quedan en
   `/panel/assets/…`) y el `vercel.json` tiene un `request.path` dentro del servicio que
   quita el prefijo antes de que el panel lea la ruta. Si mueves el panel a otra ruta,
   cambia a la vez `VITE_BASE`, la `redirect` de `/panel`, las `rewrites` y el `routes`
   del servicio.
4. No hay `bindings`: ningún servicio llama a otro. La API vive fuera de este despliegue
   (Render) y el navegador la alcanza con `VITE_API_URL`. Un binding solo sirve para
   llamadas **server-side entre servicios del mismo proyecto**; si algún día el backend
   se muda acá como tercer servicio, entonces sí: binding `API_URL` en `consulta` y
   `resolverApiBase()` volvería a usar el mismo origen.

El back-end debe permitir el origen del front con la variable `ORIGINES_PERMITIDAS`
(p. ej. `https://*.vercel.app`). Sin eso el navegador bloquea las llamadas y la app
queda en blanco.

> Plan B, por si el modo services (beta) te da problemas con el prefijo: importa dos
> proyectos del mismo repo, con _Root Directory_ `apps/consulta` y `apps/admin`, y borra
> el `vercel.json` de la raíz (cada app queda en `/` de su propio dominio, sin
> `VITE_BASE`). Funciona exactamente igual para las personas que entran.


## Después de cada cambio

```bash
npm run preparar:repos -- front
cd ../LegalFront
git add -A && git commit -m "actualizacion de frentes" && git push
```

Vercel despliega solo al hacer push a `main`. Cada preview es una URL nueva
(`https://<repo>-git-branch-usuario.vercel.app`), útil para revisar antes de publicar.

## App de Android (Capacitor)

`apps/consulta/android` está versionado porque es el proyecto que compila el APK.
Los artefactos generados (`.gradle`, `build/`, `local.properties`, `assets/public`)
están en `.gitignore`.

```bash
npm run build:consulta
npx cap sync android        # desde apps/consulta
cd android && ./gradlew assembleDebug
```

Las actualizaciones de diseño llegan a los teléfonos instalados con **Live Updates**:
el bundle se publica en la ruta estática `/live-updates/` de este mismo sitio.

```bash
# desde el monorepo, cuando ya exista la URL publica del front
npm run live:publicar -- --api=https://<backend>.onrender.com/api --notas="que cambio"
npm run preparar:repos -- front
git add -A && git commit -m "live update <version>" && git push
```

El script compila, empaqueta el `dist` en un zip, escribe `public/live-updates/check.json`
y deja los dos últimos bundles por si hay que revertir. Al terminar el despliegue de
Vercel, cada APK revisa el manifiesto al arrancar y aplica el bundle nuevo en su siguiente
arranque en frío — sin reinstalar y sin pasar por la tienda.

**Una sola vez** hace falta volver a compilar e instalar el APK: la app tiene que llevar
dentro el plugin `@capgo/capacitor-updater` y la variable `VITE_LIVE_UPDATE_URL` quemada
(mira `apps/consulta/.env.production.example`). Un APK anterior a ese cambio no puede
recibir live updates, no existe forma de inyectárselo después.
