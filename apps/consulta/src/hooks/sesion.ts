// Fase 3 — Hooks de la sesion de persona.
//
// `useSesion()` se apoya en el store de lib/sesion.ts (useSyncExternalStore), NO en
// TanStack Query: el token tiene que estar disponible de forma sincronica para el
// cliente de fetch, y ademas debe sobrevivir a los re-intentos de las consultas.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError, getYoApp, postLoginApp } from '../lib/api';
import { getDeviceId } from '../lib/device';
import { sincronizarConCuenta } from '../lib/preferencias';
import {
  cerrarSesion,
  esSesionInvalida,
  guardarSesion,
  obtenerSesion,
  suscribirSesion,
  type Sesion,
} from '../lib/sesion';

export function useSesion(): Sesion | null {
  return useSyncExternalStore(suscribirSesion, obtenerSesion, obtenerSesion);
}

/** Traduce los codigos de error del login a algo que una persona entiende. */
export function textoErrorDeLogin(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'credenciales_invalidas':
        return 'El correo o la contraseña no son correctos. Revisalos e inténtalo otra vez.';
      case 'demasiados_intentos':
        return 'Demasiados intentos seguidos. Espera 15 minutos y vuelve a intentar.';
      case 'sin_conexion':
        return 'Sin conexión no puedo comprobar tu cuenta. Abre los libros igual: siguen guardados.';
      default:
        return 'No se pudo iniciar sesión ahora. Inténtalo en un momento.';
    }
  }
  return 'No se pudo iniciar sesión ahora. Inténtalo en un momento.';
}

export interface VariablesDeLogin {
  email: string;
  password: string;
}

/**
 * Alta de sesion. Manda el device_id del telefono: el servidor copia a la cuenta
 * los favoritos que ya existian, asi el perfil no arranca vacio (y la lista del
 * dispositivo se conserva por si alguien la usa sin iniciar sesion).
 */
export function useEntrar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, password }: VariablesDeLogin) => {
      const r = await postLoginApp({ email: email.trim(), password, deviceId: getDeviceId() });
      guardarSesion({ token: r.token, usuario: r.usuario });
      return r.usuario;
    },
    onSuccess: () => {
      // Cambi6 el deviceId activo: la lista de favoritos es otra y el perfil tambien.
      void qc.invalidateQueries({ queryKey: ['favoritos'] });
      void qc.invalidateQueries({ queryKey: ['yo'] });
    },
  });
}

/** Cierra la sesion local y devuelve la app al modo anonimo por device_id. */
export function useSalir() {
  const qc = useQueryClient();
  return () => {
    cerrarSesion();
    // Sin token ya no hay cuenta a la que escribir: las preferencias que quedan en el
    // telefono pasan a presentarse como locales (y el tema no se pierde al salir).
    void sincronizarConCuenta(null);
    void qc.invalidateQueries({ queryKey: ['yo'] });
    void qc.invalidateQueries({ queryKey: ['favoritos'] });
  };
}

/** Datos de la cuenta (nombre, correo, favoritos y preferencias). */
export function useYo() {
  const sesion = useSesion();
  return useQuery({
    queryKey: ['yo', sesion?.usuario.id ?? null],
    queryFn: async ({ signal }) => {
      try {
        const r = await getYoApp(signal);
        // Las preferencias de la cuenta son las de la persona: se adoptan y se pintan.
        void sincronizarConCuenta(r.preferencias);
        return r;
      } catch (e) {
        // 401 `no_autenticado` = el dueno borro la cuenta o vencio el token.
        esSesionInvalida(e);
        throw e;
      }
    },
    enabled: Boolean(sesion),
    // Un 401 no se re-intenta y un perfil no necesita reintentos de red.
    retry: 0,
    staleTime: 60_000,
  });
}
