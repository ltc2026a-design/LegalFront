// Zona 7 — guard de rutas protegidas: sin sesion, redirige a /login; mientras
// se valida el token muestra un placeholder.
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './context';
import Skeleton from '../components/Skeleton';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { estado } = useAuth();
  const location = useLocation();

  if (estado === 'cargando') {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-10">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (estado === 'anonimo') {
    return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  }
  return <>{children}</>;
}
