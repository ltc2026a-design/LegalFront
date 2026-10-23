// Zona 6 — REGISTRO de conectores.
//
// FuenteOficial.conectorKey (string estable) selecciona la clase de conector.
// El orquestador llama a obtenerConector(fuente) y no conoce las implementaciones.
import { ConectorDiputadosFederal } from './conector-diputados.js';
import { ConectorFixture } from './conector-fixture.js';
import { ConectorManualImport } from './conector-manual.js';
import type { ConectorFuente } from './tipos.js';

/** Lo minimo que necesita el registro de una fuente. */
export interface FuenteRegistrable {
  conectorKey: string | null;
  urlOrigen: string;
}

export const CONECTOR_KEYS = ['diputados_federal', 'fixture', 'manual_import'] as const;
export type ConectorKey = (typeof CONECTOR_KEYS)[number];

/** Clave del documento federal (ultima segmento del /pdf/CLAVE.pdf) para el slug informativo. */
function claveFederal(urlOrigen: string): string {
  const seg = urlOrigen.split('/').pop() ?? '';
  return seg.replace(/\.[a-z]+$/i, '').toUpperCase();
}

export function obtenerConector(fuente: FuenteRegistrable): ConectorFuente {
  switch (fuente.conectorKey) {
    case 'diputados_federal': {
      const clave = claveFederal(fuente.urlOrigen);
      return new ConectorDiputadosFederal(fuente.urlOrigen, {
        slug: clave.toLowerCase(),
        nombre: `Documento federal ${clave}`,
        jurisdiccion: 'federal',
      });
    }
    case 'fixture':
      return new ConectorFixture(fuente.urlOrigen);
    case 'manual_import':
      return new ConectorManualImport(fuente.urlOrigen);
    case null:
      throw new Error('La fuente no tiene conectorKey asignada (no es sincronizable).');
    default:
      throw new Error(`conectorKey desconocida: "${fuente.conectorKey}"`);
  }
}
