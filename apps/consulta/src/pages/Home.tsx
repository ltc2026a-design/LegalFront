// Zona 4 — Inicio: buscador destacado + apartados clave + biblioteca de codigos agrupada.
// La biblioteca (los "libros") es lo principal del ingreso, segun el requisito de producto.
import { Link } from 'react-router-dom';
import Buscador from '../components/Buscador';
import Asistente from '../components/Asistente';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import CodigoCard from '../components/CodigoCard';
import HistorialReciente from '../components/HistorialReciente';
import { useApartadosClave, useCodigos } from '../hooks/consulta';
import { ordenJurisdiccion, etiquetaJurisdiccion } from '../lib/formato';
import { usePreferencias } from '../lib/preferencias';
import type { CodigoListaItem } from '../lib/types';

function agruparPorJurisdiccion(codigos: CodigoListaItem[]): Map<string, CodigoListaItem[]> {
  const grupos = new Map<string, CodigoListaItem[]>();
  for (const c of codigos) {
    const arr = grupos.get(c.jurisdiccion) ?? [];
    arr.push(c);
    grupos.set(c.jurisdiccion, arr);
  }
  return new Map(
    [...grupos.entries()].sort(([a], [b]) => ordenJurisdiccion(a) - ordenJurisdiccion(b)),
  );
}

/**
 * Fase 4 — Acceso directo al libro que la persona anclo en su configuracion.
 * Es UNA linea: la biblioteca completa sigue siendo lo primero del ingreso
 * (requisito de producto), esto solo ahorra el toque de abrirla cada dia.
 */
function LibroAnclado() {
  const { preferencias } = usePreferencias();
  const { data } = useCodigos();
  const slug = preferencias.codigoFavorito;
  if (!slug) return null;

  const codigo = data?.codigos.find((c) => c.slug === slug);
  if (!codigo) return null;

  return (
    <Link
      to={`/codigo/${codigo.slug}`}
      className="aprieta flex min-h-11 items-center gap-3 rounded-xl border border-primary/25 bg-tarjeta px-4 py-3 shadow-sm hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true" className="font-serif text-lg text-acento">
        ▸
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto/50">
          Tu libro
        </span>
        <span className="block truncate font-serif text-sm font-semibold text-texto">
          {codigo.nombre}
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium text-primary">Abrir →</span>
    </Link>
  );
}

function ApartadosClave() {
  const { data, isPending, isError } = useApartadosClave();

  if (isError) return null;
  if (isPending) {
    return (
      <section aria-label="Apartados clave (cargando)" className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </section>
    );
  }

  const apartados = data?.apartados ?? [];
  if (apartados.length === 0) return null;

  return (
    <section aria-labelledby="apartados-titulo" className="space-y-3">
      <h2 id="apartados-titulo" className="font-sans text-lg font-semibold text-primary-dark">
        Apartados clave
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {apartados.map((a, i) => (
          <Card
            key={a.articuloId}
            sinAnimacion
            retraso={Math.min(i, 4) * 45}
            className="animate-entrada border-l-4 border-l-acento"
          >
            <Link
              to={`/codigo/${a.codigoSlug}/articulo/${encodeURIComponent(a.numero)}`}
              className="aprieta flex h-full flex-col gap-1 rounded-xl p-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center gap-2">
                <span className="font-serif text-base font-semibold text-texto">{a.numero}</span>
                <span className="rounded-full bg-acento/20 px-2 py-0.5 text-[11px] font-semibold text-primary-dark ring-1 ring-inset ring-acento/50">
                  Clave
                </span>
              </div>
              <p className="line-clamp-2 font-serif text-[13px] text-texto/70">{a.extracto}</p>
              <p className="mt-auto text-xs text-texto/50">{a.codigoNombre}</p>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { data, isPending, isError, error } = useCodigos();

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-8 font-sans sm:px-6">
      <section className="space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="font-serif text-3xl font-bold text-primary-dark sm:text-4xl">
            Sistema de Consulta Legal
          </h1>
          <p className="text-sm text-texto/60">
            Consulta constituciones, leyes y códigos de México y Quintana Roo.
          </p>
        </div>
        <div className="mx-auto max-w-2xl">
          <Buscador variante="hero" />
        </div>
      </section>

      <HistorialReciente />

      <LibroAnclado />

      <Asistente />

      <ApartadosClave />

      <section data-tour="biblioteca" aria-labelledby="biblioteca-titulo" className="space-y-5">
        <h2 id="biblioteca-titulo" className="font-sans text-lg font-semibold text-primary-dark">
          Biblioteca de códigos
        </h2>

        {isError && (
          <Card sinAnimacion className="p-5 text-sm text-texto/70">
            No se pudo cargar la biblioteca. Verifica que el servidor de consulta esté disponible.{' '}
            <span className="text-derogado">({(error as Error)?.message ?? 'sin conexión'})</span>
          </Card>
        )}

        {isPending && !isError && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Cargando biblioteca">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} sinAnimacion className="space-y-3 p-5">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </Card>
            ))}
          </div>
        )}

        {data &&
          [...agruparPorJurisdiccion(data.codigos)].map(([jurisdiccion, codigos]) => (
            <div key={jurisdiccion} className="space-y-3">
              <h3 className="flex items-center gap-2 border-b border-primary/15 pb-1 font-sans text-base font-semibold text-primary">
                {etiquetaJurisdiccion(jurisdiccion)}
                <span className="text-xs font-normal text-texto/50">({codigos.length})</span>
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {codigos.map((c, i) => (
                  <CodigoCard key={c.id} codigo={c} retraso={Math.min(i, 8) * 45} />
                ))}
              </div>
            </div>
          ))}
      </section>
    </main>
  );
}
