// Zona 1 — Insignia de vigencia: Verde (vigente) / Ambar (derogado, en revision).
import type { ReactNode } from 'react';

export type BadgeEstado = 'Vigente' | 'Derogado' | 'En revisión';

export interface BadgeProps {
  estado: BadgeEstado;
  className?: string;
  children?: ReactNode;
}

const tonos: Record<BadgeEstado, string> = {
  Vigente: 'bg-vigente/10 text-vigente ring-vigente/25',
  Derogado: 'bg-derogado/10 text-derogado ring-derogado/25',
  'En revisión': 'bg-revision/10 text-revision ring-revision/25',
};

const puntos: Record<BadgeEstado, string> = {
  Vigente: 'bg-vigente',
  Derogado: 'bg-derogado',
  'En revisión': 'bg-revision',
};

export default function Badge({ estado, className = '', children }: BadgeProps) {
  return (
    <span
      className={
        `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-xs ` +
        `font-semibold ring-1 ring-inset ${tonos[estado]} ${className}`
      }
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${puntos[estado]}`} />
      {children ?? estado}
    </span>
  );
}
