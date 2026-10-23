// Zona 12 — Burbuja del chat del asistente. La comparten la tarjeta de la portada
// y la pantalla /asistente: misma conversacion, mismo aspecto.
import { Link } from 'react-router-dom';
import type { FuenteAsistente } from '../lib/types';
import type { MensajeAsistente } from '../hooks/asistente';
import { recortar } from '../lib/formato';
import { rutaArticulo } from '../lib/rutas';

/** Pinta la respuesta y convierte cada [n] en enlace al articulo que citó. */
function TextoConCitas({ texto, fuentes }: { texto: string; fuentes: FuenteAsistente[] }) {
  const porNumero = new Map(fuentes.map((f) => [f.n, f]));
  const partes = texto.split(/(\[\d+\])/g);
  return (
    <>
      {partes.map((p, i) => {
        const cita = /^\[(\d+)\]$/.exec(p);
        const fuente = cita ? porNumero.get(Number(cita[1])) : undefined;
        if (!fuente) return <span key={i}>{p}</span>;
        return (
          <Link
            key={i}
            to={rutaArticulo(fuente)}
            className="mx-0.5 rounded bg-primary/10 px-1 font-sans text-[11px] font-semibold text-primary-dark ring-1 ring-inset ring-primary/25 transition-colors hover:bg-primary/20"
          >
            {p}
          </Link>
        );
      })}
    </>
  );
}

export default function Burbuja({
  mensaje,
  escribiendo,
}: {
  mensaje: MensajeAsistente;
  escribiendo: boolean;
}) {
  const esUsuario = mensaje.rol === 'usuario';
  return (
    <li className={esUsuario ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          'animate-pop-burbuja max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm sm:max-w-[80%] ' +
          (esUsuario
            ? 'bg-primary text-sobre-primario'
            : 'border border-primary/15 bg-surface text-texto font-serif')
        }
      >
        {esUsuario ? (
          <p className="whitespace-pre-line font-sans">{mensaje.texto}</p>
        ) : (
          <>
            {mensaje.texto ? (
              <p className="whitespace-pre-line leading-relaxed">
                <TextoConCitas texto={mensaje.texto} fuentes={mensaje.fuentes} />
                {escribiendo && <span className="ml-0.5 inline-block text-acento">▍</span>}
              </p>
            ) : (
              <Puntitos texto={escribiendo ? 'Pensando…' : 'Buscando en los libros…'} />
            )}
            {mensaje.fuentes.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-primary/15 pt-2 font-sans text-xs">
                {mensaje.fuentes.map((f) => (
                  <li key={`${f.n}-${f.articuloId}`}>
                    <Link
                      to={rutaArticulo(f)}
                      className="inline-flex min-h-11 items-center gap-1 text-primary hover:text-primary-dark hover:underline sm:min-h-0"
                    >
                      <span className="font-semibold">[{f.n}]</span>
                      {recortar(`${f.codigoNombre} — art. ${f.numero}`, 70)}
                      {!f.vigente && <span className="text-derogado">(derogado)</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

// Los tres puntos se levantan uno tras otro: en móvil dicen "ya trabaja" sin un texto
// que cambie a cada rato y moviendo el layout del chat.
function Puntitos({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-2 text-texto/60">
      <span aria-hidden="true" className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="animate-punto inline-block size-1.5 rounded-full bg-primary/70"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      <span className="font-sans text-xs">{texto}</span>
    </p>
  );
}
