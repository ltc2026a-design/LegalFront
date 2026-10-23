// Zona 7 — HOME = bandeja "Cambios pendientes": lo primero que ve el administrador.
// Cabecera de resumen + tarjetas por cambio (codigo, numero, badge de tipo, fecha)
// que abren el comparador. Estado vacio cuando no hay pendientes.
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePendientes, useResumen } from '../lib/queries';
import { fechaCorta } from '../lib/formato';
import CambioBadge from '../components/CambioBadge';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import type { TipoCambio } from '../lib/types';

const FILTROS: { valor: '' | TipoCambio; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'nuevo', etiqueta: 'Nuevos' },
  { valor: 'modificado', etiqueta: 'Modificados' },
  { valor: 'derogado', etiqueta: 'Derogados' },
];

function ResumenCabecera() {
  const { data, isLoading } = useResumen();
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  const items = [
    { label: 'Pendientes', value: data.pendientes, tone: 'text-revision' },
    { label: 'Fuentes activas', value: data.fuentes.activas, tone: 'text-vigente' },
    { label: 'Con error', value: data.fuentes.con_error, tone: 'text-derogado' },
    { label: 'Códigos', value: data.codigos, tone: 'text-primary-dark' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} sinAnimacion className="p-4">
          <p className={`font-serif text-3xl font-bold ${it.tone}`}>{it.value}</p>
          <p className="mt-1 text-xs font-medium text-texto/55">{it.label}</p>
        </Card>
      ))}
    </div>
  );
}

export default function Home() {
  const [tipo, setTipo] = useState<'' | TipoCambio>('');
  const location = useLocation();
  const confirmacion = (location.state as { confirmacion?: string } | null)?.confirmacion;
  const { data, isLoading, isError } = usePendientes(tipo ? { tipo } : undefined);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-primary-dark">Cambios pendientes</h1>
        <p className="mt-1 text-sm text-texto/60">
          Revisa y publica las reformas detectadas por sincronización.
        </p>
      </div>

      {confirmacion && (
        <div className="mb-4 rounded-lg bg-vigente/10 px-4 py-2 text-sm font-medium text-vigente">
          {confirmacion}
        </div>
      )}

      <ResumenCabecera />

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor || 'todos'}
            type="button"
            onClick={() => setTipo(f.valor)}
            className={
              'rounded-full px-3 py-1 font-sans text-sm font-semibold ring-1 ring-inset transition ' +
              (tipo === f.valor
                ? 'bg-primary text-white ring-primary'
                : 'bg-white text-primary ring-primary/25 hover:bg-primary/10')
            }
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {isLoading && (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        )}

        {isError && (
          <p className="rounded-lg bg-derogado/10 px-4 py-3 text-sm text-derogado">
            No se pudieron cargar los pendientes. Verifica tu sesión.
          </p>
        )}

        {data && data.total === 0 && (
          <div className="rounded-xl border border-dashed border-primary/25 bg-surface px-6 py-12 text-center">
            <p className="font-serif text-lg text-texto/70">No hay cambios pendientes</p>
            <p className="mt-1 text-sm text-texto/50">Todo el contenido publicado está al día.</p>
          </div>
        )}

        {data?.cambios.map((c) => (
          <Link
            key={c.id}
            to={`/cambios/${c.id}`}
            className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Card className="flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CambioBadge tipo={c.tipoCambio} />
                  <span className="font-serif text-lg font-semibold text-texto">
                    {c.codigoNombre ?? c.codigoSlug ?? '—'}
                  </span>
                  <span className="rounded-md bg-surface px-2 py-0.5 font-sans text-sm font-semibold text-primary-dark ring-1 ring-primary/15 ring-inset">
                    Art. {c.numero ?? '—'}
                  </span>
                  {c.tieneApartadoClave && (
                    <span className="rounded-full bg-acento/20 px-2 py-0.5 text-xs font-semibold text-primary-dark">
                      Apartado clave
                    </span>
                  )}
                </div>
                <span className="text-xs text-texto/50">{fechaCorta(c.fechaDeteccion)}</span>
              </div>
              <p className="line-clamp-2 font-serif text-sm text-texto/70">
                {c.tipoCambio === 'nuevo'
                  ? c.textoNuevo
                  : c.tipoCambio === 'derogado'
                    ? 'El artículo dejará de estar vigente tras aprobar.'
                    : c.textoNuevo}
              </p>
              <span className="text-sm font-semibold text-primary group-hover:text-primary-dark">
                Abrir comparador →
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
