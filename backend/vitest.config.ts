// Zona 11 — Config de Vitest para la suite del backend.
//
// Decisiones de entorno (8 GB de RAM + Postgres embebida):
//   - `pool: forks` + `singleFork`: UN solo proceso de trabajo, todo en serie.
//   - `fileParallelism: false`: los archivos de test NO corren en paralelo (una
//     sola base de datos compartida `legal_test`).
//   - `globalSetup`: prepara la base `legal_test` (create + migrate + seed).
//   - `setupFiles`: fija el entorno del worker (DATABASE_URL, NODE_ENV, limites)
//     ANTES de que los modulos importados lean process.env.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    globalSetup: ['./src/__tests__/global-setup.ts'],
    setupFiles: ['./src/__tests__/setup-env.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    // Serial y con margen: sincronizaciones reales sobre fixtures + DB embebida.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
