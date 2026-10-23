// Zona 1 — Skeleton: placeholder con tonos cafe sobre superficie crema.
// Nunca gris generico. Antes pulsaba la opacidad entera; en movil eso parpadea y se
// siente lento, asi que ahora es un barrido de luz (`--animate-brillo`) sobre la forma.

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
        `relative overflow-hidden rounded-md bg-skeleton ring-1 ring-inset ring-skeleton-alto/60 ` +
        className
      }
    >
      <span
        aria-hidden="true"
        className="animate-brillo absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-skeleton-alto/70 to-transparent"
      />
    </div>
  );
}
