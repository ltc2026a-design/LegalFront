// Zona 4 — Detalle de un codigo: encabezado + buscador dentro del codigo + arbol expandible.
import { Link, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import Buscador from '../components/Buscador';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import NodoArbol from '../components/NodoArbol';
import { ApiError } from '../lib/api';
import { useCodigo } from '../hooks/consulta';
import { etiquetaJurisdiccion, etiquetaTipo, fmtFecha } from '../lib/formato';
import { registrarVisita } from '../lib/historial';

export default function Codigo() {
  const { slug = '' } = useParams();
  const { data, isPending, isError, error } = useCodigo(slug);

  // Fase 5 — abrir un libro se apunta en el historial local ("continuar donde ibas").
  useEffect(() => {
    if (!data) return;
    registrarVisita({
      tipo: 'codigo',
      clave: data.codigo.slug,
      slug: data.codigo.slug,
      etiqueta: data.codigo.nombre,
      sub: etiquetaJurisdiccion(data.codigo.jurisdiccion),
    });
  }, [data]);

  if (isPending) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8 font-sans sm:px-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </main>
    );
  }

  const noEncontrado = error instanceof ApiError && error.esNotFound;
  if (isError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 font-sans sm:px-6">
        <Card sinAnimacion className="space-y-3 p-6 text-center">
          <h1 className="font-serif text-2xl font-semibold text-texto">
            {noEncontrado ? 'Código no encontrado' : 'No se pudo cargar el código'}
          </h1>
          <p className="text-sm text-texto/60">
            {noEncontrado
              ? 'El documento que buscas no existe o cambió de dirección.'
              : (error as Error)?.message ?? 'Error de conexión.'}
          </p>
          <Link to="/" className="text-sm font-semibold text-primary hover:text-primary-dark">
            ← Volver a la biblioteca
          </Link>
        </Card>
      </main>
    );
  }

  const { codigo, arbol } = data;
  const reforma = fmtFecha(codigo.fechaUltimaReforma);

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

      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {etiquetaTipo(codigo.tipo)} · {etiquetaJurisdiccion(codigo.jurisdiccion)}
        </p>
        <h1 className="font-serif text-2xl font-bold leading-tight text-texto sm:text-3xl">
          {codigo.nombre}
        </h1>
        {codigo.descripcion && <p className="text-sm text-texto/70">{codigo.descripcion}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto/60">
          <span>
            Versión vigente: <span className="font-medium text-texto">{codigo.versionVigente}</span>
          </span>
          {reforma && (
            <span>
              Última reforma: <span className="font-medium text-texto">{reforma}</span>
            </span>
          )}
        </div>
      </header>

      <section aria-label="Buscar en este código" className="max-w-xl">
        <Buscador
          variante="hero"
          codigo={codigo.slug}
          placeholder={`Buscar en ${codigo.nombre}…`}
        />
      </section>

      <section aria-labelledby="arbol-titulo" className="space-y-3">
        <h2 id="arbol-titulo" className="font-sans text-lg font-semibold text-primary-dark">
          Estructura
        </h2>
        {arbol.length === 0 ? (
          <Card sinAnimacion className="p-5 text-sm text-texto/60">
            Este código no tiene artículos cargados todavía.
          </Card>
        ) : (
          <ul className="space-y-1 rounded-xl border border-primary/15 bg-tarjeta p-3 shadow-sm">
            {arbol.map((nodo, i) => (
              <NodoArbol key={nodo.id ?? `${nodo.nombre}-${i}`} nodo={nodo} slug={codigo.slug} nivel={0} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
