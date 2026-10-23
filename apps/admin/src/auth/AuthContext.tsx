// Zona 7 — Provider de autenticacion del admin (login por JWT, sin autorregistro).
// Al montar, si hay token guardado se valida contra /auth/me; un 401 (evento
// 'admin:unauthorized' desde lib/api) cierra la sesion. El hook useAuth vive en
// ./context.ts para que este modulo exporte unicamente el componente.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getToken, login as apiLogin, me, setToken } from '../lib/api';
import type { AdminContexto } from '../lib/types';
import { AuthContext, type AuthValor, type EstadoAuth } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoAuth>('cargando');
  const [admin, setAdmin] = useState<AdminContexto | null>(null);

  const cerrarSesion = useCallback(() => {
    setToken(null);
    setAdmin(null);
    setEstado('anonimo');
  }, []);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setToken(res.token);
    setAdmin({ id: res.admin.id, nombre: res.admin.nombre, rol: res.admin.rol });
    setEstado('autenticado');
  }, []);

  useEffect(() => {
    let vivo = true;
    async function validar() {
      if (!getToken()) {
        if (vivo) setEstado('anonimo');
        return;
      }
      try {
        const res = await me();
        if (vivo) {
          setAdmin(res.admin);
          setEstado('autenticado');
        }
      } catch {
        if (vivo) {
          setToken(null);
          setEstado('anonimo');
        }
      }
    }
    void validar();

    const alExpinar = () => cerrarSesion();
    window.addEventListener('admin:unauthorized', alExpinar);
    return () => {
      vivo = false;
      window.removeEventListener('admin:unauthorized', alExpinar);
    };
  }, [cerrarSesion]);

  const valor = useMemo<AuthValor>(
    () => ({ estado, admin, iniciarSesion, cerrarSesion }),
    [estado, admin, iniciarSesion, cerrarSesion],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
