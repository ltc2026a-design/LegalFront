// Zona 1 — Tarjeta base con entrada animada (fade + slide-up ~250 ms).
// El media query prefers-reduced-motion de index.css desactiva la animacion.
import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Desactiva la animacion de entrada (util para listas grandes). */
  sinAnimacion?: boolean;
}

export default function Card({
  sinAnimacion = false,
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={
        'rounded-xl border border-primary/15 bg-white shadow-sm transition-shadow ' +
        'duration-200 hover:shadow-md' +
        (sinAnimacion ? '' : ' animate-entrada') +
        (className ? ` ${className}` : '')
      }
      {...props}
    >
      {children}
    </div>
  );
}
