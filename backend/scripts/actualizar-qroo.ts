// Pone al dia los LIBROS DE QUINTANA ROO desde el PDF consolidado del Congreso.
//
// Lee el manifesto prisma/data/qroo/fuentes.json, descarga cada PDF vigente (por
// la captura de web.archive.org registrada, porque los host *.gob.mx no siempre
// son alcanzables desde esta maquina), lo convierte con `pdftotext -enc UTF-8`
// y carga los articulos con el mismo analizador de `npm run importar:poe`.
//
// Uso:
//   npm run sync:qroo                -> recarga solo los PDF que cambiaron
//   npm run sync:qroo -- --forzar    -> baja los 6 PDF aunque ya existan
//   npm run sync:qroo -- --seco      -> analiza y reporta, no escribe nada
//   npm run sync:qroo -- --solo=codigo-civil-qroo
//
// Si el Congreso publica una reforma, basta con actualizar en fuentes.json la
// pareja urlOficial/captura del libro y volver a ejecutar este comando.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarLibro } from './lib/cargar-libro.js';
import { parsearTextoPdf } from './importar-poe.js';

type Libro = {
  slug: string;
  archivo: string;
  nombre: string;
  urlOficial: string;
  captura: string;
  poeFecha: string;
};

const DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'prisma', 'data', 'qroo');

async function descargar(url: string, destino: string): Promise<void> {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length < 50_000 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error(`respuesta de ${bytes.length} bytes que no es un PDF`);
  }
  writeFileSync(destino, bytes);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const seco = args.includes('--seco');
  const forzar = args.includes('--forzar');
  const solo = args.find((a) => a.startsWith('--solo='))?.slice(7);
  const manifiesto: { libros: Libro[] } = JSON.parse(readFileSync(join(DIR, 'fuentes.json'), 'utf8'));

  for (const libro of manifiesto.libros) {
    if (solo && solo !== libro.slug) continue;
    const pdf = join(DIR, libro.archivo);
    const txt = pdf.replace(/\.pdf$/i, '.txt');

    if (forzar || !existsSync(pdf)) {
      const url = `https://web.archive.org/web/${libro.captura}id_/${libro.urlOficial}`;
      try {
        process.stdout.write(`[sync:qroo] ${libro.slug}: descargando… `);
        await descargar(encodeURI(url), pdf);
        console.log('ok');
      } catch (e) {
        console.log(`falló (${e instanceof Error ? e.message : e}); se usa el PDF local`);
      }
    }

    if (!existsSync(pdf)) {
      console.log(`[sync:qroo] ${libro.slug}: SIN PDF local, omite`);
      continue;
    }
    // Re-extraer solo cuando el PDF es mas nuevo que el texto.
    if (!existsSync(txt) || statSync(txt).mtimeMs < statSync(pdf).mtimeMs) {
      execFileSync('pdftotext', ['-enc', 'UTF-8', pdf, txt], { stdio: 'inherit' });
    }

    const { meta, articulos } = parsearTextoPdf(readFileSync(txt, 'utf8'));
    const nuevos = articulos.filter((a) => (a.fechaReforma ? a.fechaReforma.toISOString().slice(0, 10) > libro.poeFecha : false));
    console.log(`[sync:qroo] ${libro.slug}: ${articulos.length} articulos | POE ${meta.ultimaReforma || libro.poeFecha}${nuevos.length ? ` | ${nuevos.length} con fecha posterior al manifesto` : ''}`);

    if (seco) continue;
    await cargarLibro(
      libro.slug,
      {
        sigla: 'POE QR',
        etiqueta: 'POE',
        ultimaReforma: meta.ultimaReforma || libro.poeFecha,
        procedencia: [
          `Texto oficial integro del PDF consolidado del Congreso de Quintana Roo: ${libro.urlOficial}`,
          `Descargado de la captura ${libro.captura} de web.archive.org y convertido con pdftotext -enc UTF-8`,
          'Se excluyo el apendice de transitorios de decretos de reforma y el historial de decretos: no es texto normativo vigente',
        ],
      },
      articulos,
      { reescribir: true },
    );
  }
}

main().catch((e) => {
  console.error('[sync:qroo] fallo:', e);
  process.exit(1);
});
