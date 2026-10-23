// Zona 4 — Resultados de busqueda. El resaltado (`destacado`) se renderiza de forma segura
// con el sanador de src/lib/highlight.ts (conserva solo <mark>). Ver ese modulo.
// Zona 4b — Si la consulta es un numero de articulo, encima de los resultados aparece el
// panel "Ir directo", con los pocos libros que tienen ese articulo.
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Buscador from '../components/Buscador';
import Badge from '../components/Badge';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import { ApiError } from '../lib/api';
import { sanitizarDestacado } from '../lib/highlight';
import { useBusqueda, useCodigos, useSalto } from '../hooks/consulta';
import { etiquetaTipo } from '../lib/formato';
import type { CandidatoSalto } from '../lib/types';
import type { ResultadoBusqueda } from '../lib/types';

function CandidatoFila({ c }: { c: CandidatoSalto }) {
  return (
    <li>
      <Link
        to={`/codigo/${c.codigoSlug}/articulo/${encodeURIComponent(c.numero)}`}
        className="aprieta flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-3 py-2 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="font-serif text-sm font-semibold text-primary-dark">{c.numero}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-texto/70">{c.codigoNombre}</span>
        <Badge estado={c.vigente ? 'Vigente' : 'Derogado'} />
      </Link>
    </li>
  );
}

function PanelSalto({ clave, candidatos }: { clave: string; candidatos: CandidatoSalto[] }) {
  return (
    <Card sinAnimacion className="space-y-2 border-primary/30 bg-primary/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-dark">
        {candidatos.length === 1 ? 'Ir directo al artículo' : `Artículo ${clave} · elige el libro`}
      </p>
      <ul className="space-y-0.5">
        {candidatos.map((c) => (
          <CandidatoFila key={c.articuloId} c={c} />
        ))}
      </ul>
    </Card>
  );
}

function ResultadoFila({ r, retraso }: { r: ResultadoBusqueda; retraso?: number }) {
  return (
    <Card retraso={retraso}>
      <Link
        to={`/codigo/${r.codigoSlug}/articulo/${encodeURIComponent(r.numero)}`}
        className="aprieta flex flex-col gap-2 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-base font-semibold text-texto">{r.numero}</h3>
          <Badge estado={r.vigente ? 'Vigente' : 'Derogado'} />
        </div>
        <p className="line-clamp-3 font-serif text-sm leading-relaxed text-texto/80">
          {/* Unico uso de HTML crudo: el resaltado del servidor, ya saneado. */}
          <span dangerouslySetInnerHTML={{ __html: sanitizarDestacado(r.destacado) }} />
        </p>
        <p className="text-xs text-texto/50">{r.codigoNombre}</p>
      </Link>
    </Card>
  );
}

export default function Busqueda() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const codigo = params.get('codigo') ?? undefined;
  const { data, isPending, isError, error } = useBusqueda(q, codigo);
  const { data: codigosData } = useCodigos();
  const { data: salto } = useSalto(q, codigo);

  const cambiarFiltro = (value: string) => {
    const next = new URLSearchParams({ q });
    if (value) next.set('codigo', value);
    navigate(`/buscar?${next.toString()}`);
  };

  const noEnc = error instanceof ApiError && error.status === 400;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 font-sans sm:px-6">
      <header className="space-y-4">
        <Buscador variante="hero" valorInicial={q} codigo={codigo} />
        <nav aria-label="Ruta de navegación">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:text-primary-dark sm:min-h-0"
          >
            ← Biblioteca
          </Link>
        </nav>
      </header>

      {q.trim() === '' ? (
        <p className="text-sm text-texto/60">Escribe un término para buscar artículos.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-sans text-lg font-semibold text-primary-dark" aria-live="polite">
              {isPending
                ? 'Buscando…'
                : data
                  ? `${data.total} resultado${data.total === 1 ? '' : 's'} para "${data.query}"`
                  : 'Resultados'}
            </h1>
            <label className="flex items-center gap-2 text-sm text-texto/70">
              <span className="text-xs uppercase tracking-wide text-texto/50">Código</span>
              <select
                value={codigo ?? ''}
                onChange={(e) => cambiarFiltro(e.target.value)}
                aria-label="Filtrar resultados por código"
                className="min-h-11 rounded-lg border border-primary/25 bg-tarjeta px-2 py-1 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary sm:min-h-0 sm:text-sm"
              >
                <option value="">Todos</option>
                {codigosData?.codigos.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {etiquetaTipo(c.tipo)} — {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {salto?.reconocida && salto.candidatos.length > 0 && (
            <PanelSalto clave={salto.clave} candidatos={salto.candidatos} />
          )}

          {isPending && (
            <div className="space-y-3" aria-label="Cargando resultados">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} sinAnimacion className="space-y-2 p-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-3 w-40" />
                </Card>
              ))}
            </div>
          )}

          {isError && (
            <Card sinAnimacion className="p-5 text-sm text-texto/70">
              {noEnc
                ? 'Falta el término de búsqueda.'
                : 'No se pudo completar la búsqueda. Revisa el servicio de consulta.'}
            </Card>
          )}

          {data && data.resultados.length === 0 && !salto?.candidatos.length && (
            <Card sinAnimacion className="space-y-1 p-6 text-center">
              <p className="font-serif text-lg text-texto">Sin coincidencias para "{data.query}"</p>
              <p className="text-sm text-texto/60">Prueba con otras palabras o quita el filtro de código.</p>
            </Card>
          )}

          {data && data.resultados.length > 0 && (
            <ul className="space-y-3">
              {data.resultados.map((r, i) => (
                <li key={r.articuloId}>
                  <ResultadoFila r={r} retraso={Math.min(i, 8) * 40} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
