// Zona 12 — Estado del chat del asistente: historial local, respuesta en streaming
// y los codigos `lm_*` del backend traducidos a mensajes en español.
//
// Regla de producto: no hay cuentas. La conversacion se guarda SOLO en este
// navegador (localStorage) y el device_id solo viaja para el rate limiting.
//
// El estado vive FUERA de React (un store de modulo) porque la tarjeta de la
// portada y la pantalla /asistente son la misma conversacion: quien pregunta desde
// la portada tiene que ver la respuesta ya empezada al abrir el chat, y cambiar de
// pantalla no debe cortar la generacion en curso.
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, getAsistenteGuiado, getEstadoAsistente, preguntarAsistente } from '../lib/api';
import { getDeviceId } from '../lib/device';
import { obtenerPreferencias } from '../lib/preferencias';
import type { FuenteAsistente, TurnoAsistente } from '../lib/types';

const STORAGE_KEY = 'legal.asistente.v1';

/** Turnos que se conservan en el dispositivo (y de los que se mandan los ultimos). */
const MAX_MENSAJES = 24;

/** Linea que acompana la lista de articulos cuando responde la busqueda, no la IA. */
const GUIA_LISTA = 'Esto es lo más cercano que encontré en los libros. Toca cualquiera para leerlo completo:';

export interface MensajeAsistente {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  fuentes: FuenteAsistente[];
}

export interface EstadoChat {
  mensajes: MensajeAsistente[];
  enviando: boolean;
  error: string | null;
  /** Preguntas de seguimiento de la ULTIMA respuesta (vienen del evento `fin`). */
  sugerencias: string[];
  /**
   * La IA respondio con un error definitivo (llave invalida, proyecto sin acceso,
   * modelo borrado). Desde ahi el chat va DIRECTO a los libros: /estado dice
   * `listo: true` porque solo comprueba que la llave existe, no que Google la acepte,
   * asi que seria mentira seguir prometiendo IA y hacer esperar al usuario en cada
   * pregunta. Se reinicia al recargar la pagina.
   */
  iaBloqueada: boolean;
}

function nuevoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function esFuente(v: unknown): v is FuenteAsistente {
  const f = v as FuenteAsistente | undefined;
  return Boolean(f && typeof f.n === 'number' && typeof f.numero === 'string' && typeof f.codigoSlug === 'string');
}

function esMensaje(v: unknown): v is MensajeAsistente {
  const m = v as MensajeAsistente | undefined;
  return Boolean(
    m &&
      (m.rol === 'usuario' || m.rol === 'asistente') &&
      typeof m.texto === 'string' &&
      Array.isArray(m.fuentes),
  );
}

function cargar(): MensajeAsistente[] {
  // Fase 4 — historial apagado: ni se lee lo que hubo en el telefono.
  if (!obtenerPreferencias().preferencias.guardarHistorial) return [];
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return [];
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    return datos
      .filter(esMensaje)
      .map((m) => ({ ...m, fuentes: m.fuentes.filter(esFuente) }))
      .slice(-MAX_MENSAJES);
  } catch {
    return [];
  }
}

let estado: EstadoChat = {
  mensajes: cargar(),
  enviando: false,
  error: null,
  sugerencias: [],
  iaBloqueada: false,
};
const oidores = new Set<() => void>();
let control: AbortController | null = null;

function notificar() {
  for (const oir of oidores) oir();
}

/** Se guarda al terminar (no en cada token): el historial a medias no interesa. */
function guardar() {
  if (estado.enviando) return;
  // Fase 4 — con "guardar mis preguntas" apagado la conversacion no toca el
  // almacenamiento: vive en memoria hasta cerrar la pestana.
  if (!obtenerPreferencias().preferencias.guardarHistorial) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sin almacenamiento: tampoco hace falta borrar nada */
    }
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estado.mensajes));
  } catch {
    // Almacenamiento lleno o bloqueado: el chat sigue funcionando en memoria.
  }
}

function cambiar(parcial: Partial<EstadoChat>) {
  estado = { ...estado, ...parcial };
  guardar();
  notificar();
}

function suscribir(oir: () => void) {
  oidores.add(oir);
  return () => oidores.delete(oir);
}

function obtener(): EstadoChat {
  return estado;
}

/** Mensaje amable para el usuario segun el codigo corto que devolvio el backend. */
function textoDelError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'lm_sin_configurar':
        return 'El asistente con IA todavía no está activado en el servidor. Escríbelo y te busco en los libros: funciona igual con temas y con números de artículo.';
      case 'limite_excedido':
        return 'Hiciste muchas preguntas seguidas. Espera unos minutos y vuelve a intentarlo.';
      case 'lm_cuota_excedida':
        return 'El servicio de IA está saturado en este momento. Inténtalo de nuevo en un rato.';
      case 'lm_llave_invalida':
        return 'La llave de IA del servidor no es válida. Avísame y mientras tanto te busco en los libros.';
      case 'lm_sin_acceso':
        return 'La IA está bloqueada en el servidor (le falta permiso al proyecto de Google), así que respondo buscando en los libros.';
      case 'lm_modelo_no_disponible':
        return 'El modelo de IA configurado ya no existe; hay que cambiar LLM_MODELO en el servidor. Mientras tanto busco en los libros.';
      case 'lm_timeout':
        return 'El asistente tardó demasiado en responder. Vuelve a preguntar o busca por número de artículo.';
      case 'sin_conexion':
        return 'Sin conexión no puedo consultar la IA. Los libros que ya visitaste sí siguen disponibles.';
      case 'falta_pregunta':
        return 'Escribe tu duda y te busco en los libros.';
      default:
        return 'El asistente no pudo responder ahora. Puedes seguir buscando por tema o por artículo.';
    }
  }
  return 'El asistente no pudo responder ahora. Puedes seguir buscando por tema o por artículo.';
}

export function useEstadoAsistente() {
  return useQuery({
    queryKey: ['asistente-estado'],
    queryFn: ({ signal }) => getEstadoAsistente(signal),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

/** Pone la pregunta del usuario y deja la burbuja vacia lista para ir llenandola. */
function empezarRespuesta(pregunta: string): string {
  const idRespuesta = nuevoId();
  const nuevos: MensajeAsistente[] = [
    ...estado.mensajes,
    { id: nuevoId(), rol: 'usuario', texto: pregunta, fuentes: [] },
    { id: idRespuesta, rol: 'asistente', texto: '', fuentes: [] },
  ];
  cambiar({
    mensajes: nuevos.slice(-MAX_MENSAJES),
    enviando: true,
    error: null,
    sugerencias: [],
  });
  return idRespuesta;
}

function escribirEn(idRespuesta: string, parche: (m: MensajeAsistente) => MensajeAsistente) {
  if (!estado.mensajes.some((m) => m.id === idRespuesta)) return;
  cambiar({ mensajes: estado.mensajes.map((m) => (m.id === idRespuesta ? parche(m) : m)) });
}

/**
 * Falla de la ronda: se quita la burbuja vacia (no sirve colgada) y se deja el
 * mensaje en español. `lm_cancelado` es el boton "Detener": no es un error.
 */
function reportarFalla(e: unknown, idRespuesta: string) {
  if (e instanceof ApiError && e.code === 'lm_cancelado') return;
  if (e instanceof DOMException && e.name === 'AbortError') return;
  // El detalle tecnico va a la consola (F12), no a la pantalla: el usuario ya tiene
  // su mensaje en español y el equipo necesita el codigo para saber donde fallar.
  console.warn('[asistente] falla de la búsqueda guiada:', e instanceof ApiError ? e.code : e);
  const vacia = estado.mensajes.some((m) => m.id === idRespuesta && !m.texto);
  cambiar({
    error: textoDelError(e),
    mensajes: vacia ? estado.mensajes.filter((m) => m.id !== idRespuesta) : estado.mensajes,
  });
}

/**
 * Responde con la busqueda guiada dentro de una burbuja ya abierta.
 * Es el respaldo de la IA y el modo por defecto cuando no hay llave.
 */
async function responderEnGuiado(pregunta: string, idRespuesta: string, senal?: AbortSignal) {
  try {
    const r = await getAsistenteGuiado(pregunta, senal);
    escribirEn(idRespuesta, (m) => ({
      ...m,
      texto: r.fuentes.length === 0 ? `No encontré «${pregunta}» en los libros. Prueba con otras palabras, o escribe el número (por ejemplo «art 151 penal»).` : GUIA_LISTA,
      fuentes: r.fuentes,
    }));
    cambiar({ sugerencias: r.sugerencias });
  } catch (e) {
    reportarFalla(e, idRespuesta);
  } finally {
    cambiar({ enviando: false });
  }
}

export async function buscarEnLibros(texto: string): Promise<void> {
  const pregunta = texto.trim();
  if (!pregunta || estado.enviando) return;
  await responderEnGuiado(pregunta, empezarRespuesta(pregunta));
}

/** Pregunta al proveedor de IA; la respuesta llega por streaming a esta misma conversacion. */
export function enviar(texto: string): void {
  const pregunta = texto.trim();
  if (!pregunta || estado.enviando) return;

  const historial: TurnoAsistente[] = estado.mensajes.map((m) => ({ rol: m.rol, texto: m.texto }));
  const idRespuesta = empezarRespuesta(pregunta);

  control = new AbortController();

  preguntarAsistente({
    deviceId: getDeviceId(),
    pregunta,
    historial,
    signal: control.signal,
    onToken: (trozo) => escribirEn(idRespuesta, (m) => ({ ...m, texto: m.texto + trozo })),
    onFuente: (f) => escribirEn(idRespuesta, (m) => ({ ...m, fuentes: [...m.fuentes, f] })),
  })
    .then((respuesta) => {
      control = null;
      cambiar({ sugerencias: respuesta.sugerencias, enviando: false });
    })
    .catch((e: unknown) => {
      // "Detener" no es una falla: lo ya escrito se queda, y la burbuja vacia se va.
      const cancelado =
        (e instanceof ApiError && e.code === 'lm_cancelado') ||
        (e instanceof DOMException && e.name === 'AbortError');
      if (cancelado) {
        control = null;
        const burbuja = estado.mensajes.find((m) => m.id === idRespuesta);
        if (burbuja && !burbuja.texto) {
          if (burbuja.fuentes.length > 0) {
            escribirEn(idRespuesta, (m) => ({ ...m, texto: GUIA_LISTA }));
          } else {
            cambiar({ mensajes: estado.mensajes.filter((m) => m.id !== idRespuesta) });
          }
        }
        cambiar({ enviando: false });
        return;
      }
      console.warn(
        '[asistente] la IA no respondió, sigo con los libros:',
        e instanceof ApiError ? e.code : e,
      );
      // Códigos definitivos (la llave no sirve hoy ni servirá mañana): las siguientes
      // preguntas van directas a los libros, sin esperar el timeout de la IA.
      const definitiva =
        e instanceof ApiError &&
        typeof e.code === 'string' &&
        ['lm_sin_acceso', 'lm_llave_invalida', 'lm_modelo_no_disponible', 'lm_sin_configurar'].includes(
          e.code,
        );
      // Si la IA no responde, el asistente NO deja al usuario con un error: vacia la
      // burbuja y contesta con los libros. Se avisa en una linea, no con un alert.
      escribirEn(idRespuesta, (m) => ({ ...m, texto: '', fuentes: [] }));
      cambiar({ error: textoDelError(e), ...(definitiva ? { iaBloqueada: true } : null) });
      // "Detener" tambien vale durante el respaldo: se reusa el mismo control.
      void responderEnGuiado(pregunta, idRespuesta, control?.signal).finally(() => {
        control = null;
      });
    });
}

export function detener() {
  control?.abort();
  control = null;
}

export function limpiar() {
  control?.abort();
  control = null;
  cambiar({ mensajes: [], error: null, sugerencias: [] });
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // sin almacenamiento: basta con vaciar el estado en memoria
  }
}

export interface AccionesAsistente {
  preguntar: typeof preguntar;
  enviar: typeof enviar;
  buscarEnLibros: typeof buscarEnLibros;
  detener: typeof detener;
  limpiar: typeof limpiar;
}

/** Entrada unica del chat: con llave pregunta a la IA; sin ella responde la busqueda guiada. */
function preguntar(texto: string, conIa: boolean) {
  if (conIa && !estado.iaBloqueada) {
    enviar(texto);
    return;
  }
  void buscarEnLibros(texto);
}

export function useAsistente(): EstadoChat & AccionesAsistente {
  const snapshot = useSyncExternalStore(suscribir, obtener, obtener);
  return { ...snapshot, preguntar, enviar, buscarEnLibros, detener, limpiar };
}
