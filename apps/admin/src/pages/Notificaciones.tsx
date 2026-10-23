// Zona 9 — "Notificaciones": difusion de un AVISO GENERAL a todos los usuarios
// (POST /admin/notificaciones/general) y listado reciente de avisos enviados
// (GET /admin/notificaciones). El transporte real es Web Push VAPID hoy; los
// destinos nativos quedan pendientes hasta Zona 10 (la API lo reporta).
import { useState, type FormEvent } from 'react';
import { useDifundir, useNotificaciones } from '../lib/queries';
import type { DifundirResponse } from '../lib/types';
import { CLASE_CAMPO, fechaCorta } from '../lib/formato';
import Button from '../components/Button';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';

const TITULO_MAX = 200;
const MENSAJE_MAX = 500;

export default function Notificaciones() {
  const { data, isLoading, isError } = useNotificaciones();
  const difundir = useDifundir();

  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [resultado, setResultado] = useState<DifundirResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResultado(null);
    try {
      const res = await difundir.mutateAsync({ titulo: titulo.trim(), mensaje: mensaje.trim() });
      setResultado(res);
      setTitulo('');
      setMensaje('');
    } catch {
      setError('No se pudo enviar la notificación. Verifica tu sesión.');
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="font-serif text-2xl font-bold text-primary-dark">Notificaciones</h1>
        <p className="mt-1 text-sm text-texto/60">
          Difunde un aviso general a todos los dispositivos registrados. Se envía por Web Push a la
          web; Android/iOS/desktop quedan pendientes hasta Zona 10.
        </p>
      </header>

      <Card sinAnimacion className="p-5">
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-texto/60">Título</span>
            <input
              className={CLASE_CAMPO}
              value={titulo}
              maxLength={TITULO_MAX}
              placeholder="Ej.: Nueva reforma en la Constitución"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-texto/60">Mensaje</span>
            <textarea
              className={`${CLASE_CAMPO} min-h-24`}
              value={mensaje}
              maxLength={MENSAJE_MAX}
              placeholder="Texto breve que verá el usuario en su aviso."
              onChange={(e) => setMensaje(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={!titulo.trim() || !mensaje.trim() || difundir.isPending}
            >
              {difundir.isPending ? 'Enviando…' : 'Enviar a todos'}
            </Button>
            <span className="text-xs text-texto/50">
              {titulo.length}/{TITULO_MAX} · {mensaje.length}/{MENSAJE_MAX}
            </span>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-derogado/10 px-3 py-2 text-sm text-derogado">
              {error}
            </p>
          )}

          {resultado && (
            <div
              className={
                'rounded-lg px-3 py-2 text-sm ' +
                (resultado.enviados > 0
                  ? 'bg-vigente/10 text-vigente'
                  : 'bg-revision/10 text-revision')
              }
            >
              <p className="font-semibold">Difusión registrada en la base de datos.</p>
              <p className="mt-1">
                Total: {resultado.total} · Enviados (web): {resultado.enviados} · Fallidos:{' '}
                {resultado.fallidos} · Bajas limpiadas: {resultado.eliminados} · Pendientes
                (nativo): {resultado.pendientes}.
              </p>
              {resultado.total === 0 && (
                <p className="mt-1 text-xs opacity-80">
                  No hay dispositivos registrados todavía: cuando los usuarios activen los avisos
                  aparecerán aquí.
                </p>
              )}
            </div>
          )}
        </form>
      </Card>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-primary-dark">Avisos recientes</h2>

        {isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}
        {isError && (
          <p className="rounded-lg bg-derogado/10 px-4 py-3 text-sm text-derogado">
            No se pudo cargar el historial de notificaciones.
          </p>
        )}

        {data && data.notificaciones.length === 0 && (
          <p className="text-sm text-texto/55">Aún no se ha enviado ninguna notificación.</p>
        )}

        <ul className="flex flex-col gap-3">
          {data?.notificaciones.map((n) => (
            <li key={n.id}>
              <Card sinAnimacion className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-serif text-base font-semibold text-texto">{n.titulo}</p>
                  <span className="text-xs text-texto/50">{fechaCorta(n.enviadaEn)}</span>
                </div>
                <p className="mt-1 text-sm text-texto/70">{n.mensaje}</p>
                <p className="mt-1 text-xs text-texto/45">
                  {n.enviadaATodos ? 'Aviso general' : 'Aviso de artículo'}
                  {n.contextoArticulo ? ` · ${n.contextoArticulo}` : ''}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
