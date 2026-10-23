// Comprobacion de que la base embebida acepta conexiones (usado al verificar la Zona 0).
// Uso: npm run db:check  (con `npm run db` corriendo en otra terminal)
import 'dotenv/config';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5544/legal';

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  const { rows } = await client.query('SELECT 1 AS ok, version() AS version');
  console.log('[db:check] conexion OK:', JSON.stringify(rows[0]));
} catch (error) {
  console.error('[db:check] fallo la conexion:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
