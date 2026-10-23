// Zona 7 — pantalla de acceso. NO hay alta de cuenta ni recuperacion de
// contrasena (regla de producto): solo verifica credenciales creadas por CLI.
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { ApiError } from '../lib/api';
import Button from '../components/Button';
import Card from '../components/Card';

function mensajeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'demasiados_intentos') {
      return 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.';
    }
    if (err.status === 401 || err.code === 'credenciales_invalidas') {
      return 'Credenciales incorrectas.';
    }
    return 'No se pudo conectar con el servidor.';
  }
  return 'Error inesperado al iniciar sesión.';
}

export default function Login() {
  const { estado, iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const desde = (location.state as { desde?: string } | null)?.desde ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (estado === 'autenticado') return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await iniciarSesion(email, password);
      navigate(desde, { replace: true });
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-bold text-primary-dark">Acceso administrador</h1>
        <p className="mt-1 mb-6 text-sm text-texto/60">
          Sistema de Consulta Legal · Revisión editorial
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1">
            <span className="font-sans text-sm font-semibold text-texto">Correo</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-primary/30 bg-white px-3 py-2 font-sans text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-sans text-sm font-semibold text-texto">Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-primary/30 bg-white px-3 py-2 font-sans text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-derogado/10 px-3 py-2 text-sm text-derogado">
              {error}
            </p>
          )}

          <Button type="submit" disabled={enviando || !email || !password} className="mt-1">
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-texto/45">
          ¿No tienes acceso? Las cuentas de administrador las crea únicamente el
          responsable del proyecto por línea de comandos.
        </p>
      </Card>
    </main>
  );
}
