// Fase móvil — Navegación con el pulgar: en pantallas chicas la barra de arriba solo
// deja la marca y el buscador, y el acceso real a las vistas vive abajo, a 44px de alto
// y por encima de la barra de gestos (pb-seguro). En sm+ se oculta: ahí ya alcanza con
// la AppBar de toda la vida.
//
// El indicador del tab activo es un patron que se desliza: cada tab mide su propio
// ancho con CSS (grid de N columnas), así que no hace falta JavaScript midiendo.
import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useFavoritos } from '../lib/favoritos';
import { useSesion } from '../hooks/sesion';
import { iniciales } from '../lib/formato';

interface Tab {
  a: string;
  etiqueta: string;
  icono: (activo: boolean) => ReactNode;
  /** true = termina en / (el NavLink necesita `end` para no quedar activo siempre). */
  exacto?: boolean;
  /** Marca para el tour de bienvenida (lib/tour.ts): sin esto, el paso sale centrado. */
  tour?: string;
}

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const TABS: Tab[] = [
  {
    a: '/',
    etiqueta: 'Inicio',
    exacto: true,
    icono: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...trazo}>
        <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    a: '/buscar',
    etiqueta: 'Buscar',
    icono: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...trazo}>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
      </svg>
    ),
  },
  {
    a: '/asistente',
    etiqueta: 'Asistente',
    icono: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...trazo}>
        <path d="M20 14a3 3 0 0 1-3 3h-5l-4 3v-3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
        <path d="M9.5 11h.01M12 11h.01M14.5 11h.01" strokeWidth={2.2} />
      </svg>
    ),
  },
  {
    a: '/favoritos',
    etiqueta: 'Favoritos',
    tour: 'favoritos',
    icono: (activo) => (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-5"
        {...trazo}
        fill={activo ? 'currentColor' : 'none'}
      >
        <path d="M12 3.6l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 10l6-.9z" />
      </svg>
    ),
  },
];

export default function BarraInferior() {
  const { data } = useFavoritos();
  const sesion = useSesion();
  const favoritos = data?.favoritos.length ?? 0;

  // Fase 4 — el ultimo tab es la puerta de la cuenta Y de la configuracion: sin sesion
  // se ve "Ajustes" (ahi se configura el telefono y se ofrece entrar), con sesion el
  // avatar con las iniciales de la persona.
  const tabs: Tab[] = [
    ...TABS,
    {
      a: '/perfil',
      etiqueta: sesion ? (sesion.usuario.nombre.split(' ')[0] || 'Perfil') : 'Ajustes',
      icono: () =>
        sesion ? (
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-sobre-primario"
          >
            {iniciales(sesion.usuario.nombre || sesion.usuario.email)}
          </span>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...trazo}>
            <path d="M4 7h9M18.5 7H20M4 17h4.5M13.5 17H20" />
            <circle cx="16" cy="7" r="2.3" />
            <circle cx="11" cy="17" r="2.3" />
          </svg>
        ),
    },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      data-tour="navegacion"
      className="pb-seguro fixed inset-x-0 bottom-0 z-20 border-t border-primary/15 bg-background/95 backdrop-blur sm:hidden"
    >
      <ul
        className="mx-auto grid max-w-lg px-2 py-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => (
          <li key={tab.a}>
            <NavLink
              to={tab.a}
              end={tab.exacto}
              data-tour={tab.tour}
              className={({ isActive }) =>
                'aprieta relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors duration-200 ' +
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
                (isActive ? 'text-primary-dark' : 'text-texto/55')
              }
            >
              {({ isActive }) => (
                <>
                  {/* Pastilla del tab activo: aparece con escala, no con display:none. */}
                  <span
                    aria-hidden="true"
                    className={
                      'absolute -top-0.5 h-9 w-12 rounded-full bg-acento/20 transition-all duration-300 ' +
                      (isActive ? 'scale-100 opacity-100' : 'scale-75 opacity-0')
                    }
                  />
                  <span className="relative">{tab.icono(isActive)}</span>
                  <span className="relative text-[11px] font-semibold leading-tight">
                    {tab.etiqueta}
                    {tab.a === '/favoritos' && favoritos > 0 && (
                      <span className="ml-1 rounded-full bg-acento/30 px-1.5 text-[10px] font-bold text-primary-dark">
                        {favoritos}
                      </span>
                    )}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
