// Zona 3: cliente Prisma compartido por la API publica de consulta (SOLO LECTURA).
// Mismo patron que el seed: Prisma 7 + adaptador pg, con la URL desde el entorno.
//
// Postgres administrado (Neon, Supabase, Railway...): la URL lleva el modo SSL.
// Con Supabase tiene que ser `sslmode=no-verify`, no `require`: este driver `pg`
// trata `require` como `verify-full` y la cadena de certificados del pooler no es
// verificable en publico. En un VPS con Postgres en la misma maquina la URL va sin
// ese parametro y cifrar seria un gasto inutil.
//
// El cliente se construye HASTA LA PRIMERA CONSULTA (ver el Proxy abajo). En una
// funcion de Vercel el modulo se importa al arrancar la funcion, antes de cualquier
// peticion: si alli faltara DATABASE_URL el arranque moriria y desde fuera solo se
// veria `FUNCTION_INVOCATION_FAILED`, sin poder distinguir "falta una variable" de
// "el despliegue esta roto". Con el arranque tolerante, `/api/health` responde y el
// error claro aparece en la ruta que de verdad necesita la base.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { PrismaClient as PrismaClientTipo } from '../generated/prisma/client.js';

function crearCliente(): PrismaClientTipo {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta DATABASE_URL en el entorno (backend/.env).');
  }

  // Tope de conexiones: en el servidor gratuito (1 GB de RAM) cada conexion viva
  // a Postgres cuesta unos 10 MB, y entre la API y el worker no pueden abrirlos
  // todos. Con 10 por proceso sobra para el trafico de una biblioteca legal.
  const limite = Number(process.env.PG_POOL_MAX ?? 10);

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: limite,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }),
  });
}

let instancia: PrismaClientTipo | undefined;

function cliente(): PrismaClientTipo {
  instancia ??= crearCliente();
  return instancia;
}

export const prisma: PrismaClientTipo = new Proxy({} as PrismaClientTipo, {
  get(_destino, propiedad) {
    const real = cliente();
    const valor = Reflect.get(real, propiedad, real);
    // Los metodos de Prisma pierden el `this` si se devuelten sueltos.
    return typeof valor === 'function' ? valor.bind(real) : valor;
  },
  set(_destino, propiedad, valor) {
    return Reflect.set(cliente(), propiedad, valor);
  },
});
