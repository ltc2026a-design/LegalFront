#!/usr/bin/env node
// Publicación — Live Updates: empaqueta el build de la app de consulta y lo deja
// listo para que los teléfonos ya instalados lo bajen solos.
//
//   npm run live:publicar -- --api=https://MIBACKEND.onrender.com/api --notas="Busqueda mas rapida"
//
// Que hace:
//   1. Compila `dist` con el VITE_API_URL que le pases (asi un live update tambien
//      puede cambiar a que API apunta la app).
//   2. Mete el contenido de `dist` en un zip (index.html en la raiz, que es lo que
//      exige el plugin).
//   3. Escribe public/live-updates/check.json con la nueva version y el zip al lado.
//   4. Borra los zips viejos (guarda los 2 ultimos por si hay que revertir).
//
// Despues: commit + push del repo LegalFront. Vercel sirve la carpeta y cada telefono
// aplica el bundle nuevo en su proximo arranque en frio. No hay que reinstalar el APK.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';

const APP = join(process.cwd());
const DIST = join(APP, 'dist');
const SALIDA = join(APP, 'public', 'live-updates');
const MANIFIESTO = join(SALIDA, 'check.json');
const MAX_ZIPS = 2;

function argumento(nombre) {
  const prefijo = `--${nombre}=`;
  const directo = process.argv.find((a) => a.startsWith(prefijo));
  if (directo) return directo.slice(prefijo.length);
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fechaVersion(anterior) {
  const hoy = new Date();
  const base = `${hoy.getFullYear()}.${hoy.getMonth() + 1}.${hoy.getDate()}`;
  if (!anterior || !anterior.startsWith(`${base}.`)) return `${base}.1`;
  const serie = Number.parseInt(anterior.split('.')[3] ?? '0', 10);
  return `${base}.${(Number.isFinite(serie) ? serie : 0) + 1}`;
}

function leerManifiestoViejo() {
  if (!existsSync(MANIFIESTO)) return null;
  try {
    return JSON.parse(readFileSync(MANIFIESTO, 'utf8'));
  } catch {
    return null;
  }
}

/** Recorre `dist` y devuelve [rutaDentroDelZip, contenido] para cada archivo. */
function archivosDeDist(dir, prefijo = '') {
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    const rel = prefijo ? `${prefijo}/${e.name}` : e.name;
    if (e.isDirectory()) {
      // El propio manifiesto y los zips viven en public/, Vite los copia a dist.
      // No van dentro del bundle: serian un zip dentro del zip.
      if (rel === 'live-updates') continue;
      salida.push(...archivosDeDist(abs, rel));
      continue;
    }
    if (rel.endsWith('.map')) continue;
    salida.push([rel, new Uint8Array(readFileSync(abs))]);
  }
  return salida;
}

const api = argumento('api');
const notas = argumento('notas') ?? 'Actualizacion de la app';

if (!existsSync(join(APP, 'index.html'))) {
  console.error('[live:publicar] corres esto desde la carpeta de la app de consulta.');
  process.exit(1);
}

console.log('[live:publicar] 1/4 compilando la app…');
// En Windows `npm` es npm.cmd: sin shell:true spawnSync no lo encuentra.
const build = spawnSync('npm run build', {
  cwd: APP,
  stdio: 'inherit',
  shell: true,
  env: api ? { ...process.env, VITE_API_URL: api } : process.env,
});
if (build.status !== 0) {
  console.error(`[live:publicar] fallo el build (${build.error?.message ?? `exit ${build.status}`}); no se publico nada.`);
  process.exit(build.status ?? 1);
}

console.log('[live:publicar] 2/4 empaquetando…');
const viejo = leerManifiestoViejo();
const version = fechaVersion(viejo?.version);
const entradas = archivosDeDist(DIST);
if (!entradas.some(([r]) => r === 'index.html')) {
  console.error('[live:publicar] el build no trae index.html en la raiz; aborta.');
  process.exit(1);
}
const nombreZip = `bundle-${version}.zip`;
const zip = zipSync(Object.fromEntries(entradas), { level: 9 });
mkdirSync(SALIDA, { recursive: true });
writeFileSync(join(SALIDA, nombreZip), zip);

const sha = createHash('sha256').update(zip).digest('hex');
writeFileSync(
  MANIFIESTO,
  `${JSON.stringify(
    {
      version,
      url: nombreZip, // relativo al manifiesto: funciona en produccion y en previews
      notes: notas,
      publishedAt: new Date().toISOString(),
      files: entradas.length,
      size: zip.length,
      sha256: sha,
    },
    null,
    2,
  )}\n`,
);

console.log('[live:publicar] 3/4 limpiando versiones viejas…');
const zips = readdirSync(SALIDA)
  .filter((n) => n.startsWith('bundle-') && n.endsWith('.zip'))
  .map((n) => ({ n, mtime: statSync(join(SALIDA, n)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
for (const sobra of zips.slice(MAX_ZIPS)) rmSync(join(SALIDA, sobra.n), { force: true });

console.log('[live:publicar] 4/4 listo.');
console.log(`   version  : ${version} (antes ${viejo?.version ?? 'la del APK'})`);
console.log(`   bundle   : ${nombreZip} ${(zip.length / 1024 / 1024).toFixed(2)} MB, ${entradas.length} archivos`);
console.log(`   sha256   : ${sha.slice(0, 16)}…`);
console.log('');
console.log('Siguiente paso (obligatorio para que llegue a los telefonos):');
console.log('  npm run preparar:repos -- front');
console.log('  cd ../LegalFront && git add -A && git commit -m "live update ' + version + '" && git push');
console.log('Cuando Vercel termine el despliegue, cada APK instalado aplica el cambio');
console.log('en su proximo arranque en frio. El bundle anterior se conserva por si hay que revertir.');
console.log(`API quemada en el bundle: ${api ?? 'la que haya en .env / el default'}`);
