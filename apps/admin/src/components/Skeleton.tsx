// Zona 1 — Skeleton: placeholder con tonos cafe sobre superficie crema.
// Nunca gris generico; pulsa con la animacion --animate-pulse-cafe.

export interface SkeletonProps {
  /** Clases de Tailwind para alto/ancho, p. ej. "h-4 w-3/4". */
  className?: string;
}

export default function Skeleton({ className = 'h-4 w-full' }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando contenido"
      className={
        `animate-pulse-cafe rounded-md bg-skeleton ring-1 ring-inset ring-skeleton-alto/60 ` +
        className
      }
    />
  );
}
