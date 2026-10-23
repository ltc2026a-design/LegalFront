// Fase 2 — UNICA via para crear credenciales de la app de consulta.
//
// REGLA DURA DE PRODUCTO (requisito #1): NO hay autorregistro publico (ni endpoint ni
// UI). Solo el dueno del proyecto ejecuta este CLI para dar de alta a una persona; la
// gente escribe su clave en /entrar y ya.
//
// Uso (con flags):
//   npm run usuario:create -- --email ana@dominio.mx --nombre "Ana" --password "ContrasenaLarga123"
//   npm run usuario:create                              # interactivo, pregunta lo que falte
//
// Si ademas se pasa --deviceId <el del telefono>, las credenciales se enganchan a la
// fila ya existente de ese dispositivo: la persona conserva ahi mismo sus favoritos.
// Sin --deviceId se crea una fila nueva con un device_id sintetico (cuenta:…), y los
// favoritos del telefono se copian a la cuenta la primera vez que inicia sesion.
//
// - La contrasena debe tener >= 12 caracteres y se hash con argon2 (nunca en texto).
// - El email se normaliza a minusculas y es unico: se rechaza si otro usuario ya lo usa.
import '../lib/entorno.js';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import argon2 from 'argon2';
import { prisma } from '../lib/prisma.js';

interface Opciones {
  email?: string;
  nombre?: string;
  password?: string;
  deviceId?: string;
}

function parsearArgs(argv: string[]): Opciones {
  const opts: Opciones = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key.includes('=')) {
      const [k, ...rest] = key.split('=');
      (opts as Record<string, string>)[k] = rest.join('=');
    } else {
      (opts as Record<string, string>)[key] = argv[++i] ?? '';
    }
  }
  return opts;
}

function esEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function completarInteractivo(parciales: Opciones): Promise<Opciones> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const out: Opciones = { ...parciales };
  try {
    if (!out.email) out.email = (await rl.question('Email de la persona: ')).trim();
    if (!out.nombre) out.nombre = (await rl.question('Nombre visible: ')).trim();
    if (!out.password) out.password = (await rl.question('Contrasena (>= 12 caracteres): ')).trim();
  } finally {
    rl.close();
  }
  return out;
}

async function main(): Promise<void> {
  const opciones = await completarInteractivo(parsearArgs(process.argv.slice(2)));

  const email = (opciones.email ?? '').trim().toLowerCase();
  const nombre = (opciones.nombre ?? '').trim();
  const password = opciones.password ?? '';
  const deviceId = (opciones.deviceId ?? '').trim().slice(0, 200);

  if (!email || !esEmailValido(email)) {
    console.error(`[usuario:create] Email invalido: "${email}".`);
    process.exitCode = 2;
    return;
  }
  if (!nombre) {
    console.error('[usuario:create] Falta el nombre.');
    process.exitCode = 2;
    return;
  }
  if (password.length < 12) {
    console.error('[usuario:create] La contrasena debe tener al menos 12 caracteres.');
    process.exitCode = 2;
    return;
  }

  const dueno = await prisma.usuarioApp.findUnique({ where: { loginEmail: email } });
  if (dueno) {
    console.error(`[usuario:create] Ya existe una cuenta con el email "${email}".`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await argon2.hash(password);

  // ¿Dispositivo conocido? Se le pegan las credenciales y no se crea fila nueva.
  const dispositivo = deviceId ? await prisma.usuarioApp.findUnique({ where: { deviceId } }) : null;
  if (dispositivo && dispositivo.loginEmail) {
    console.error(
      `[usuario:create] El dispositivo "${deviceId}" ya es la cuenta ${dispositivo.loginEmail}.`,
    );
    process.exitCode = 1;
    return;
  }

  const creado = dispositivo
    ? await prisma.usuarioApp.update({
        where: { id: dispositivo.id },
        data: { loginEmail: email, passwordHash, nombre },
        select: { id: true, deviceId: true, nombre: true, loginEmail: true },
      })
    : await prisma.usuarioApp.create({
        data: {
          deviceId: `cuenta:${randomBytes(8).toString('hex')}`,
          loginEmail: email,
          passwordHash,
          nombre,
        },
        select: { id: true, deviceId: true, nombre: true, loginEmail: true },
      });

  console.log('[usuario:create] Cuenta creada correctamente:');
  console.log(
    `  id=${creado.id}  email=${creado.loginEmail}  nombre=${creado.nombre}  device=${creado.deviceId}`,
  );
  console.log(
    dispositivo
      ? '  (se engancho al dispositivo existente: conserva sus favoritos)'
      : '  (los favoritos del telefono se copian a la cuenta al primer inicio de sesion)',
  );
  console.log('\nUso:\n  npm run usuario:create -- --email <email> --nombre "<nombre>" --password <passwd> [--deviceId <device_id>]');
}

main()
  .catch((err: unknown) => {
    console.error('[usuario:create] error:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
