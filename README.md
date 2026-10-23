# LegalFront — Sistema de Consulta Legal (frentes publicados en Vercel)

Este repositorio se genera desde el monorepo de desarrollo con:

```bash
npm run preparar:repos -- front
```

No edites aquí el código: la fuente de verdad es `C:\Users\harol\Desktop\App de asistencia de trabajo`.
Cualquier cambio se hace allá y se vuelve a correr el script.

Contiene tres servicios que comparten un mismo despliegue:

| Carpeta          | Paquete          | Puerto local | Qué es                                     |
| ---------------- | ---------------- | ------------ | ------------------------------------------ |
| `apps/consulta`  | `@legal/consulta`| 5173         | La app que usan las personas (web + APK)   |
| `apps/admin`     | `@legal/admin`   | 5174         | El panel de administración (solo dueñ@)    |
| `backend`        | `@legal/backend` | 3000         | La API Express (consulta, login, asistente) |

## Variables de entorno

| Variable               | Dónde                          | Valor                                                          |
| ---------------------- | ------------------------------ | -------------------------------------------------------------- |
| `VITE_API_URL`         | Project Settings → Environment | `/api` (ruta relativa: front y API comparten origen)           |
| `DATABASE_URL`         | Project Settings → Environment | la URI del **pooler de sesión** de Supabase con `sslmode=no-verify` (secret) |
| `JWT_SECRET`           | Project Settings → Environment | cadena larga al azar (secret)                                  |
| `TRUST_PROXY`          | Project Settings → Environment | `1`                                                            |
| `PG_POOL_MAX`          | Project Settings → Environment | `3` (el pooler free de Supabase admite 60 conexiones)          |
| `VITE_BASE`            | Project Settings → Environment | `/panel/` (solo la consume el panel; la consulta la ignora)    |
| `VITE_LIVE_UPDATE_URL` | Project Settings → Environment | `https://<este-proyecto>.vercel.app/live-updates/check.json`   |

Las tres primeras son obligatorias para que el API arranque; sin `DATABASE_URL` o
`JWT_SECRET` el módulo de la función revienta al cargar (es a propósito, no se levanta
con credenciales por defecto). No hace falta `ORIGINES_PERMITIDAS`: al ser mismo origen
el navegador no manda preflight.

Copia `.env.example` → `apps/consulta/.env` y `apps/admin/.env` solo para desarrollo local.
En Vercel las variables se ponen en el panel; no se sube ningún `.env`.
**Las `VITE_*` se leen en el build** (Vite las quema en el bundle): si cambias una, hay que
volver a desplegar.

## Publicar en Vercel (un proyecto, tres servicios)

El `vercel.json` de la raíz activa el modo **services**: una sola URL, una sola tabla de
rutas públicas y las variables compartidas.

| Servicio   | Carpeta          | Ruta pública                                   | Qué es                                  |
| ---------- | ---------------- | ---------------------------------------------- | --------------------------------------- |
| `api`      | `backend`        | `/api/…`                                       | Express sobre Fluid compute              |
| `consulta` | `apps/consulta`  | `/` (todo lo demás)                            | La app que usan las personas             |
| `panel`    | `apps/admin`     | `/panel/`                                      | El panel de administración (solo dueñ@)  |

1. Importa el repositorio **una sola vez** como proyecto Vercel. La raíz del proyecto es
   la raíz del repo (no `apps/…`); Vercel construye cada servicio por su cuenta.
2. Pon las variables de la tabla anterior en _Environment Variables_ (Production y Preview).
3. El panel se sirve bajo prefijo, y un servicio **recibe la ruta original sin recortar**.
   Por eso el build del panel usa `VITE_BASE=/panel/` (los assets quedan en
   `/panel/assets/…`) y el `vercel.json` tiene un `request.path` dentro del servicio que
   quita el prefijo antes de que el panel lea la ruta. Si mueves el panel a otra ruta,
   cambia a la vez `VITE_BASE`, la `redirect` de `/panel`, las `rewrites` y el `routes`
   del servicio.
4. El servicio `api` NO necesita `bindings`: lo llama el navegador directamente por su
   ruta pública `/api/…`, y como es el mismo origen que `consulta`, `resolverApiBase()`
   acaba usando la ruta relativa (cero CORS, y la caché offline del Service Worker
   sigue viendo `/api` como propio).

### Cómo está armado el servicio `api`

- `framework: express` + `entrypoint: dist/vercel.js`: Vercel convierte la app en una
  única **Vercel Function** con Fluid compute. El archivo es `backend/src/vercel.ts`,
  que hace `export default crearApp()` — no escucha un puerto, porque en una función no
  hay proceso persistente. `src/server.ts` (el `listen` de siempre) sigue para el
  monorepo, Render o cualquier contenedor.
- `buildCommand: npx prisma generate && npm run build`: el cliente Prisma generado NO
  viaja en el espejo (`src/generated` está excluido e ignorado), por eso hay que
  generarlo en el build. `prisma generate` no toca la base (el placeholder de
  `prisma.config.ts` cubre la falta de `DATABASE_URL`).
- Las rutas llegan **con el prefijo `/api` intacto**, que es como `crearApp()` ya las
  monta: no hace falta ningún `request.path` en este servicio.
- `prisma`, `pg` y `node-cron` están en `dependencies` (no en `devDependencies`) porque
  son código de arranque y de runtime.
- Limites que aplica Vercel (plan Hobby): 300 s por invocación (suficiente para el
  chat en streaming), 4.5 MB de cuerpo de petición y escala a cero entre visitas.
- **No** hay cron interno en Vercel: `node-cron` vive en `npm run worker`, que aquí no
  corre. La sincronización se dispara a mano desde el panel (*Forzar sincronización*)
  o desde el monorepo; si algún día quieres el libro automático de madrugada, se
  declara en la llave `crons` de `vercel.json` apuntando a una ruta del API protegida
  con `CRON_SECRET`.

**Migraciones**: el despliegue NO corre `prisma migrate deploy` (una base inaccesible 5
segundos no debe romper un despliegue). Cuando añadas una migración, aplícala tú contra
Supabase desde el monorepo:

```bash
DATABASE_URL="$(grep -m1 '^DATABASE_URL_SUPABASE' backend/.env | cut -d= -f2-)" \
  npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

y después el vuelco de contenido si cambió algo (`npm run replicar -- --destino=… --confirmar=sobrescribir`).

> Plan B, por si el modo services (beta) te da problemas con el prefijo del panel: importa
> dos proyectos del mismo repo, con _Root Directory_ `apps/consulta` y `apps/admin`, y deja
> el `vercel.json` solo para el proyecto de en medio… en la práctica: cada app en `/` de su
> propio dominio, sin `VITE_BASE`, y el API viaja con el proyecto de `consulta`.


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
npm run live:publicar -- --api=https://legalfront-five.vercel.app/api --notas="que cambio"
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
