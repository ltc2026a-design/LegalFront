// Zona 9 — Generador de claves VAPID locales (sin cuenta externa).
//
// Uso:  node scripts/gen-vapid.mjs
//
// Genera un par de claves VAPID (EC P-256) con `web-push` e imprime las dos
// lineas de entorno. Ademas INSERTA/ACTUALIZA las variables VAPID_* en el
// archivo backend/.env (que esta ignorado por git), para que el backend pueda
// configurar web-push sin hardcodear secretos en el codigo.
//
// NO se sube ninguna clave al repositorio: .env esta en .gitignore.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import webpush from 'web-push';

const aqui = dirname(fileURLToPath(import.meta.url));
const envPath = join(aqui, '..', '.env');

// 1) Generar el par VAPID. publicKey/privateKey vienen en base64url, listo
//    para applicationServerKey en el navegador.
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const subject = 'mailto:admin@consulta-legal.local';

// 2) Imprimir las lineas (lo que pide el enunciado: "prints the two env lines").
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=${subject}`);

// 3) Upsert en .env (sin duplicar claves ni destruir el resto del archivo).
function upsert(texto, clave, valor) {
  const re = new RegExp(`^${clave}=.*$`, 'm');
  const linea = `${clave}=${valor}`;
  if (re.test(texto)) return texto.replace(re, linea);
  const sep = texto.endsWith('\n') || texto === '' ? '' : '\n';
  return `${texto}${sep}${linea}\n`;
}

if (existsSync(envPath)) {
  let contenido = readFileSync(envPath, 'utf8');
  contenido = upsert(contenido, 'VAPID_PUBLIC_KEY', publicKey);
  contenido = upsert(contenido, 'VAPID_PRIVATE_KEY', privateKey);
  contenido = upsert(contenido, 'VAPID_SUBJECT', subject);
  writeFileSync(envPath, contenido, 'utf8');
  console.log(`\n[gen-vapid] Claves VAPID escritas en ${envPath}`);
} else {
  console.error(
    `\n[gen-vapid] AVISO: no existe ${envPath}; crea backend/.env y vuelve a ejecutar.`,
  );
}
