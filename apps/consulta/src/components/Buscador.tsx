// Zona 4 — Buscador reutilizable: navega a /buscar con el termino (y codigo opcional).
// Zona 4b — Si el termino es un numero de articulo y solo hay un libro posible, salta
// directo al articulo en vez de pasar por la lista de resultados.
// Autocompletado — Mientras se escribe muestra un panel con los libros que coinciden
// (del listado ya cargado, instantaneo y sirve sin conexion) y los articulos mejor
// rankeados por /buscar. Se mueve con las flechas y se elige con Enter o toque.
// Variante "hero": destacado (portada). Variante "compact": campo atenuado para la barra superior.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from './Button';
import { saltoArticulo } from '../lib/api';
import { pareceNumeroArticulo } from '../lib/referencia';
import { useBusqueda, useCodigos } from '../hooks/consulta';
import { limpiarBusquedas, registrarBusqueda, useBusquedasRecientes } from '../lib/historialBusquedas';

export interface BuscadorProps {
  variante?: 'hero' | 'compact';
  /** Si se indica, la busqueda se limita a este codigo (busqueda dentro de un codigo). */
  codigo?: string;
  placeholder?: string;
  /** Termino inicial (p. ej. al reabrir la busqueda dentro de un codigo). */
  valorInicial?: string;
}

/** Sugerencia de un libro (codigo) de la biblioteca. */
interface SugCodigo {
  tipo: 'codigo';
  clave: string;
  nombre: string;
  slug: string;
}

/** Sugerencia de un articulo concreto. */
interface SugArticulo {
  tipo: 'articulo';
  clave: string;
  numero: string;
  codigoSlug: string;
  codigoNombre: string;
  snippet: string;
}

type Sugerencia = SugCodigo | SugArticulo;

/** Quita acentos y pasa a minusculas para que "penal" case con "Penal" e "info" con "información". */
function sinAcentos(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** El `destacado` del servidor trae <mark>…</mark>: se limpian las etiquetas y se recorta. */
function fragmentoLimpio(html: string, max = 90): string {
  const texto = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}…` : texto;
}

export default function Buscador({
  variante = 'hero',
  codigo,
  placeholder = 'Busca un tema o un artículo (ej. art 151)…',
  valorInicial = '',
}: BuscadorProps) {
  const navigate = useNavigate();
  const [q, setQ] = useState(valorInicial);
  const [qDeb, setQDeb] = useState(valorInicial);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [enviando, setEnviando] = useState(false);
  const cajaRef = useRef<HTMLFormElement>(null);
  const listaId = `sug-${variante}-${codigo ?? 'all'}`;
  const recientes = useBusquedasRecientes();

  const etiqueta = codigo ? `Buscar en ${codigo}` : 'Buscar artículos';

  // Debounce del termino: el panel no debe disparar una llamada por cada letra.
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 220);
    return () => clearTimeout(t);
  }, [q]);

  // Articulos: solo cuando hay 2+ caracteres. useBusqueda trae caché + abort por term.
  const termSug = qDeb.trim().length >= 2 ? qDeb.trim() : '';
  const busq = useBusqueda(termSug, codigo, 6);

  const { data: datosCodigos } = useCodigos();

  // Coincidencias de libros: instantaneas (el listado ya esta en memoria) y funcionan offline.
  const sugerencias = useMemo<Sugerencia[]>(() => {
    const term = sinAcentos(qDeb.trim());
    const libros: Sugerencia[] = term
      ? (datosCodigos?.codigos ?? [])
          .filter((c) => sinAcentos(c.nombre).includes(term))
          .slice(0, 3)
          .map((c) => ({ tipo: 'codigo', clave: `c-${c.slug}`, nombre: c.nombre, slug: c.slug }))
      : [];

    const arts: Sugerencia[] = (busq.data?.resultados ?? []).slice(0, 5).map((r) => ({
      tipo: 'articulo',
      clave: `a-${r.articuloId}`,
      numero: r.numero,
      codigoSlug: r.codigoSlug,
      codigoNombre: r.codigoNombre,
      snippet: fragmentoLimpio(r.destacado),
    }));

    return [...libros, ...arts];
  }, [qDeb, datosCodigos, busq.data]);

  // Al cambiar el termino el foco del teclado vuelve arriba.
  useEffect(() => {
    setActiva(-1);
  }, [qDeb]);

  // Clic fuera del buscador cierra el panel.
  useEffect(() => {
    if (!abierto) return;
    const alPisar = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alPisar);
    return () => document.removeEventListener('mousedown', alPisar);
  }, [abierto]);

  function elegir(s: Sugerencia): void {
    setAbierto(false);
    if (s.tipo === 'codigo') {
      navigate(`/codigo/${s.slug}`);
      return;
    }
    navigate(`/codigo/${s.codigoSlug}/articulo/${encodeURIComponent(s.numero)}`);
  }

  /** Repite una busqueda reciente desde un chip: registra el termino y va a resultados. */
  function buscarTermino(termino: string): void {
    registrarBusqueda(termino);
    setAbierto(false);
    const qs = new URLSearchParams({ q: termino });
    if (codigo) qs.set('codigo', codigo);
    navigate(`/buscar?${qs.toString()}`);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const termino = q.trim();
    if (!termino) return;
    registrarBusqueda(termino);
    const qs = new URLSearchParams({ q: termino });
    if (codigo) qs.set('codigo', codigo);
    const destino = `/buscar?${qs.toString()}`;

    if (!pareceNumeroArticulo(termino)) {
      navigate(destino);
      return;
    }

    // Numero de articulo: si solo un libro lo tiene, se va directo a el. Con varios
    // candidatos la pagina de resultados muestra el panel "Ir directo".
    setEnviando(true);
    try {
      const salto = await saltoArticulo({ q: termino, codigo });
      if (salto.candidatos.length === 1) {
        const c = salto.candidatos[0];
        navigate(`/codigo/${c.codigoSlug}/articulo/${encodeURIComponent(c.numero)}`);
        return;
      }
    } catch {
      // API caida o consulta rara: se continua con la busqueda normal.
    } finally {
      setEnviando(false);
    }
    navigate(destino);
  }

  function onTeclas(e: KeyboardEvent<HTMLInputElement>) {
    if (!abierto || sugerencias.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiva((i) => (i + 1) % sugerencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiva((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAbierto(false);
    } else if (e.key === 'Enter' && activa >= 0) {
      // Enter sobre una sugerencia seleccionada: se va directo, no a la lista.
      e.preventDefault();
      elegir(sugerencias[activa]);
    }
  }

  const inputComun = {
    value: q,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setQ(e.target.value);
      setAbierto(true);
    },
    onFocus: () => setAbierto(true),
    onKeyDown: onTeclas,
    role: 'combobox' as const,
    'aria-expanded': abierto && sugerencias.length > 0,
    'aria-controls': listaId,
    'aria-activedescendant': activa >= 0 ? `${listaId}-${activa}` : undefined,
    'aria-autocomplete': 'list' as const,
    autoComplete: 'off',
  };

  const hayTermino = q.trim().length > 0;

  const panel =
    abierto && hayTermino && sugerencias.length > 0 ? (
      <ul
        id={listaId}
        role="listbox"
        aria-label="Sugerencias de búsqueda"
        className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-xl border border-primary/20 bg-tarjeta py-1 shadow-lg"
      >
        {sugerencias.map((s, i) => {
          const seleccionada = i === activa;
          return (
            <li
              key={s.clave}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={seleccionada}
              // onMouseDown (no onClick) para elegir antes de que el blur cierre el panel.
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(s);
              }}
              onMouseEnter={() => setActiva(i)}
              className={
                'flex cursor-pointer items-baseline gap-2 px-3 py-2 text-left ' +
                (seleccionada ? 'bg-primary/10' : '')
              }
            >
              {s.tipo === 'codigo' ? (
                <>
                  <span aria-hidden="true" className="shrink-0 text-acento">
                    ▸
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-texto">
                    {s.nombre}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-texto/45">Libro</span>
                </>
              ) : (
                <>
                  <span className="shrink-0 font-serif text-sm font-semibold text-primary-dark">
                    Art. {s.numero}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-texto/60">{s.snippet}</span>
                  <span className="shrink-0 max-w-[9rem] truncate text-[11px] font-medium text-texto/45">
                    {s.codigoNombre}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    ) : abierto && !hayTermino && recientes.length > 0 ? (
      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 rounded-xl border border-primary/20 bg-tarjeta p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-texto/45">
            Búsquedas recientes
          </span>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              limpiarBusquedas();
            }}
            className="cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:text-primary-dark focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            Borrar
          </button>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {recientes.map((termino) => (
            <li key={termino}>
              <button
                type="button"
                // onMouseDown antes del blur para que el clic no se pierda al cerrar el panel.
                onMouseDown={(e) => {
                  e.preventDefault();
                  buscarTermino(termino);
                }}
                className={
                  'aprieta inline-flex min-h-9 items-center rounded-full border border-primary/20 ' +
                  'bg-surface px-3 text-sm text-texto/80 hover:bg-primary/10 hover:text-primary-dark ' +
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'
                }
              >
                {termino}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  if (variante === 'compact') {
    return (
      <form
        ref={cajaRef}
        onSubmit={enviar}
        role="search"
        className="relative flex w-full max-w-xs items-center gap-2"
      >
        <input
          type="search"
          aria-label={etiqueta}
          placeholder="Buscar…"
          {...inputComun}
          className={
            'min-h-11 w-full rounded-lg border border-primary/20 bg-surface px-3 py-2 text-base text-texto ' +
            'placeholder:text-texto/40 focus-visible:border-primary focus-visible:outline-2 ' +
            'focus-visible:outline-offset-1 focus-visible:outline-primary sm:min-h-0 sm:py-1.5 sm:text-sm'
          }
        />
        <Button
          type="submit"
          variante="ghost"
          className="toque px-2 py-1.5 sm:min-h-0 sm:min-w-0"
          aria-label="Buscar"
          disabled={enviando}
        >
          <IconoLupa />
        </Button>
        {panel}
      </form>
    );
  }

  // hero
  return (
    <form
      ref={cajaRef}
      onSubmit={enviar}
      role="search"
      className="relative flex w-full items-stretch gap-2"
    >
      <input
        type="search"
        aria-label={etiqueta}
        placeholder={placeholder}
        {...inputComun}
        className={
          'min-w-0 flex-1 rounded-xl border border-primary/25 bg-tarjeta px-4 py-3 font-sans text-base ' +
          'text-texto shadow-sm placeholder:text-texto/40 focus-visible:border-primary ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
        }
      />
      <Button type="submit" className="shrink-0 px-5" disabled={enviando}>
        <IconoLupa />
        <span className="hidden sm:inline">{enviando ? 'Buscando…' : 'Buscar'}</span>
      </Button>
      {panel}
    </form>
  );
}

function IconoLupa() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
