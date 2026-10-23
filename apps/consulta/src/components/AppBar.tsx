// Zona 4 — Barra superior: marca que enlaza al inicio.
// Zona 5 — Anade el acceso "Mis favoritos".
// Fase móvil — Al hacer scroll la barra se encoge (mas aire para leer), el acceso a
// favoritos se oculta en pantallas chicas porque ya esta en la barra de abajo, y el
// padding superior respeta el notch con viewport-fit=cover.
// Fase 3 — El boton de la derecha es la puerta de la cuenta: /entrar si no hay sesion,
// /perfil si la hay (con las iniciales de la persona).
// Fase 5 — Se quita el buscador compacto de la barra en TODAS las paginas: cada una ya
// trae su buscador grande (portada, codigo, busqueda), asi que arriba sobraba y hacia
// redundancia con la marca.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavoritos } from '../lib/favoritos';
import { iniciales } from '../lib/formato';
import { useSesion } from '../hooks/sesion';

export default function AppBar() {
  const { data } = useFavoritos();
  const sesion = useSesion();
  const total = data?.favoritos.length ?? 0;
  const [encogida, setEncogida] = useState(false);

  useEffect(() => {
    let ultima = 0;
    const onScroll = () => {
      const y = window.scrollY;
      // Con umbral doble no baila cuando el scroll ronda el limite.
      if (y === ultima || (y > 32) === (ultima > 32)) return;
      ultima = y;
      setEncogida(y > 32);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      data-tour="navegacion"
      className={
        'pt-notch sticky top-0 z-10 border-b border-primary/15 bg-background/90 backdrop-blur ' +
        'transition-shadow duration-200 ' +
        (encogida ? 'shadow-[0_1px_10px_-4px_rgba(92,64,51,0.35)]' : 'shadow-none')
      }
    >
      <div
        className={
          'mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 ' +
          'transition-[padding] duration-200 sm:px-6 ' +
          (encogida ? 'py-2' : 'py-3')
        }
      >
        <Link
          to="/"
          className="flex min-h-11 items-baseline gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0"
          aria-label="Sistema de Consulta Legal — ir al inicio"
        >
          <span className="font-serif text-xl font-bold text-primary-dark">Consulta Legal</span>
          <span
            className={
              'hidden overflow-hidden whitespace-nowrap text-xs font-medium text-texto/50 transition-all duration-200 ' +
              'sm:inline-block ' +
              (encogida ? 'max-w-0 opacity-0' : 'max-w-[14rem] opacity-100')
            }
          >
            México · Quintana Roo
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/favoritos"
            data-tour="favoritos"
            aria-label={
              total > 0 ? `Mis favoritos (${total} guardados)` : 'Mis favoritos (sin guardados)'
            }
            className={
              'aprieta hidden shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-sm ' +
              'font-semibold text-primary hover:bg-primary/10 hover:text-primary-dark ' +
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
              'sm:flex'
            }
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-4"
              fill={total > 0 ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinejoin="round"
            >
              <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.3l-5.8 3.1 1.1-6.4-4.7-4.6 6.5-.9L12 2.6z" />
            </svg>
            <span className="hidden sm:inline">Mis favoritos</span>
            {total > 0 && (
              <span className="rounded-full bg-acento/25 px-1.5 py-0.5 text-[11px] font-bold text-primary-dark">
                {total}
              </span>
            )}
          </Link>

          {/* Fase 4 — puerta unica: perfil con cuenta, configuracion sin ella. */}
          <Link
            to="/perfil"
            aria-label={sesion ? 'Mi perfil y configuración' : 'Configuración y acceso a mi cuenta'}
            className={
              'aprieta flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 font-sans text-sm ' +
              'font-semibold text-primary hover:bg-primary/10 hover:text-primary-dark sm:min-h-0 ' +
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
            }
          >
            {sesion ? (
              <span
                aria-hidden="true"
                className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-sobre-primario"
              >
                {iniciales(sesion.usuario.nombre || sesion.usuario.email)}
              </span>
            ) : (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7h9M18.5 7H20M4 17h4.5M13.5 17H20" />
                <circle cx="16" cy="7" r="2.3" />
                <circle cx="11" cy="17" r="2.3" />
              </svg>
            )}
            <span className="hidden max-w-[9rem] truncate sm:inline">
              {sesion ? (sesion.usuario.nombre || 'Mi perfil') : 'Ajustes'}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
