// Fase 4 — Los cuatro bloques de configuracion de la persona:
//   lectura (tema + tamaño de letra), libro anclado, avisos con franja de silencio,
//   e historial/privacidad.
//
// Todo se escribe en el store de lib/preferencias.ts: localStorage siempre y, si hay
// sesion, PATCH a la cuenta. Por eso aqui NO hay hooks de datos propios: la pantalla
// lee y escribe el mismo store que aplica el tema al documento.
import { useState } from 'react';
import Button from './Button';
import Card from './Card';
import { useCodigos } from '../hooks/consulta';
import { limpiar } from '../hooks/asistente';
import { enSilencio, fijar, usePreferencias } from '../lib/preferencias';
import {
  activarPushDesdeGesto,
  desuscribirPush,
  estadoPermiso,
  estaSuscrito,
  pushDisponible,
} from '../lib/push';

const OPCIONES_TEMA = [
  { valor: 'auto', etiqueta: 'Automático', nota: 'el del teléfono' },
  { valor: 'claro', etiqueta: 'Claro', nota: 'fondo blanco' },
  { valor: 'oscuro', etiqueta: 'Oscuro', nota: 'para leer de noche' },
] as const;

const PASO_LETRA = 5;
const LETRA_MIN = 85;
const LETRA_MAX = 140;

function Interruptor({
  activo,
  onCambiar,
  etiqueta,
  deshabilitado = false,
}: {
  activo: boolean;
  onCambiar: (v: boolean) => void;
  etiqueta: string;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambiar(!activo)}
      className={
        'aprieta relative h-11 w-[52px] shrink-0 rounded-full border transition-colors duration-200 ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
        (activo
          ? 'border-primary bg-primary'
          : 'border-primary/30 bg-surface') +
        (deshabilitado ? ' cursor-not-allowed opacity-50' : '')
      }
    >
      <span
        aria-hidden="true"
        className={
          'absolute top-1/2 size-7 -translate-y-1/2 rounded-full bg-tarjeta shadow-sm ' +
          'transition-[left] duration-200 ' +
          (activo ? 'left-[22px]' : 'left-[3px]')
        }
      />
    </button>
  );
}

function Titulo({ children, nota }: { children: string; nota?: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="font-serif text-lg font-bold text-texto">{children}</h2>
      {nota && <p className="text-xs text-texto/55">{nota}</p>}
    </div>
  );
}

export default function Preferencias() {
  const { preferencias: prefs } = usePreferencias();
  const codigos = useCodigos();
  const [avisos, setAvisos] = useState<string | null>(null);
  const [mensajeHistorial, setMensajeHistorial] = useState<string | null>(null);
  const [procesandoAvisos, setProcesandoAvisos] = useState(false);

  const soportaAvisos = pushDisponible();
  const permiso = estadoPermiso();
  const nombreLibro = codigos.data?.codigos.find((c) => c.slug === prefs.codigoFavorito)?.nombre;
  const enFranja = enSilencio(prefs);

  async function cambiarAvisos(nuevo: boolean) {
    setProcesandoAvisos(true);
    setAvisos(null);
    if (nuevo) {
      // El permiso nativo se pide AQUI, dentro del toque (regla de Zona 9: nunca solo).
      const r = await activarPushDesdeGesto();
      if (r.ok) {
        fijar({ notificaciones: true });
      } else if (r.estado === 'denegado') {
        setAvisos('El navegador tiene las notificaciones bloqueadas. Se activan desde su configuración.');
      } else if (r.estado === 'no-soportado') {
        setAvisos('Tu navegador no admite avisos.');
      } else {
        setAvisos('No se pudo activar ahora. Inténtalo de nuevo.');
      }
    } else {
      await desuscribirPush();
      fijar({ notificaciones: false });
      setAvisos('Avisos apagados en este dispositivo.');
    }
    setProcesandoAvisos(false);
  }

  return (
    <div className="space-y-4">
      {/* ---------- Lectura ---------- */}
      <Card className="space-y-4 p-5">
        <Titulo nota="Se aplican al instante en toda la app y quedan guardadas.">
          Cómo lees
        </Titulo>

        <div role="radiogroup" aria-label="Tema de la app" className="grid grid-cols-3 gap-2">
          {OPCIONES_TEMA.map((o) => {
            const activo = prefs.tema === o.valor;
            return (
              <button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => fijar({ tema: o.valor })}
                className={
                  'aprieta min-h-11 rounded-xl border px-2 py-2 text-center text-sm font-semibold ' +
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 ' +
                  (activo
                    ? 'border-primary bg-primary/10 text-primary-dark'
                    : 'border-primary/20 bg-tarjeta text-texto/70 hover:bg-primary/5')
                }
              >
                {o.etiqueta}
                <span className="block text-[11px] font-normal text-texto/50">{o.nota}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-texto/70">Tamaño de la letra</span>
            <div className="flex items-center gap-2">
              <Button
                variante="secondary"
                aria-label="Letra más pequeña"
                disabled={prefs.tamanoLetra <= LETRA_MIN}
                onClick={() =>
                  fijar({ tamanoLetra: Math.max(LETRA_MIN, prefs.tamanoLetra - PASO_LETRA) })
                }
                className="toque px-3"
              >
                A−
              </Button>
              <span
                aria-live="polite"
                className="w-12 text-center font-serif text-sm font-bold text-primary-dark"
              >
                {prefs.tamanoLetra}%
              </span>
              <Button
                variante="secondary"
                aria-label="Letra más grande"
                disabled={prefs.tamanoLetra >= LETRA_MAX}
                onClick={() =>
                  fijar({ tamanoLetra: Math.min(LETRA_MAX, prefs.tamanoLetra + PASO_LETRA) })
                }
                className="toque px-3"
              >
                A+
              </Button>
            </div>
          </div>
          {/* Muestra del tamaño real: el articulo se ve igual que en su pagina. */}
          <p className="texto-legal font-serif rounded-lg bg-surface px-3 py-2 text-texto/80">
            Artículo 1o. — En los Estados Unidos Mexicanos todas las personas gozarán de los
            derechos humanos...
          </p>
        </div>
      </Card>

      {/* ---------- Libro anclado ---------- */}
      <Card className="space-y-3 p-5">
        <Titulo nota="El primer libro que ves al abrir la app.">Tu libro principal</Titulo>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-texto/50">
            Código
          </span>
          <select
            aria-label="Libro principal"
            value={prefs.codigoFavorito ?? ''}
            onChange={(e) => fijar({ codigoFavorito: e.target.value || null })}
            disabled={codigos.isPending}
            className={
              'min-h-11 w-full rounded-lg border border-primary/25 bg-tarjeta px-3 py-2 text-base ' +
              'text-texto focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 ' +
              'focus-visible:outline-primary sm:min-h-0 sm:text-sm'
            }
          >
            <option value="">Ninguno (muestreme la biblioteca completa)</option>
            {codigos.data?.codigos.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {nombreLibro && (
          <p className="text-xs text-texto/60">
            Ahora verás «{nombreLibro}» arriba de la portada.
          </p>
        )}
      </Card>

      {/* ---------- Avisos ---------- */}
      <Card className="space-y-4 p-5">
        <Titulo nota="Solo avisos de reformas de tus artículos guardados.">
          Avisos y horario de silencio
        </Titulo>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-texto">Recibir avisos</p>
            <p className="text-xs text-texto/55">
              {soportaAvisos
                ? permiso === 'denied'
                  ? 'El navegador bloqueó las notificaciones.'
                  : estaSuscrito()
                    ? 'Este dispositivo está suscrito.'
                    : 'Se activan con un aviso del navegador.'
                : 'Este navegador no admite avisos.'}
            </p>
          </div>
          <Interruptor
            activo={prefs.notificaciones && estaSuscrito()}
            deshabilitado={!soportaAvisos || procesandoAvisos}
            etiqueta="Recibir avisos de reformas"
            onCambiar={(v) => void cambiarAvisos(v)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-texto/50">
              Silencio desde
            </span>
            <input
              type="time"
              aria-label="Hora en que empiezan los avisos silenciosos"
              value={prefs.silencioDesde ?? ''}
              onChange={(e) => fijar({ silencioDesde: e.target.value || null })}
              className={
                'min-h-11 w-full rounded-lg border border-primary/25 bg-tarjeta px-3 py-2 text-base ' +
                'text-texto focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 ' +
                'focus-visible:outline-primary sm:min-h-0 sm:text-sm'
              }
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-texto/50">
              hasta
            </span>
            <input
              type="time"
              aria-label="Hora en que dejan de ser silenciosos los avisos"
              value={prefs.silencioHasta ?? ''}
              onChange={(e) => fijar({ silencioHasta: e.target.value || null })}
              className={
                'min-h-11 w-full rounded-lg border border-primary/25 bg-tarjeta px-3 py-2 text-base ' +
                'text-texto focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 ' +
                'focus-visible:outline-primary sm:min-h-0 sm:text-sm'
              }
            />
          </label>
        </div>

        {(prefs.silencioDesde || prefs.silencioHasta) && (
          <p className={enFranja ? 'text-xs font-medium text-acento' : 'text-xs text-texto/60'}>
            {enFranja
              ? 'Ahora mismo estás en horario de silencio: los avisos llegan sin sonido.'
              : 'Fuera de esas horas, los avisos suenan normal.'}
          </p>
        )}
        {(prefs.silencioDesde || prefs.silencioHasta) && (
          <Button
            variante="ghost"
            className="min-h-11 sm:min-h-0"
            onClick={() => fijar({ silencioDesde: null, silencioHasta: null })}
          >
            Quitar el horario de silencio
          </Button>
        )}

        {avisos && (
          <p role="status" className="text-xs font-medium text-derogado">
            {avisos}
          </p>
        )}
      </Card>

      {/* ---------- Historial y privacidad ---------- */}
      <Card className="space-y-4 p-5">
        <Titulo nota="Nada de esto se sube: vive en este teléfono.">
          Historial y privacidad
        </Titulo>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-texto">Guardar mis preguntas</p>
            <p className="text-xs text-texto/55">
              Si lo apagas, el chat con el asistente no se conserva al cerrar la app.
            </p>
          </div>
          <Interruptor
            activo={prefs.guardarHistorial}
            etiqueta="Guardar el historial de preguntas"
            onCambiar={(v) => {
              fijar({ guardarHistorial: v });
              // Apagarlo tambien borra lo ya guardado: "no conservar" no puede dejar rastro.
              if (!v) limpiar();
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variante="secondary"
            className="min-h-11 sm:min-h-0"
            onClick={() => {
              limpiar();
              setMensajeHistorial('Listo: se borraron tus preguntas de este teléfono.');
            }}
          >
            Borrar mis preguntas
          </Button>
          {mensajeHistorial && (
            <span role="status" className="text-xs font-medium text-vigente">
              {mensajeHistorial}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
