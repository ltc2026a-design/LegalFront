// Zona 7 — comparador side-by-side con diff a nivel de PALABRA.
// El calculo es CLIENT-SIDE con el paquete `diff` (diffWordsWithSpace): cada
// trozo devuelto es unchanged | removed | added. Columna izquierda = anterior
// (sin los "added", con los "removed" en rojo); derecha = nuevo (sin los
// "removed", con los "added" en verde). Texto legal en fuente serif.
import { useMemo } from 'react';
import { diffWordsWithSpace, type Change } from 'diff';

function usarColumna(parts: Change[], lado: 'anterior' | 'nuevo'): Change[] {
  return parts.filter((p) => (lado === 'anterior' ? !p.added : !p.removed));
}

function renderColumna(parts: Change[], lado: 'anterior' | 'nuevo') {
  return parts.map((p, i) => {
    if (lado === 'anterior' && p.removed) {
      return (
        <mark key={i} className="rounded bg-red-200/70 px-0.5 text-red-900 line-through">
          {p.value}
        </mark>
      );
    }
    if (lado === 'nuevo' && p.added) {
      return (
        <mark key={i} className="rounded bg-green-200/70 px-0.5 text-green-900">
          {p.value}
        </mark>
      );
    }
    return <span key={i}>{p.value}</span>;
  });
}

export default function WordDiff({
  anterior,
  nuevo,
}: {
  anterior: string | null;
  nuevo: string;
}) {
  const parts = useMemo(() => diffWordsWithSpace(anterior ?? '', nuevo), [anterior, nuevo]);

  const columnaAnterior = useMemo(() => usarColumna(parts, 'anterior'), [parts]);
  const columnaNuevo = useMemo(() => usarColumna(parts, 'nuevo'), [parts]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-primary/15 bg-surface p-4">
        <h3 className="mb-2 font-sans text-xs font-bold tracking-wide text-texto/60 uppercase">
          Texto anterior
        </h3>
        {anterior == null ? (
          <p className="font-serif text-[15px] leading-relaxed text-texto/50 italic">
            (Sin texto previo: es un artículo nuevo.)
          </p>
        ) : (
          <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap text-texto">
            {renderColumna(columnaAnterior, 'anterior')}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-primary/15 bg-surface p-4">
        <h3 className="mb-2 font-sans text-xs font-bold tracking-wide text-texto/60 uppercase">
          Texto nuevo
        </h3>
        <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap text-texto">
          {renderColumna(columnaNuevo, 'nuevo')}
        </p>
      </section>
    </div>
  );
}
