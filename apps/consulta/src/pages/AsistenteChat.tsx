// Zona 12 — Pantalla de chat del asistente.
//
// Se abre desde la tarjeta de la portada y ocupa la pantalla: es una conversacion, no
// un cuadro de busqueda. La conversacion vive en el store de `hooks/asistente`, asi que
// la generacion que empezo en la portada sigue aqui sin cortarse y el historial es el
// mismo si se vuelve a entrar.
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import Burbuja from '../components/BurbujaAsistente';
import { useAsistente, useEstadoAsistente } from '../hooks/asistente';
import { DUDAS_EJEMPLO } from '../lib/dudas';

export default function AsistenteChat() {
  const estado = useEstadoAsistente();
  const { mensajes, enviando, error, sugerencias, iaBloqueada, preguntar, detener, limpiar } =
    useAsistente();
  const conIa = estado.data?.listo === true && !iaBloqueada;
  const [texto, setTexto] = useState('');

  const fondo = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // El CSS reduce-motion mata animaciones/transiciones, pero scrollIntoView es JS:
    // si la persona pidio menos movimiento, se baja al final de golpe en vez de deslizar.
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    fondo.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'end' });
  }, [mensajes, enviando, sugerencias]);

  // Es un chat: se espera escribir, no buscar con el teclado del teléfono.
  useEffect(() => {
    entrada.current?.focus();
  }, []);

  const ultimaPregunta = [...mensajes].reverse().find((m) => m.rol === 'usuario')?.texto ?? '';
  const mostrarSugerencias =
    !enviando && sugerencias.length > 0 && mensajes[mensajes.length - 1]?.rol === 'asistente';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const pregunta = texto.trim();
    if (!pregunta || enviando) return;
    setTexto('');
    preguntar(pregunta, conIa);
  }

  return (
    <div className="flex h-pantalla flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-primary/15 bg-surface px-4 pb-3 pt-seguro">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-lg px-2 font-sans text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 sm:px-2 sm:py-1"
          aria-label="Volver al inicio"
        >
          ← Inicio
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-base font-bold text-primary-dark">
            Asistente de consultas
          </h1>
          <p className="truncate font-sans text-[11px] text-texto/50">
            Responde con los libros del acervo, sin cuentas y sin guardar datos personales.
          </p>
        </div>
        <span
          className={
            'hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset sm:inline ' +
            (conIa
              ? 'bg-acento/20 text-primary-dark ring-acento/50'
              : 'bg-primary/10 text-texto/60 ring-primary/20')
          }
        >
          {conIa ? `IA: ${estado.data?.modelo ?? 'activa'}` : 'Búsqueda guiada'}
        </span>
        {mensajes.length > 0 && (
          <Button variante="ghost" onClick={limpiar} className="shrink-0 px-2 py-1 text-xs min-h-11 sm:min-h-0">
            Limpiar
          </Button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {mensajes.length === 0 ? (
            <div className="space-y-3">
              <ul>
                <li className="flex justify-start">
                  <div className="animate-pop-burbuja max-w-[92%] rounded-xl border border-primary/15 bg-surface px-3.5 py-2.5 font-serif text-sm leading-relaxed text-texto">
                    <p>
                      Hola. Dime en tus palabras qué necesitas y te busco el artículo, con
                      enlace para leerlo completo. Si ya te sabes el número, escribe por
                      ejemplo «art 151 penal».
                    </p>
                  </div>
                </li>
              </ul>
              <div>
                <p className="mb-2 font-sans text-xs font-semibold text-texto/60">
                  Preguntas que sí están en los libros
                </p>
                <div aria-label="Dudas de ejemplo" className="fila-chips pb-1 sm:flex-wrap">
                  {DUDAS_EJEMPLO.map((d) => (
                    <button
                      key={d.etiqueta}
                      type="button"
                      onClick={() => preguntar(d.pregunta, conIa)}
                      className="aprieta inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-acento/15 px-3 py-2 font-sans text-xs font-semibold text-primary-dark ring-1 ring-inset ring-acento/40 hover:bg-acento/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 sm:shrink"
                    >
                      {d.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {mensajes.map((m, i) => (
                <Burbuja
                  key={m.id}
                  mensaje={m}
                  escribiendo={enviando && i === mensajes.length - 1 && m.rol === 'asistente'}
                />
              ))}
              {mostrarSugerencias && (
                <li className="animate-aparecer px-0.5 pt-1">
                  <div aria-label="Siguientes preguntas sugeridas" className="fila-chips pb-1 sm:flex-wrap">
                    {sugerencias.map((s, i) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => preguntar(s, conIa)}
                        style={{ animationDelay: `${i * 60}ms` }}
                        className="aprieta animate-entrada inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-primary/25 bg-tarjeta px-3 py-2 font-sans text-xs text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 sm:shrink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </li>
              )}
              {!enviando && ultimaPregunta && (
                <li className="pt-1 text-center">
                  <Link
                    to={`/buscar?q=${encodeURIComponent(ultimaPregunta)}`}
                    className="font-sans text-xs text-texto/50 underline-offset-2 hover:text-primary hover:underline"
                  >
                    Ver todos los resultados de «{ultimaPregunta.slice(0, 40)}»
                  </Link>
                </li>
              )}
              <div ref={fondo} />
            </ul>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mx-4 mb-2 rounded-lg bg-derogado/10 px-3 py-2 font-sans text-xs text-derogado"
          >
            {error}
          </p>
        )}

        <form
          onSubmit={onSubmit}
          className="flex items-stretch gap-2 border-t border-primary/15 bg-surface px-4 pt-3 pb-seguro"
        >
          <input
            ref={entrada}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={300}
            aria-label="Escribe tu duda"
            placeholder={conIa ? 'Escribe tu duda…' : 'Escribe tu duda o «art 151 penal»'}
            className={
              'min-h-11 min-w-0 flex-1 rounded-lg border border-primary/25 bg-tarjeta px-3 py-2 font-sans text-base text-texto ' +
              'placeholder:text-texto/40 focus-visible:border-primary focus-visible:outline-2 ' +
              'focus-visible:outline-offset-1 focus-visible:outline-primary sm:min-h-0 sm:text-sm'
            }
          />
          {enviando ? (
            <Button variante="secondary" onClick={detener} className="min-h-11 shrink-0 px-3 sm:min-h-0">
              Detener
            </Button>
          ) : (
            <Button type="submit" className="min-h-11 shrink-0 px-4 sm:min-h-0" disabled={!texto.trim()}>
              Enviar
            </Button>
          )}
        </form>
      </main>
    </div>
  );
}
