// Zona 12 — Cliente del modelo de lenguaje, con streaming de tokens.
//
// Solo dos cosas hace: armar la solicitud del proveedor (Gemini REST o cualquier
// endpoint compatible con OpenAI) y entregar los fragmentos de texto conforme
// llegan. El contexto legal NO se arma aqui (eso es asistente.service.ts), asi
// este archivo se puede probar y cambiar de proveedor sin tocar la recuperacion.
//
// Los errores se convierten a codigos cortos (`lm_*`) que si se pueden mandar al
// cliente: el cuerpo de la respuesta del proveedor nunca se reenvia porque puede
// traer la llave o datos de la cuenta.
import { configLlm, type ConfigLlm } from './config.js';

export class ErrorLlm extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorLlm';
    this.codigo = codigo;
  }
}

export interface Turno {
  rol: 'usuario' | 'asistente';
  texto: string;
}

export interface PedidoLlm {
  sistema: string;
  turnos: Turno[];
  /** Llamado con cada fragmento de texto recibido (para ir pintando la respuesta). */
  onFragmento?: (fragmento: string) => void;
  senal?: AbortSignal;
}

/**
 * Codigo `lm_*` para una respuesta de error del proveedor. El cuerpo importa, no
 * solo el estado: Google usa 403 tanto para una llave mal puesta como para un
 * proyecto al que le cortaron el acceso, y el usuario necesita saber cual de los
 * dos arreglar.
 */
export function codigoPorFalla(status: number, detalle: string): string {
  if (status === 401) return 'lm_llave_invalida';
  if (/api key not valid|invalid api key|API_KEY_INVALID/i.test(detalle)) return 'lm_llave_invalida';
  if (status === 404) return 'lm_modelo_no_disponible';
  if (status === 429) return 'lm_cuota_excedida';
  if (status === 403) return 'lm_sin_acceso';
  return 'lm_no_responde';
}

/** URL + cabeceras + cuerpo, segun el dialecto del proveedor. */
function construirPeticion(cfg: ConfigLlm, sistema: string, turnos: Turno[]): { url: string; headers: Record<string, string>; cuerpo: string } {
  const historial = turnos.map((t) => ({
    role: t.rol === 'usuario' ? 'user' : cfg.proveedor === 'gemini' ? 'model' : 'assistant',
    content: t.texto,
  }));

  if (cfg.proveedor === 'gemini') {
    return {
      url: `${cfg.baseUrl}/models/${encodeURIComponent(cfg.modelo)}:streamGenerateContent?alt=sse`,
      headers: { 'x-goog-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
      cuerpo: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: historial.map((h) => ({ role: h.role, parts: [{ text: h.content }] })),
        generationConfig: { temperature: 0.2, maxOutputTokens: cfg.maxTokens },
      }),
    };
  }

  return {
    url: `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    cuerpo: JSON.stringify({
      model: cfg.modelo,
      messages: [{ role: 'system', content: sistema }, ...historial],
      temperature: 0.2,
      max_tokens: cfg.maxTokens,
      stream: true,
    }),
  };
}

/** Forma (parcial) del evento SSE: Gemini usa `candidates`, OpenAI `choices`. */
interface RespuestaProveedor {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  choices?: { error?: { message?: string }; delta?: { content?: string } }[];
}

/** Saca el texto de un evento SSE del dialecto que sea. */
function fragmentoDeEvento(dialecto: 'gemini' | 'openai', datos: string): string {
  if (datos === '[DONE]') return '';
  let obj: unknown;
  try {
    obj = JSON.parse(datos);
  } catch {
    return '';
  }
  const raiz = obj as RespuestaProveedor;
  if (dialecto === 'gemini') {
    const partes = raiz?.candidates?.[0]?.content?.parts ?? [];
    return partes.map((p: { text?: string }) => p?.text ?? '').join('');
  }
  const eleccion = raiz?.choices?.[0];
  if (eleccion?.error) throw new ErrorLlm('lm_no_responde', String(eleccion.error.message ?? 'eleccion con error'));
  return eleccion?.delta?.content ?? '';
}

/** Consume el cuerpo SSE invocando onFragmento con cada trozo de texto. */
async function leerSse(
  cuerpo: ReadableStream<Uint8Array>,
  dialecto: 'gemini' | 'openai',
  onFragmento: (fragmento: string) => void,
): Promise<void> {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let sobra = '';

  for (;;) {
    const { value: trozo, done } = await lector.read();
    if (done) break;
    sobra += decodificador.decode(trozo, { stream: true });

    // Los eventos SSE terminan en salto de linea; lo que no este completo se queda
    // en `sobra` para el siguiente bloque (los fragmentos llegan cortados por mitad).
    const lineas = sobra.split(/\r?\n/);
    sobra = lineas.pop() ?? '';
    for (const linea of lineas) {
      const dato = linea.trim();
      if (!dato.startsWith('data:')) continue;
      const texto = fragmentoDeEvento(dialecto, dato.slice(5).trim());
      if (texto) onFragmento(texto);
    }
  }
}

/**
 * Genera la respuesta del asistente. Lanza ErrorLlm con un codigo `lm_*` ante
 * cualquier falla del proveedor; `onFragmento` puede haber recibido texto antes.
 */
export async function generar(pedido: PedidoLlm): Promise<string> {
  const cfg = configLlm();
  if (!cfg) throw new ErrorLlm('lm_sin_configurar', 'No hay LLM_API_KEY en el backend.');

  const { url, headers, cuerpo } = construirPeticion(cfg, pedido.sistema, pedido.turnos);
  const senal = pedido.senal
    ? AbortSignal.any([pedido.senal, AbortSignal.timeout(cfg.timeoutMs)])
    : AbortSignal.timeout(cfg.timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: cuerpo, signal: senal });
  } catch (e) {
    if (pedido.senal?.aborted) throw new ErrorLlm('lm_cancelado', 'El usuario corto la respuesta.');
    throw new ErrorLlm('lm_sin_respuesta', `El proveedor no contesto: ${(e as Error).message}`);
  }

  if (!res.ok || !res.body) {
    const detalle = (await res.text().catch(() => '')).slice(0, 300);
    throw new ErrorLlm(codigoPorFalla(res.status, detalle), `Proveedor ${res.status}: ${detalle}`);
  }

  let acumulado = '';
  try {
    await leerSse(res.body, cfg.proveedor, (fragmento) => {
      acumulado += fragmento;
      pedido.onFragmento?.(fragmento);
    });
  } catch (e) {
    if (e instanceof ErrorLlm) throw e;
    if (pedido.senal?.aborted) throw new ErrorLlm('lm_cancelado', 'El usuario corto la respuesta.');
    throw new ErrorLlm('lm_sin_respuesta', `Respuesta incompleta: ${(e as Error).message}`);
  }

  if (!acumulado.trim()) throw new ErrorLlm('lm_vacio', 'El proveedor devolvio texto vacio.');
  return acumulado;
}

/** Para pruebas: permite inyectar un generador falso con la misma firma. */
export type Generador = (pedido: PedidoLlm) => Promise<string>;
export const generarConLlm: Generador = generar;
