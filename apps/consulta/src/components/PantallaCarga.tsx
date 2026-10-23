// Publicación — pantalla de carga al abrir la app.
//
// Dos propósitos:
//  1. Que la apertura no sea un parpadeo en blanco mientras React monta, se resuelve la
//     sesión y llegan los libros.
//  2. Ser la MARCA VISIBLE de que el código que corre es el nuevo. En el teléfono el
//     bundle se descarga en silencio y solo se aplica en un arranque en frío, así que
//     ver esta animación es la prueba de que la actualización de verdad llegó.
//
// Duración fija a propósito: si esperara a los datos, sin red se quedaría pegada justo
// cuando más hace falta que la app abra (modo offline).
import { useEffect, useState } from 'react';

const DURACION = 1200;
const DURACION_CORTA = 350; // con prefers-reduced-motion: solo lo indispensable
const DESVANECER = 320;

export default function PantallaCarga() {
  const [saliendo, setSaliendo] = useState(false);
  const [montada, setMontada] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const esperar = window.setTimeout(() => setSaliendo(true), reduce ? DURACION_CORTA : DURACION);
    const quitar = window.setTimeout(() => setMontada(false), (reduce ? DURACION_CORTA : DURACION) + DESVANECER);
    return () => {
      window.clearTimeout(esperar);
      window.clearTimeout(quitar);
    };
  }, []);

  if (!montada) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        'fixed inset-0 z-60 grid place-items-center bg-background transition-opacity duration-300 ease-out ' +
        (saliendo ? 'pointer-events-none opacity-0' : 'opacity-100')
      }
    >
      <div className="flex flex-col items-center px-6">
        <span className="relative grid place-items-center">
          {/* Halo que respira detrás del logo: da sensación de actividad sin moverlo. */}
          <span
            aria-hidden="true"
            className="animate-pulse-cafe absolute size-32 rounded-[2rem] bg-acento/25"
          />
          <img
            src="/icons/icon-192.png"
            alt=""
            width={88}
            height={88}
            className="animate-pop-estrella relative size-[88px] rounded-[1.35rem] shadow-[0_10px_28px_rgba(28,20,14,0.18)]"
          />
        </span>
        <p
          className="animate-entrada mt-5 font-serif text-xl font-bold text-primary-dark"
          style={{ animationDelay: '90ms' }}
        >
          Consulta Legal
        </p>
        <p className="animate-entrada mt-1 font-sans text-xs text-texto-tenue" style={{ animationDelay: '160ms' }}>
          Abriendo la biblioteca…
        </p>
        {/* Barra indeterminada: un tramo corto que recorre la pista una y otra vez. */}
        <span
          aria-hidden="true"
          className="animate-entrada mt-5 block h-1 w-40 overflow-hidden rounded-full bg-surface"
          style={{ animationDelay: '230ms' }}
        >
          <span className="animate-carga-barra block h-full w-1/3 rounded-full bg-primary" />
        </span>
      </div>
    </div>
  );
}
