// Fase 7 — Tour de bienvenida: un recorrido por zonas que sale solo la primera vez que
// alguien entra a un dispositivo, y que se puede volver a abrir desde Perfil.
//
// Como funciona, en tres piezas:
//  1. `lib/tour.ts` guarda la marca de "ya lo vi" (local) y el estado de abierto.
//  2. Los componentes de la app se marcan con `data-tour="..."`; aqui se buscan con
//     `elementoVisible()` y se les hace un hueco en la cortina oscura.
//  3. La tarjeta se coloca sola: debajo del hueco si cabe, encima si no, y siempre
//     dentro de la pantalla. Por eso funciona igual en un celular de 360 px que en un
//     monitor, sin variantes `sm:` escritas a mano paso por paso.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Button from './Button';
import { abrirTour, cerrarTour, tourPendiente, useTourAbierto } from '../lib/tour';

interface Paso {
  readonly id: string;
  readonly titulo: string;
  readonly texto: string;
  /** Valor de `data-tour` en la pantalla; sin ancla la tarjeta sale centrada. */
  readonly ancla?: string;
  /** Solo imagen en el paso de apertura. */
  readonly logo?: boolean;
}

const PASOS: readonly Paso[] = [
  {
    id: 'bienvenida',
    logo: true,
    titulo: 'Bienvenido a Consulta Legal',
    texto:
      'Nueve libros con el texto completo de las constituciones, leyes y códigos de México y Quintana Roo, al día. En seis toques te enseño las zonas.',
  },
  {
    id: 'buscador',
    ancla: 'buscador',
    titulo: 'Buscar',
    texto:
      'Escribe una palabra —«arrendamiento», «pensión alimenticia»— o el número de un artículo. Los resultados salen al instante, con el resumen y el texto completo de cada uno.',
  },
  {
    id: 'biblioteca',
    ancla: 'biblioteca',
    titulo: 'La biblioteca',
    texto:
      'Aquí están los libros, separados por federales y de Quintana Roo. Toca uno para abrirlo y desliza entre sus artículos sin volver a buscar.',
  },
  {
    id: 'asistente',
    ancla: 'asistente',
    titulo: 'El asistente',
    texto:
      '¿No sabes qué ley aplica? Cuéntale tu situación con tus palabras y te guía paso a paso, señalando los artículos que la respaldan.',
  },
  {
    id: 'navegacion',
    ancla: 'navegacion',
    titulo: 'Moverse por la app',
    texto:
      'De aquí se va a Inicio, Buscar, Asistente y Favoritos, y a tu Perfil —donde se ajusta el tamaño de la letra y el tema. Siempre queda a un toque mientras lees.',
  },
  {
    id: 'favoritos',
    ancla: 'favoritos',
    titulo: 'Favoritos',
    texto:
      'Guarda los artículos que repites con la estrella de cada uno. Se quedan en tu cuenta, viajan entre tu celular y tu computadora, y siguen funcionando sin señal.',
  },
  {
    id: 'lectura',
    titulo: 'Leer derecho',
    texto:
      'Dentro de un artículo tienes «Resumen» para entenderlo rápido y «Ver completo» para el texto íntegro, con la letra del tamaño que elegiste. También puedes compartirlo o copiarlo.',
  },
  {
    id: 'listo',
    titulo: 'Ya puedes empezar',
    texto:
      'Con el mismo correo y contraseña entras desde cualquier dispositivo. Si alguien más usa la app en otro teléfono o PC, este recorrido le vuelve a salir ahí. Desde Perfil puedes verlo otra vez.',
  },
];

const ANCHO_MAX = 368;
const MARGEN = 16;
const HUECO_R = 6;
const SEPARACION = 12;

interface Caja {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * El ultimo elemento visible con ese nombre. Es EL ULTIMO (no el primero) porque
 * `navegacion` y `favoritos` están marcados dos veces: en la barra de arriba y en la
 * de abajo. La de abajo va después en el DOM y está `sm:hidden`, asi que en el celular
 * gana la barra inferior y en la computadora gana la de arriba — que es lo que toca.
 */
function elementoVisible(nombre: string): HTMLElement | null {
  let elegido: HTMLElement | null = null;
  for (const nodo of document.querySelectorAll<HTMLElement>(`[data-tour="${nombre}"]`)) {
    if (nodo.getClientRects().length > 0) elegido = nodo;
  }
  return elegido;
}

/** El rect del elemento, recortado a la pantalla y con su respiración alrededor. */
function cajaDe(el: HTMLElement): Caja | null {
  const r = el.getBoundingClientRect();
  const y = Math.max(r.top - HUECO_R, 6);
  const h = Math.min(r.bottom + HUECO_R, window.innerHeight - 6) - y;
  const x = Math.max(r.left - HUECO_R, 6);
  const w = Math.min(r.right + HUECO_R, window.innerWidth - 6) - x;
  return h > 8 && w > 8 ? { x, y, w, h } : null;
}

const limitar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function reduceMovimiento(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function TourBienvenida() {
  const abierto = useTourAbierto();
  const { pathname } = useLocation();
  const [paso, setPaso] = useState(0);
  const [hueco, setHueco] = useState<Caja | null>(null);
  const [vista, setVista] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  // La tarjeta mide lo que midan sus textos; se lee del DOM para poder pegarla
  // debajo o encima del hueco sin adivinar alturas.
  const [alto, setAlto] = useState(200);
  const tarjetaRef = useRef<HTMLDivElement | null>(null);

  const actual = PASOS[paso];
  const ultimo = paso === PASOS.length - 1;

  // Sale solo: dispositivo nuevo (marca local), en el inicio, y con la pantalla ya
  // pintada. El retardo deja cargar los libros para que el recorrido no se vea a medias.
  useEffect(() => {
    if (abierto || pathname !== '/' || !tourPendiente()) return;
    const id = window.setTimeout(() => abrirTour(), 900);
    return () => window.clearTimeout(id);
  }, [abierto, pathname]);

  // Tamaño de ventana: en el celular el teclado y el scroll de la barra de direcciones
  // cambian el alto, y la tarjeta tiene que seguir leída.
  useEffect(() => {
    const medir = () => setVista({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  // Paso -> llevar el ancla al centro de la pantalla y seguir su caja mientras se mueve.
  useEffect(() => {
    if (!abierto) return;
    const ancla = actual.ancla;
    const destino = ancla ? elementoVisible(ancla) : null;
    if (destino) {
      destino.scrollIntoView({
        block: 'center',
        behavior: reduceMovimiento() ? 'auto' : 'smooth',
      });
    }
    const medir = () => {
      const el = ancla ? elementoVisible(ancla) : null;
      setHueco(el ? cajaDe(el) : null);
    };
    medir();
    // `capture` = tambien los scrolls de contenedores internos, no solo del documento.
    window.addEventListener('scroll', medir, true);
    window.addEventListener('resize', medir);
    const id = window.setTimeout(medir, 420); // cuando el scroll suave ya termino
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('scroll', medir, true);
      window.removeEventListener('resize', medir);
    };
  }, [abierto, paso, actual.ancla]);

  useEffect(() => {
    if (!abierto) return;
    const teclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cerrarTour();
      } else if (e.key === 'ArrowRight' && !ultimo) {
        setPaso((p) => p + 1);
      } else if (e.key === 'ArrowLeft' && paso > 0) {
        setPaso((p) => p - 1);
      }
    };
    window.addEventListener('keydown', teclado);
    return () => window.removeEventListener('keydown', teclado);
  }, [abierto, paso, ultimo]);

  // Focus en la tarjeta al abrir y en cada paso: quien navega con teclado o lector de
  // pantalla cae dentro del diálogo, no detrás de la cortina.
  useEffect(() => {
    if (abierto) tarjetaRef.current?.focus({ preventScroll: true });
  }, [abierto, paso]);

  useEffect(() => {
    const h = tarjetaRef.current?.offsetHeight ?? 0;
    if (h > 0) setAlto((prev) => (Math.abs(prev - h) > 2 ? h : prev));
  }, [paso, abierto, hueco]);

  const ancho = Math.min(ANCHO_MAX, vista.w - MARGEN * 2);
  // Sin hueco (pasos centrados) la tarjeta va en un envoltorio que la centra el propio
  // CSS: asi nunca depende de la medida del alto ni de un `vista` desfasado.
  const centrado = !hueco;
  let izq = (vista.w - ancho) / 2;
  let arr = (vista.h - alto) / 2;
  if (hueco) {
    izq = limitar(
      hueco.x + hueco.w / 2 - ancho / 2,
      MARGEN,
      Math.max(MARGEN, vista.w - ancho - MARGEN),
    );
    // El hueco ya viene recortado a la pantalla, asi que estas dos medias son el sitio
    // libre real por debajo y por encima de la zona iluminada.
    const abajo = vista.h - (hueco.y + hueco.h);
    const arriba = hueco.y;
    if (alto + SEPARACION <= abajo) arr = hueco.y + hueco.h + SEPARACION;
    else if (alto + SEPARACION <= arriba) arr = hueco.y - SEPARACION - alto;
    // En pantallas muy bajas (ventana de 470 px) no cabe sin rozar: se pega al borde del
    // lado que tenga mas sitio, antes que tapar la zona que se esta explicando.
    else if (abajo >= arriba) arr = Math.max(hueco.y + hueco.h + 4, vista.h - alto - 4);
    else arr = Math.min(hueco.y - alto - 4, 4);
    arr = limitar(arr, 4, Math.max(4, vista.h - alto - 4));
  }

  if (!abierto) return null;

  return (
    // En los pasos centrados la raiz es la que centra la tarjeta (grid); la cortina y el
    // boton de Omitir son `fixed`, asi que salen del flujo del grid y no se mueven.
    <div
      className={
        'fixed inset-0 z-50 font-sans ' + (centrado ? 'grid place-items-center overflow-auto p-3' : '')
      }
    >
      {/* Cortina: el div tiene el hueco recortado y su sombra gigante pinta el resto. */}
      {hueco ? (
        <div
          aria-hidden="true"
          className={
            'animate-tour-halo pointer-events-none fixed rounded-[14px] ' +
            'transition-[left,top,width,height] duration-300 ease-out'
          }
          style={{
            left: hueco.x,
            top: hueco.y,
            width: hueco.w,
            height: hueco.h,
            boxShadow: '0 0 0 9999px rgba(28,20,14,0.66)',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="animate-aparecer fixed inset-0 bg-[rgba(28,20,14,0.66)]"
        />
      )}

      <button
        type="button"
        onClick={cerrarTour}
        className={
          'fixed z-20 rounded-lg px-3 py-1.5 text-xs font-semibold text-tarjeta/90 ' +
          'transition-colors duration-200 hover:bg-tarjeta/15 hover:text-tarjeta ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento'
        }
        style={{
          top: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
          right: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
        }}
      >
        Omitir
      </button>

      {/* `key` = se re-monta en cada paso, que es lo que reproduce la animacion de entrada. */}
      <div
        key={actual.id}
        ref={tarjetaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        tabIndex={-1}
        className={
          'animate-tour-tarjeta z-10 rounded-2xl border border-primary/20 bg-tarjeta p-5 ' +
          'shadow-[0_18px_50px_-16px_rgba(28,20,14,0.55)] focus-visible:outline-none'
        }
        style={
          centrado
            ? { position: 'relative', width: ancho }
            : { position: 'fixed', left: izq, top: arr, width: ancho }
        }
      >
        {actual.logo && (
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden="true"
            className="mx-auto mb-3 size-16 rounded-2xl shadow-sm"
          />
        )}

        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-texto/45">
          {paso + 1} / {PASOS.length}
        </p>
        <h2 id="tour-titulo" className="font-serif text-lg font-bold text-primary-dark">
          {actual.titulo}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-texto/75">{actual.texto}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {PASOS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                tabIndex={-1}
                onClick={() => setPaso(i)}
                className={
                  'h-1.5 rounded-full transition-all duration-300 ' +
                  (i === paso ? 'w-5 bg-primary' : 'w-1.5 bg-primary/25 hover:bg-primary/50')
                }
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {paso > 0 && (
              <Button
                variante="ghost"
                onClick={() => setPaso((p) => p - 1)}
                className="min-h-11 px-3 sm:min-h-0"
              >
                Atrás
              </Button>
            )}
            <Button
              onClick={() => (ultimo ? cerrarTour() : setPaso((p) => p + 1))}
              className="min-h-11 sm:min-h-0"
            >
              {ultimo ? '¡Listo, a leer!' : 'Siguiente'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
