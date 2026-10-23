// Zona 4 — Nodo del arbol jerarquico (libro/titulo/capitulo/...) expandible/colapsable.
// Animacion de altura 200-300 ms con la tecnica CSS grid (0fr -> 1fr); el media query
// prefers-reduced-motion de index.css la desactiva. La sangria sale del nesting de <ul>
// (cada nivel anade margen + borde izquierdo), no de calculos por nivel.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { etiquetaSeccion } from '../lib/formato';
import type { SeccionNodo } from '../lib/types';

export interface NodoArbolProps {
  nodo: SeccionNodo;
  slug: string;
  /** Se usa solo para generar un id estable en nodos virtuales (id null). */
  nivel: number;
}

export default function NodoArbol({ nodo, slug, nivel }: NodoArbolProps) {
  const [abierto, setAbierto] = useState(false);
  const contenidoId = `nodo-${nodo.id ?? `virt-${slug}-${nivel}-${nodo.nombre}`}`;

  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={contenidoId}
        className={
          'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left sm:min-h-0 ' +
          'transition-colors duration-200 hover:bg-primary/10 focus-visible:outline-2 ' +
          'focus-visible:outline-offset-1 focus-visible:outline-primary'
        }
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={
            'size-4 shrink-0 text-primary transition-transform duration-200 ' +
            (abierto ? 'rotate-90' : 'rotate-0')
          }
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="font-sans text-sm font-semibold text-texto">
          {etiquetaSeccion(nodo.tipo, nodo.numero, nodo.nombre)}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-surface px-2 py-0.5 font-sans text-xs font-medium text-texto/60 ring-1 ring-inset ring-primary/15">
          {nodo.totalArticulos}
        </span>
      </button>

      {/* Contenedor animado: grid-rows 0fr <-> 1fr (no se desmonta, por eso anima en ambos sentidos). */}
      <div
        id={contenidoId}
        style={{
          display: 'grid',
          gridTemplateRows: abierto ? '1fr' : '0fr',
          transition: 'grid-template-rows 260ms ease',
        }}
      >
        <div className="overflow-hidden">
          <ul className="ml-3 space-y-0.5 border-l border-primary/15 pl-2">
            {nodo.articulos.map((art) => (
              <li key={art.id}>
                <Link
                  to={`/codigo/${slug}/articulo/${encodeURIComponent(art.numero)}`}
                  className={
                    'flex min-h-11 items-baseline gap-2 rounded-lg px-2 py-1.5 transition-colors ' +
                    'duration-200 hover:bg-acento/15 focus-visible:outline-2 sm:min-h-0 ' +
                    'focus-visible:outline-offset-1 focus-visible:outline-primary'
                  }
                >
                  <span className="shrink-0 font-sans text-sm font-semibold text-primary-dark">
                    {art.numero}
                  </span>
                  <span className="line-clamp-1 font-serif text-[13px] text-texto/55">
                    {art.extracto}
                  </span>
                </Link>
              </li>
            ))}
            {nodo.hijos.map((hijo) => (
              <NodoArbol key={hijo.id ?? `${hijo.nombre}-${nivel}`} nodo={hijo} slug={slug} nivel={nivel + 1} />
            ))}
            {nodo.articulos.length === 0 && nodo.hijos.length === 0 && (
              <li className="px-2 py-1 text-xs italic text-texto/40">Sin artículos en este nivel</li>
            )}
          </ul>
        </div>
      </div>
    </li>
  );
}
