// Zona 1 — Tarjeta de articulo: puramente presentacional (sin logica ni fetch).
// Muestra numero, extracto del texto (serif), badge de vigencia, borde/badge de
// "apartado clave" con acento calido y boton de favorito con micro-interaccion "pop".
// Zona 5 — `enlace` opcional: pinta el numero y un "Ver articulo" navegables
// (lo usa la pantalla Mis favoritos) sin cambiar el aspecto en /design-preview.
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  /** Ruta interna del articulo: si se indica, el numero y "Ver articulo" navegables. */
  enlace?: string;
  /** Linea de contexto sobre el numero (p. ej. el nombre del codigo). */
  contexto?: string;
  /** Posicion en la lista, para el stagger de entrada. */
  retraso?: number;
  /** Fase 6 — oculta el texto (lo sustituye el panel de resumen). */
  ocultarTexto?: boolean;
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
  enlace,
  contexto,
  retraso,
  ocultarTexto = false,
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
      retraso={retraso}
      className={`flex flex-col gap-3 ${ocultarTexto ? 'gap-0 p-4' : 'p-5'} ${esApartadoClave ? 'border-l-4 border-l-acento' : ''} ${className}`}
    >
      {contexto && <p className="text-xs text-texto/50">{contexto}</p>}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-lg font-semibold text-texto">
            {enlace ? (
              <Link
                to={enlace}
                className="inline-flex min-h-11 items-center rounded-lg underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0"
              >
                {numero}
              </Link>
            ) : (
              numero
            )}
          </h3>
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
            'toque -mt-1 -mr-1 flex shrink-0 cursor-pointer items-center justify-center rounded-full p-1.5 transition-colors duration-200 ' +
            (favorito
              ? 'text-acento hover:text-primary-dark'
              : 'text-primary/40 hover:text-primary') +
            (pop ? ' animate-pop-estrella' : '')
          }
        >
          <IconoEstrella lleno={favorito} />
        </button>
      </div>

      {!ocultarTexto && (
        <p className="texto-legal font-serif text-texto/90">{texto}</p>
      )}

      {enlace && (
        <Link
          to={enlace}
          className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-primary hover:text-primary-dark sm:min-h-0"
        >
          Ver artículo completo →
        </Link>
      )}
    </Card>
  );
}
