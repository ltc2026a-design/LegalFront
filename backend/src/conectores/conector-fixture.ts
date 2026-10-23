// Zona 6 — conector de FIXTURE (OFFLINE).
//
// Lee un HTML local escrito con el MISMO formato que el /ref/ de Diputados y lo
// pasa por el MISMO parser que usa el conector federal. Existe para:
//   - verificar todo el pipeline (connector -> diff -> historial pendiente) sin
//     red (desde este host los .gob.mx son inalcanzables),
//   - servir de demo/reproductor de cambios (codigo-demo.html vs codigo-demo-v2.html).
//
// La ruta del HTML se toma de fuente.urlOrigen. Si no es absoluta se resuelve
// respecto de la carpeta fixtures/ de este modulo.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CodigoNormalizado,
  type ConectorFuente,
  type JurisdiccionLite,
  type ResultadoNormalizado,
  type TipoCodigoLite,
} from './tipos.js';
import { parsearResultado } from './parser-html.js';

const CARPETA_FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export interface OpcionesFixture {
  slug?: string;
  nombre?: string;
  tipo?: TipoCodigoLite;
  jurisdiccion?: JurisdiccionLite;
  versionVigente?: string;
}

export class ConectorFixture implements ConectorFuente {
  constructor(
    private readonly rutaOrigen: string,
    private readonly opts: OpcionesFixture = {},
  ) {}

  private resolverRuta(): string {
    return path.isAbsolute(this.rutaOrigen) ? this.rutaOrigen : path.join(CARPETA_FIXTURES, this.rutaOrigen);
  }

  async obtener(): Promise<ResultadoNormalizado> {
    const archivo = this.resolverRuta();
    const html = await readFile(archivo, 'utf8');
    const nombreBase = path.basename(archivo).replace(/\.html?$/i, '');
    const codigo: CodigoNormalizado = {
      slug: this.opts.slug ?? nombreBase,
      nombre: this.opts.nombre ?? nombreBase,
      tipo: this.opts.tipo ?? 'otro',
      jurisdiccion: this.opts.jurisdiccion ?? 'federal',
      versionVigente: this.opts.versionVigente,
    };
    const resultado = parsearResultado(html, codigo);
    if (resultado.articulos.length === 0) {
      throw new Error(`El fixture ${archivo} no produjo articulos.`);
    }
    return resultado;
  }
}
