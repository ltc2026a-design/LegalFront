// Zona 12 — Tarjeta del asistente en la portada.
//
// Es la PUERTA del chat, no el chat: saludo corto, tres dudas de ejemplo y el campo.
// Al preguntar (o al tocar una duda) se abre /asistente, que es donde la conversacion
// ocupa la pantalla. La generacion no se corta al cambiar de vista porque el estado
// vive en el store de `hooks/asistente`, no en este componente.
//
// Regla de producto que obliga a que sea compacta: al entrar se tienen que ver los libros.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from './Button';
import Card from './Card';
import { useAsistente, useEstadoAsistente } from '../hooks/asistente';
import { DUDAS_EJEMPLO } from '../lib/dudas';

export default function Asistente() {
  const navigate = useNavigate();
  const estado = useEstadoAsistente();
  const { mensajes, enviando, iaBloqueada, preguntar } = useAsistente();
  // /estado solo dice si HAY llave; si Google la rechaza, el store ya marcó iaBloqueada
  // y la insignia deja de prometer IA.
  const conIa = estado.data?.listo === true && !iaBloqueada;
  const [texto, setTexto] = useState('');

  const ultimaPregunta = [...mensajes].reverse().find((m) => m.rol === 'usuario')?.texto;

  function mandar(pregunta: string) {
    const limpia = pregunta.trim();
    if (!limpia || enviando) return;
    setTexto('');
    preguntar(limpia, conIa);
    navigate('/asistente');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mandar(texto);
  }

  return (
    <Card sinAnimacion data-tour="asistente" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 bg-surface px-4 py-3">
        <h2 className="font-sans text-base font-semibold text-primary-dark">
          Asistente: pregúntame tu duda
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={
              'rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' +
              (conIa
                ? 'bg-acento/20 text-primary-dark ring-acento/50'
                : 'bg-primary/10 text-texto/60 ring-primary/20')
            }
          >
            {estado.isPending
              ? 'Comprobando…'
              : conIa
                ? `IA: ${estado.data?.modelo ?? 'activa'}`
                : 'Búsqueda guiada'}
          </span>
          {ultimaPregunta && (
            <Link
              to="/asistente"
              className="inline-flex min-h-11 items-center rounded-lg px-2 font-sans text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 sm:py-1"
            >
              Abrir chat
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {ultimaPregunta ? (
          <p className="font-sans text-sm text-texto/70">
            Sigues con «{ultimaPregunta.slice(0, 60)}».{' '}
            <Link to="/asistente" className="font-semibold text-primary hover:underline">
              Continuar el chat
            </Link>
          </p>
        ) : (
          <>
            <p className="font-serif text-sm leading-relaxed text-texto">
              Dime en tus palabras qué necesitas —un trámite, un plazo, una pena— y te digo qué
              artículo lo dice y dónde leerlo.
            </p>
            <div aria-label="Dudas de ejemplo" className="fila-chips pb-1">
              {DUDAS_EJEMPLO.slice(0, 4).map((d) => (
                <button
                  key={d.etiqueta}
                  type="button"
                  onClick={() => mandar(d.pregunta)}
                  className={
                    'aprieta inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full ' +
                    'bg-acento/15 px-3 py-2 font-sans text-xs font-semibold text-primary-dark ' +
                    'ring-1 ring-inset ring-acento/40 hover:bg-acento/25 focus-visible:outline-2 ' +
                    'focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0'
                  }
                >
                  {d.etiqueta}
                </button>
              ))}
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="flex items-stretch gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={300}
            aria-label="Escribe tu duda para el asistente"
            placeholder={conIa ? 'Escribe tu duda…' : 'Escribe tu duda o «art 151 penal»'}
            className={
              'min-h-11 min-w-0 flex-1 rounded-lg border border-primary/25 bg-tarjeta px-3 py-2 font-sans text-base text-texto ' +
              'placeholder:text-texto/40 focus-visible:border-primary focus-visible:outline-2 ' +
              'focus-visible:outline-offset-1 focus-visible:outline-primary sm:min-h-0 sm:text-sm'
            }
          />
          <Button
            type="submit"
            className="min-h-11 shrink-0 px-4 sm:min-h-0"
            disabled={!texto.trim() || enviando}
          >
            Preguntar
          </Button>
        </form>

        {!conIa && !estado.isPending && (
          <p className="font-sans text-[11px] text-texto/50">
            Sin la IA activada el asistente busca en los libros y te los enumera (también
            entiende «art 151 penal»).
          </p>
        )}
      </div>
    </Card>
  );
}
