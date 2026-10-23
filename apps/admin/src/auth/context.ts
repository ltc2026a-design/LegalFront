// Zona 7 — objeto de contexto + tipos + hook de lectura. Separado del Provider
// (AuthContext.tsx) para que ese modulo exporte SOLO un componente (react-refresh).
import { createContext, useContext } from 'react';
import type { AdminContexto } from '../lib/types';

export type EstadoAuth = 'cargando' | 'autenticado' | 'anonimo';

export interface AuthValor {
  estado: EstadoAuth;
  admin: AdminContexto | null;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => void;
}

export const AuthContext = createContext<AuthValor | null>(null);

export function useAuth(): AuthValor {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
