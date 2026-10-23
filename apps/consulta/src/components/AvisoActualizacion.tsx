// Publicación — tarjeta flotante de «Actualización disponible».
//
// Sale cuando `lib/actualizaciones` detecta una versión nueva: en el teléfono es un
// bundle de Capacitor ya descargado (se aplica al reiniciar la app) y en el navegador
// o en una PWA instalada es el Service Worker nuevo (se aplica recargando).
//
// Es un aviso, no una cortina: no bloquea la lectura y se puede posponer. Si se
// pospone en el teléfono vuelve a salir en el próximo arranque, porque la versión sigue
// anotada como descargada.
import { aplicarActualizacion, posponerActualizacion, useActualizacion } from '../lib/actualizaciones';
import Button from './Button';

export default function AvisoActualizacion() {
  const { version, origen, aplicando } = useActualizacion();
  if (!version) return null;

  const nativo = origen === 'nativo';

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-aviso-abajo pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-6"
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-primary/25 bg-tarjeta p-4 shadow-[0_12px_32px_rgba(28,20,14,0.18)]">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="animate-pop-estrella mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-5">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3.5v10m0 0 3.6-3.6M12 13.5 8.4 9.9M4.5 16v2.2c0 .98.8 1.8 1.8 1.8h11.4c1 0 1.8-.82 1.8-1.8V16"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-sans text-sm font-semibold text-texto">Actualización disponible</p>
            <p className="mt-0.5 font-sans text-xs leading-relaxed text-texto-suave">
              {nativo
                ? 'Ya descargamos la versión nueva en este teléfono. Toca «Actualizar» y la app se abrirá de nuevo con los cambios.'
                : 'Hay una versión nueva de la app. Toca «Actualizar» para recargar y ver los cambios.'}
            </p>
            {nativo && version !== 'web' && (
              <p className="mt-1 font-mono text-[11px] text-texto-tenue">versión {version}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variante="ghost" onClick={posponerActualizacion} disabled={aplicando}>
            Ahora no
          </Button>
          <Button onClick={() => void aplicarActualizacion()} disabled={aplicando}>
            {aplicando ? 'Actualizando…' : 'Actualizar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
