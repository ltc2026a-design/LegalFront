// Zona 7 — badge de tipo de cambio. Colores de la paleta blanco/cafe:
//   nuevo      -> acento calido,   modificado -> ambar,   derogado -> tono derogado.
import { tipoLabel } from '../lib/formato';
import type { TipoCambio } from '../lib/types';

const CLASES: Record<TipoCambio, string> = {
  nuevo: 'bg-acento/20 text-primary-dark ring-acento/50',
  modificado: 'bg-revision/10 text-revision ring-revision/25',
  derogado: 'bg-derogado/10 text-derogado ring-derogado/30',
};

const PUNTO: Record<TipoCambio, string> = {
  nuevo: 'bg-acento',
  modificado: 'bg-revision',
  derogado: 'bg-derogado',
};

export default function CambioBadge({ tipo }: { tipo: TipoCambio }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-xs ' +
        `font-semibold ring-1 ring-inset ${CLASES[tipo]}`
      }
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${PUNTO[tipo]}`} />
      {tipoLabel(tipo)}
    </span>
  );
}
