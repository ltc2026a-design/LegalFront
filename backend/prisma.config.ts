// Configuracion de Prisma 7 para el backend (Zona 2).
// La URL de la base se toma del entorno (.env via dotenv); en Render llega por
// las variables del servicio.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` y `tsc` no necesitan conectar a nada: si DATABASE_URL aun no
// existe (build en CI, primer despliegue) se usa un placeholder y el comando igual
// corre. Las rutas que si hablan con la base (migrate, db seed) siguen requiriendo
// la variable real y fallan de forma explicita.
const url = (process.env.DATABASE_URL ?? '').trim() || 'postgresql://localhost:5432/legal';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url,
  },
});
