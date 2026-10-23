// Fase 3 — Acceso a la cuenta de la app de consulta.
//
// REGLA DURA DE PRODUCTO: aqui NO se crea la cuenta. Las credenciales las da de alta
// el dueno del sistema con `npm run usuario:create`; esta pantalla solo las verifica.
// Por eso no existe un link de "crear cuenta" ni de "recuperar contraseña": la forma
// correcta de conseguir acceso es pedirselo a quien administra el sistema.
//
// El login manda el device_id del telefono, asi el servidor copia a la cuenta los
// favoritos que la persona ya tenia (una sola vez; la lista del equipo se conserva).
//
// Fase 6 — Se quito el boton "Biblioteca" (no tenia logica dentro del login: la marca
// de arriba y la barra inferior ya llevan alli). Diseno nuevo: banda de degradado cafe,
// avatar que "nace" con pop-estrella y campos que entran escalonados.
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';
import { textoErrorDeLogin, useEntrar, useSesion } from '../hooks/sesion';

const claseInput =
  'w-full rounded-xl border border-primary/25 bg-tarjeta px-3.5 py-3 text-base text-texto ' +
  'shadow-sm outline-none transition placeholder:text-texto/40 focus:border-primary ' +
  'focus:ring-2 focus:ring-primary/25 sm:text-sm';

export default function Entrar() {
  const sesion = useSesion();
  const entrar = useEntrar();
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);

  if (sesion) return <Navigate to="/" replace />;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    entrar.mutate(
      { email, password },
      { onSuccess: () => navegar('/') },
    );
  };

  return (
    <main className="mx-auto flex min-h-pantalla max-w-md flex-col justify-center gap-5 px-4 py-10 font-sans sm:px-6 sm:py-16">
      <Card className="animate-entrada overflow-hidden p-0">
        {/* Banda de bienvenida: degradado cafe, avatar animado y titulo. */}
        <div className="bg-gradient-to-br from-primary to-acento px-6 pb-7 pt-8 text-center text-sobre-primario">
          <span
            aria-hidden="true"
            className="animate-pop-estrella mx-auto grid size-16 place-items-center rounded-full bg-white/15 shadow-inner ring-1 ring-white/30 backdrop-blur"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-8"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8.5" r="3.5" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
          </span>
          <h1 className="mt-4 font-serif text-2xl font-bold sm:text-3xl">Entra a tu perfil</h1>
          <p className="mx-auto mt-1.5 max-w-[22rem] text-sm text-sobre-primario/85">
            Tus favoritos te siguen en cualquier telefono y puedes elegir como leer los libros.
          </p>
        </div>

        <form className="space-y-4 p-6" onSubmit={enviar}>
          <div className="animate-entrada space-y-1.5" style={{ animationDelay: '60ms' }}>
            <label htmlFor="email" className="text-sm font-semibold text-texto/80">
              Correo
            </label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              placeholder="tucorreo@ejemplo.mx"
              maxLength={254}
              className={claseInput}
            />
          </div>

          <div className="animate-entrada space-y-1.5" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-semibold text-texto/80">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                aria-pressed={verClave}
                className="-my-1.5 min-h-11 cursor-pointer rounded px-2 text-xs font-semibold text-primary hover:text-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:my-0 sm:min-h-0"
              >
                {verClave ? 'Ocultar' : 'Ver'}
              </button>
            </div>
            <input
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={verClave ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="Tu contraseña"
              maxLength={200}
              className={claseInput}
            />
          </div>

          {entrar.isError && (
            <p
              role="alert"
              className="animate-entrada rounded-lg bg-derogado/10 px-3 py-2 text-sm font-medium text-derogado"
            >
              {textoErrorDeLogin(entrar.error)}
            </p>
          )}

          <Button
            type="submit"
            disabled={entrar.isPending}
            className="animate-entrada min-h-11 w-full text-base sm:min-h-0"
            style={{ animationDelay: '180ms' }}
          >
            {entrar.isPending ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>

      {/* Sin cuenta no hay forma de entrar: se lo dice aqui mismo, sin escondites. */}
      <p className="text-center text-xs leading-relaxed text-texto/55">
        Las cuentas las crea quien administra el sistema; aqui no se pueden registrar.
      </p>
    </main>
  );
}
