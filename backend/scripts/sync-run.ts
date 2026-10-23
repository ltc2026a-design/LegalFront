// Zona 6 — CLI de sincronizacion.
//   npm run sync -- --fuente <id>     sincroniza UNA fuente
//   npm run sync -- --fuente=<id>     (forma equivalente)
//   npm run sync -- --all             sincroniza todas las fuentes con conectorKey
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { ejecutarSincronizacion, sincronizarTodas } from '../src/sincronizacion/orquestador.js';

function parsearArgs(argv: string[]): { fuente?: string; all: boolean } {
  let fuente: string | undefined;
  let all = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') all = true;
    else if (a === '--fuente') fuente = argv[i + 1];
    else if (a.startsWith('--fuente=')) fuente = a.slice('--fuente='.length);
  }
  return { fuente, all };
}

function imprimir(res: {
  fuenteOficialId: string;
  estado: string;
  cambiosDetectados: number;
  error?: string;
}): void {
  const extra = res.error ? `  error="${res.error}"` : '';
  console.log(
    `[sync] fuente=${res.fuenteOficialId} estado=${res.estado} cambios=${res.cambiosDetectados}${extra}`,
  );
}

async function main(): Promise<void> {
  const { fuente, all } = parsearArgs(process.argv.slice(2));

  if (!fuente && !all) {
    console.error('Uso: npm run sync -- (--fuente <id> | --all)');
    process.exitCode = 2;
    return;
  }

  if (all) {
    const res = await sincronizarTodas();
    for (const r of res) imprimir(r);
    return;
  }

  const res = await ejecutarSincronizacion(fuente as string);
  imprimir(res);
  if (res.estado === 'fallida') process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[sync] error fatal:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
