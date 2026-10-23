// Zona 1 — Botón del sistema de diseño (3 variantes, transiciones suaves 200 ms).
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariante = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariante;
  className?: string;
}

const clasesBase =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 ' +
  'font-sans text-sm font-semibold transition duration-200 ease-out select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';

const variantes: Record<ButtonVariante, string> = {
  primary: 'bg-primary text-sobre-primario hover:bg-primary-dark active:bg-primary-dark',
  secondary:
    'border border-primary/40 bg-tarjeta text-primary hover:bg-primary/10 active:bg-primary/20',
  ghost: 'text-primary hover:bg-primary/10 active:bg-primary/20',
};

export default function Button({
  variante = 'primary',
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${clasesBase} ${variantes[variante]} ${className}`} {...props}>
      {children}
    </button>
  );
}
