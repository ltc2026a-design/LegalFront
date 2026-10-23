// Zona 7 — barra superior del admin: marca, identidad del administrador y salida.
// Zona 8 — navegacion a las pantallas de gestion (codigos, fuentes).
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { rolLabel } from '../lib/formato';
import Button from './Button';

const ENLACES = [
  { to: '/', etiqueta: 'Pendientes' },
  { to: '/codigos', etiqueta: 'Códigos' },
  { to: '/fuentes', etiqueta: 'Fuentes' },
  { to: '/notificaciones', etiqueta: 'Notificaciones' },
];

export default function AppBar() {
  const { admin, cerrarSesion } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-primary/15 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-baseline gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="font-serif text-xl font-bold text-primary-dark">Consulta Legal</span>
            <span className="text-xs font-medium text-primary/70">Panel · Zona 8</span>
          </Link>
          <nav aria-label="Secciones del panel" className="flex items-center gap-1">
            {ENLACES.map((e) => (
              <NavLink
                key={e.to}
                to={e.to}
                end={e.to === '/'}
                className={({ isActive }) =>
                  'rounded-lg px-2.5 py-1 font-sans text-sm font-semibold transition ' +
                  (isActive
                    ? 'bg-primary/15 text-primary-dark'
                    : 'text-primary hover:bg-primary/10')
                }
              >
                {e.etiqueta}
              </NavLink>
            ))}
          </nav>
        </div>

        {admin && (
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="font-sans text-sm font-semibold text-texto">{admin.nombre}</p>
              <p className="font-sans text-xs text-texto/50">{rolLabel(admin.rol)}</p>
            </div>
            <Button variante="ghost" onClick={cerrarSesion} aria-label="Cerrar sesión">
              Salir
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
