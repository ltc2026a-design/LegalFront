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

| Variable       | Dónde                              | Valor                                                        |
| -------------- | ---------------------------------- | ------------------------------------------------------------ |
| `VITE_API_URL` | Project Settings → Environment     | `https://<tu-backend>.onrender.com/api`                      |

Copia `.env.example` → `apps/consulta/.env` y `apps/admin/.env` solo para desarrollo local.
En Vercel la variable se pone en el panel, no se sube ningún `.env`.

## Publicar en Vercel (dos proyectos, mismo repositorio)

1. Importa el repo una vez por proyecto:
   - **Proyecto 1 · consulta** → _Root Directory_ = `apps/consulta`
   - **Proyecto 2 · panel** → _Root Directory_ = `apps/admin`
2. En ambos: Framework **Vite**, Build Command `npm run build`, Output `dist`,
   Install Command `npm install` (Vercel detecta el workspace de la raíz).
3. Agrega `VITE_API_URL` en _Environment Variables_ (Production, Preview y Development) y
   **vuelve a desplegar** — Vite "quema" la variable dentro del bundle en el build.
4. Dominios: deja el `.vercel.app` de siempre. Si usas dominio propio, publícalo con
   **HTTPS obligatorio** (el Service Worker y Live Updates exigen origen seguro).

El back-end debe permitir el origen del front con la variable `ORIGINES_PERMITIDAS`
(p. ej. `https://*.vercel.app`). Sin eso el navegador bloquea las llamadas y la app
queda en blanco.

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
