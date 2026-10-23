// Fase 3 — Zona de perfil: la cuenta y sus datos.
// Fase 4 — Aqui vive tambien la configuracion de la persona (lectura, libro, avisos,
// historial).
// Fase 6 — La pantalla de ajustes AHORA PIDE CUENTA: sin sesion el guard manda a
// /entrar (la puerta de "Ajustes" de la barra ya apunta aqui, asi que quien no tiene
// cuenta cae directo al login). Al cerrar sesion se regresa a /entrar por la misma
// logica. Leer los libros y el asistente siguen abiertos sin cuenta; lo que se
// protege aqui es la configuracion sincronizada de la persona.
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';
import Preferencias from '../components/Preferencias';
import Skeleton from '../components/Skeleton';
import { useSalir, useSesion, useYo } from '../hooks/sesion';
import { fmtFecha, iniciales } from '../lib/formato';
import { usePreferencias } from '../lib/preferencias';
import { abrirTour } from '../lib/tour';
import type { EstadoGuardado } from '../lib/preferencias';

const TEXTO_GUARDADO: Record<EstadoGuardado, string> = {
  local: 'Guardado solo en este teléfono.',
  guardando: 'Guardando en tu cuenta…',
  cuenta: 'Guardado en tu cuenta: te sigue a cualquier dispositivo.',
  error: 'No se pudo guardar en tu cuenta; se conserva en este teléfono.',
};

export default function Perfil() {
  const sesion = useSesion();
  const salir = useSalir();
  const yo = useYo();
  const { guardado } = usePreferencias();
  const navegar = useNavigate();

  // Guard: sin cuenta no hay ajustes que mostrar → se manda al login.
  if (!sesion) return <Navigate to="/entrar" replace />;

  const usuario = yo.data?.usuario;
  const desde = fmtFecha(usuario?.creadoEn ?? null);

  const cerrar = () => {
    salir();
    navegar('/entrar');
  };

  // El recorrido mide zonas del inicio, así que se abre desde ahí.
  const verTour = () => {
    abrirTour();
    navegar('/');
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 font-sans sm:px-6">
      <nav aria-label="Ruta de navegación">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:text-primary-dark sm:min-h-0"
        >
          ← Biblioteca
        </Link>
      </nav>

      <Card className="flex items-center gap-4 p-5">
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-primary font-serif text-lg font-bold text-sobre-primario"
        >
          {iniciales(usuario?.nombre || usuario?.email || sesion.usuario.nombre)}
        </span>
        <div className="min-w-0 space-y-1">
          {yo.isPending ? (
            <>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </>
          ) : (
            <>
              <h1 className="truncate font-serif text-2xl font-bold text-texto">
                {usuario?.nombre || sesion.usuario.nombre || 'Mi perfil'}
              </h1>
              <p className="truncate text-sm text-texto/60">
                {usuario?.email || sesion.usuario.email}
              </p>
              <p className="text-xs text-texto/45">
                {desde ? `Cuenta activa desde ${desde}` : 'Cuenta de la app de consulta'}
              </p>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/favoritos"
          className="aprieta min-h-11 rounded-xl border border-primary/20 bg-tarjeta px-4 py-3 text-sm font-semibold text-primary-dark hover:bg-primary/5 sm:min-h-0"
        >
          <span className="block text-xs font-medium text-texto/50">Guardados</span>
          {yo.data
            ? `${yo.data.favoritos} ${yo.data.favoritos === 1 ? 'artículo' : 'artículos'}`
            : 'Mis favoritos'}
        </Link>
        <Link
          to="/asistente"
          className="aprieta min-h-11 rounded-xl border border-primary/20 bg-tarjeta px-4 py-3 text-sm font-semibold text-primary-dark hover:bg-primary/5 sm:min-h-0"
        >
          <span className="block text-xs font-medium text-texto/50">Preguntas</span>
          Preguntar al asistente
        </Link>
        {/* Fase 7 — el recorrido sale solo en un dispositivo nuevo; este es el mismo tour
            para quien quiera verlo otra vez (o enseñárselo a alguien más). */}
        <button
          type="button"
          onClick={verTour}
          className="aprieta min-h-11 rounded-xl border border-primary/20 bg-tarjeta px-4 py-3 text-left text-sm font-semibold text-primary-dark hover:bg-primary/5 sm:col-span-2 sm:min-h-0"
        >
          <span className="block text-xs font-medium text-texto/50">Ayuda</span>
          Ver el tutorial otra vez
        </button>
      </div>

      {yo.isError && (
        <p className="rounded-lg bg-derogado/10 px-3 py-2 text-sm text-derogado">
          No se pudieron leer los datos de la cuenta ahora mismo. Si el problema sigue, sal y vuelve
          a entrar.
        </p>
      )}

      <section aria-label="Configuración" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl font-bold text-texto">Mi configuración</h2>
          <span className="text-xs font-medium text-texto/55">{TEXTO_GUARDADO[guardado]}</span>
        </div>

        <Preferencias />
      </section>

      <Card className="space-y-3 p-5">
        <h2 className="font-serif text-lg font-bold text-texto">Salir de la cuenta</h2>
        <p className="text-sm leading-relaxed text-texto/60">
          Al salir, la app vuelve a usar los favoritos guardados en este teléfono y la
          configuración queda solo aquí. Puedes volver a entrar cuando quieras con el mismo correo y
          contraseña.
        </p>
        <Button
          variante="secondary"
          onClick={cerrar}
          className="min-h-11 w-full sm:min-h-0 sm:w-auto"
        >
          Cerrar sesión
        </Button>
      </Card>
    </main>
  );
}
