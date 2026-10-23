// Zona 1 — Tarjeta de articulo: puramente presentacional (sin logica ni fetch).
// Muestra numero, extracto del texto (serif), badge de vigencia, borde/badge de
// "apartado clave" con acento calido y boton de favorito con micro-interaccion "pop".
import { useState } from 'react';
import Card from './Card';
import Badge from './Badge';
import type { BadgeEstado } from './Badge';

export interface ArticuloCardProps {
  /** Numero del articulo, p. ej. "Articulo 14". */
  numero: string;
  /** Extracto del texto legal (se renderiza en serif). */
  texto: string;
  /** Resaltado de apartado clave: borde izquierdo + insignia en acento calido. */
  esApartadoClave?: boolean;
  /** Estado de vigencia; si se omite no se muestra insignia. */
  estado?: BadgeEstado;
  /** Nota: la estrella es controlada por quien usa el componente. */
  favorito?: boolean;
  /** Callback al pulsar la estrella; recibe el nuevo valor. */
  onToggleFavorito?: (favorito: boolean) => void;
  className?: string;
}

function IconoEstrella({ lleno }: { lleno: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill={lleno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
    >
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.3l-5.8 3.1 1.1-6.4-4.7-4.6 6.5-.9L12 2.6z" />
    </svg>
  );
}

export default function ArticuloCard({
  numero,
  texto,
  esApartadoClave = false,
  estado,
  favorito = false,
  onToggleFavorito,
  className = '',
}: ArticuloCardProps) {
  // La animacion "pop" se re-dispara en cada toque: la clase se quita al terminar.
  const [pop, setPop] = useState(false);

  const manejarClic = () => {
    setPop(true);
    onToggleFavorito?.(!favorito);
  };

  return (
    <Card
      className={`flex flex-col gap-3 p-5 ${esApartadoClave ? 'border-l-4 border-l-acento' : ''} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-lg font-semibold text-texto">{numero}</h3>
          {estado && <Badge estado={estado} />}
          {esApartadoClave && (
            <span className="inline-flex items-center rounded-full bg-acento/20 px-2.5 py-0.5 font-sans text-xs font-semibold text-primary-dark ring-1 ring-acento/50 ring-inset">
              Apartado clave
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={manejarClic}
          onAnimationEnd={() => setPop(false)}
          aria-pressed={favorito}
          aria-label={favorito ? `Quitar ${numero} de favoritos` : `Agregar ${numero} a favoritos`}
          className={
            'shrink-0 cursor-pointer rounded-full p-1.5 transition-colors duration-200 ' +
            (favorito
              ? 'text-acento hover:text-primary-dark'
              : 'text-primary/40 hover:text-primary') +
            (pop ? ' animate-pop-estrella' : '')
          }
        >
          <IconoEstrella lleno={favorito} />
        </button>
      </div>

      <p className="font-serif text-[15px] leading-relaxed text-texto/90">{texto}</p>
    </Card>
  );
}
