// Fase 5 — Fila "Continuar donde ibas" de la portada: lo ultimo abierto en este telefono.
//
// Sale SOLO si el historial esta encendido (el mismo boton de privacidad de /perfil).
// Son tarjetas de un toque: articulos o libros, ordenados del mas reciente al mas viejo.
import { Link } from 'react-router-dom';
import { limpiarHistorial, rutaVisita, useHistorial } from '../lib/historial';
import { usePreferencias } from '../lib/preferencias';

export default function HistorialReciente() {
  const visitas = useHistorial();
  const { preferencias } = usePreferencias();

  // Con el historial apagado no se muestra ni se conserva nada visible.
  if (!preferencias.guardarHistorial || visitas.length === 0) return null;

  return (
    <section aria-labelledby="continuar-titulo" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="continuar-titulo" className="font-sans text-sm font-semibold text-primary-dark">
          Continuar donde ibas
        </h2>
        <button
          type="button"
          onClick={limpiarHistorial}
          className="aprieta min-h-11 rounded-lg px-2 font-sans text-xs font-medium text-texto/50 hover:text-derogado focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0"
        >
          Vaciar
        </button>
      </div>
      <ul className="fila-chips pb-1">
        {visitas.slice(0, 6).map((v) => (
          <li key={v.clave} className="shrink-0">
            <Link
              to={rutaVisita(v)}
              className="aprieta flex min-h-11 w-[13.5rem] flex-col justify-center gap-0.5 rounded-xl border border-primary/20 bg-tarjeta px-3 py-2 text-left hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="truncate text-sm font-semibold text-texto">{v.etiqueta}</span>
              <span className="truncate text-[11px] text-texto/50">{v.sub}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
