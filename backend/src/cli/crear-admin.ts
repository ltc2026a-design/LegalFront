// Zona 7 — UNICA via para crear credenciales de administrador.
//
// REGLA DURA DE PRODUCTO (requisito #1): NO hay autorregistro publico (ni endpoint
// ni UI). Solo el dueno del proyecto ejecuta este CLI para dar de alta un admin.
//
// Uso (con flags):
//   npm run admin:create -- --email owner@dominio.mx --nombre "Owner" \
//     --password "ContrasenaLarga123" --rol administrador
// Uso interactivo (pide lo que falte, oculta la contrasena si es posible):
//   npm run admin:create
//
// - La contrasena debe tener >= 12 caracteres.
// - El email se normaliza a minusculas y es unico: se rechaza si ya existe.
// - El hash se calcula con argon2.
import '../lib/entorno.js';
import { createInterface } from 'node:readline/promises';
import argon2 from 'argon2';
import { prisma } from '../lib/prisma.js';
import { RolAdmin } from '../generated/prisma/client.js';

const ROLES_VALIDOS: readonly string[] = Object.values(RolAdmin);

interface Opciones {
  email?: string;
  nombre?: string;
  password?: string;
  rol?: string;
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

/** Rellena por prompt solo los campos que no vinieron como flags. */
async function completarInteractivo(parciales: Opciones): Promise<Opciones> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const out: Opciones = { ...parciales };
  try {
    if (!out.email) out.email = (await rl.question('Email del administrador: ')).trim();
    if (!out.nombre) out.nombre = (await rl.question('Nombre visible: ')).trim();
    if (!out.password) out.password = (await rl.question('Contrasena (>= 12 caracteres): ')).trim();
    if (!out.rol) {
      out.rol = (
        await rl.question(`Rol [${ROLES_VALIDOS.join(' | ')}] (defecto editor_legal): `)
      ).trim();
    }
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
  const rol = (opciones.rol ?? 'editor_legal').trim().toLowerCase();

  // Validaciones.
  if (!email || !esEmailValido(email)) {
    console.error(`[admin:create] Email invalido: "${email}".`);
    process.exitCode = 2;
    return;
  }
  if (!nombre) {
    console.error('[admin:create] Falta el nombre.');
    process.exitCode = 2;
    return;
  }
  if (password.length < 12) {
    console.error('[admin:create] La contrasena debe tener al menos 12 caracteres.');
    process.exitCode = 2;
    return;
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    console.error(`[admin:create] Rol invalido: "${rol}". Validos: ${ROLES_VALIDOS.join(', ')}.`);
    process.exitCode = 2;
    return;
  }

  // Unicidad de email: se comprueba y se rechaza de forma explicita antes de insertar.
  const existente = await prisma.usuarioAdmin.findUnique({ where: { email } });
  if (existente) {
    console.error(`[admin:create] Ya existe un administrador con el email "${email}".`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await argon2.hash(password);
  const creado = await prisma.usuarioAdmin.create({
    data: { email, nombre, passwordHash, rol: rol as RolAdmin },
    select: { id: true, email: true, nombre: true, rol: true, creadoEn: true },
  });

  console.log('[admin:create] Administrador creado correctamente:');
  console.log(
    `  id=${creado.id}  email=${creado.email}  nombre=${creado.nombre}  rol=${creado.rol}`,
  );
  console.log(`\nUso:\n  npm run admin:create -- --email <email> --nombre "<nombre>" --password <passwd> --rol <${ROLES_VALIDOS.join('|')}>`);
  console.log('  (la contrasena se hash con argon2; NO se guarda en texto plano)');
}

main()
  .catch((err: unknown) => {
    console.error('[admin:create] error:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
