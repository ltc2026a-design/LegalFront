// Zona 4 — Tarjeta de codigo de la biblioteca: enlaza a /codigo/:slug.
import { Link } from 'react-router-dom';
import Card from './Card';
import { etiquetaTipo, fmtFecha } from '../lib/formato';
import type { CodigoListaItem } from '../lib/types';

export interface CodigoCardProps {
  codigo: CodigoListaItem;
  /** Posición en la grilla, para el stagger de entrada. */
  retraso?: number;
}

export default function CodigoCard({ codigo, retraso }: CodigoCardProps) {
  const reforma = fmtFecha(codigo.fechaUltimaReforma);

  return (
    <Card className="h-full" retraso={retraso}>
      <Link
        to={`/codigo/${codigo.slug}`}
        className="aprieta flex h-full flex-col gap-2 rounded-xl p-5 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-lg font-semibold leading-snug text-texto">{codigo.nombre}</h3>
        </div>
        <p className="line-clamp-2 text-sm text-texto/70">{codigo.descripcion}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-texto/60">
          <span className="font-semibold text-primary">{etiquetaTipo(codigo.tipo)}</span>
          <span aria-hidden="true">·</span>
          <span>{codigo.totalArticulos} artículos</span>
          <span aria-hidden="true">·</span>
          <span title="Versión vigente">v{codigo.versionVigente}</span>
          {reforma && (
            <>
              <span aria-hidden="true">·</span>
              <span>ref. {reforma}</span>
            </>
          )}
        </div>
      </Link>
    </Card>
  );
}
