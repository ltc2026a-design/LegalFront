// Zona 5 — "Mis favoritos": articulos guardados por ESTE dispositivo (device_id).
// La lista viene de GET /api/favoritos?deviceId=…; al no haber cuenta ni
// contrasena, el device_id es la unica identidad (regla de producto).
// Incluye la accion OPCIONAL de asociar nombre/correo (POST /api/app/registro),
// que solo es una etiqueta para el soporte, nunca un alta con contrasena.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import ArticuloCard from '../components/ArticuloCard';
import Button from '../components/Button';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import { ApiError, postRegistro } from '../lib/api';
import { getDeviceId } from '../lib/device';
import { useFavoritos, useToggleFavorito } from '../lib/favoritos';
import { useSesion } from '../hooks/sesion';
import { fmtFecha } from '../lib/formato';

/** Etiqueta opcional nombre/correo (sin contrasena, sin login). */
function EtiquetaDispositivo({ deviceId }: { deviceId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const registro = useMutation({
    mutationFn: () =>
      postRegistro({
        deviceId,
        nombre: nombre.trim() || undefined,
        email: email.trim() || undefined,
      }),
  });

  return (
    <div className="space-y-2 text-sm">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary underline-offset-4 hover:text-primary-dark hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0"
      >
        {abierto ? '− Ocultar' : '＋ Asociar nombre/correo (opcional)'}
      </button>
      <p className="text-xs text-texto/50">
        Dispositivo <span className="font-mono">{deviceId.slice(0, 8)}…</span> · sin cuenta y sin
        contraseña; solo es una etiqueta para recuperar tus favoritos si cambias de equipo.
      </p>

      {abierto && (
        <form
          className="space-y-3 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            registro.mutate();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre (opcional)"
              maxLength={120}
              className="w-full rounded-lg border border-primary/25 bg-tarjeta px-3 py-2 text-base text-texto outline-none sm:text-sm transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="correo@ejemplo.mx (opcional)"
              maxLength={254}
              className="w-full rounded-lg border border-primary/25 bg-tarjeta px-3 py-2 text-base text-texto outline-none sm:text-sm transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variante="secondary" type="submit" disabled={registro.isPending}>
              {registro.isPending ? 'Guardando…' : 'Guardar etiqueta'}
            </Button>
            {registro.isSuccess && (
              <span className="text-xs font-semibold text-vigente">
                Guardado para este dispositivo.
              </span>
            )}
            {registro.isError && (
              <span className="text-xs font-semibold text-derogado">
                {registro.error instanceof ApiError && registro.error.code === 'email_invalido'
                  ? 'El correo no parece válido.'
                  : 'No se pudo guardar la etiqueta.'}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export default function Favoritos() {
  // La etiqueta del dispositivo sigue hablando del TELEFONO (device_id anonimo);
  // la lista de favoritos habla de la CUENTA si la persona inicio sesion.
  const deviceId = getDeviceId();
  const sesion = useSesion();
  const { data, isPending, isError, error } = useFavoritos();
  const toggle = useToggleFavorito();

  const favoritos = data?.favoritos ?? [];
  const sinFavoritos = !isPending && !isError && favoritos.length === 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 font-sans sm:px-6">
      <nav aria-label="Ruta de navegación">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:text-primary-dark sm:min-h-0"
        >
          ← Biblioteca
        </Link>
      </nav>

      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-bold text-texto sm:text-3xl">Mis favoritos</h1>
        <p className="text-sm text-texto/60">
          {sesion
            ? 'Los de tu cuenta: los ves igual desde cualquier teléfono con el mismo correo.'
            : 'Artículos que guardaste en este dispositivo. Se conservan aunque cierres la app.'}
        </p>
        {!sesion && (
          <Link
            to="/entrar"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:text-primary-dark sm:min-h-0"
          >
            Entra a tu cuenta para que no se queden solo en este teléfono →
          </Link>
        )}
      </header>

      {isPending && (
        <div className="space-y-3" aria-label="Cargando favoritos">
          {[0, 1, 2].map((i) => (
            <Card key={i} sinAnimacion className="space-y-3 p-5">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card sinAnimacion className="p-5 text-sm text-texto/70">
          No se pudo cargar tu lista de favoritos.{' '}
          <span className="text-derogado">{(error as Error)?.message ?? 'Error de conexión'}</span>
        </Card>
      )}

      {sinFavoritos && (
        <Card sinAnimacion className="space-y-3 p-6 text-center">
          <h2 className="font-serif text-xl font-semibold text-texto">Aún no hay favoritos</h2>
          <p className="text-sm text-texto/60">
            Toca la estrella <span aria-hidden="true">☆</span> en cualquier artículo para guardarlo
            aquí y consultarlo después, incluso sin conexión.
          </p>
          <Link
            to="/"
            className="inline-block text-sm font-semibold text-primary hover:text-primary-dark"
          >
            Ir a la biblioteca →
          </Link>
        </Card>
      )}

      {favoritos.length > 0 && (
        <ul className="space-y-3">
          {favoritos.map((f, i) => (
            <li key={f.id}>
              <ArticuloCard
                retraso={Math.min(i, 8) * 40}
                numero={f.numero}
                texto={f.extracto || 'Contenido guardado: ábrelo para ver el texto completo.'}
                contexto={`${f.codigoNombre} · guardado ${fmtFecha(f.creadoEn) ?? 'recientemente'}`}
                esApartadoClave={f.esApartadoClave}
                estado={f.vigente ? 'Vigente' : 'Derogado'}
                favorito
                enlace={
                  f.codigoSlug
                    ? `/codigo/${f.codigoSlug}/articulo/${encodeURIComponent(f.numero)}`
                    : undefined
                }
                onToggleFavorito={(nuevo) => {
                  if (!nuevo) toggle.mutate({ articuloId: f.articuloId, favoritoId: f.id });
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Con cuenta la identidad ya no es el telefono: la etiqueta no aplica. */}
      {!sesion && (
        <Card sinAnimacion className="p-5">
          <EtiquetaDispositivo deviceId={deviceId} />
        </Card>
      )}
    </main>
  );
}
