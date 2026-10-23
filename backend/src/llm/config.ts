// Zona 12 — Configuracion del asistente con IA (solo lectura de entorno).
//
// La llave NUNCA sale del backend ni llega al navegador: el chat de la app de
// consulta habla con /api/asistente/* y es el servidor quien llama al proveedor.
// Sin `LLM_API_KEY` el asistente se declara no configurado y la app muestra la
// busqueda guiada, asi que la regla de producto de "funciona sin cuentas y sin
// llaves ajenas" no se rompe para nadie.
export type ProveedorLlm = 'gemini' | 'openai';

export interface ConfigLlm {
  proveedor: ProveedorLlm;
  apiKey: string;
  modelo: string;
  /** Host del proveedor; `openai` admite cualquier endpoint compatible (OpenRouter, Groq, Ollama). */
  baseUrl: string;
  /** Techo de tokens de la respuesta: el costo crece con la longitud de la respuesta. */
  maxTokens: number;
  /** Ms. para abortar la llamada (una respuesta colgada no debe congelar el chat). */
  timeoutMs: number;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_BASE = 'https://api.openai.com/v1';

function leerNum(nombre: string, defecto: number): number {
  const v = Number(process.env[nombre]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : defecto;
}

/** Configurada solo si hay llave: sin llave no tiene caso ofrecer el chat. */
export function configLlm(): ConfigLlm | null {
  const apiKey = (process.env.LLM_API_KEY ?? '').trim();
  if (!apiKey) return null;

  const proveedor: ProveedorLlm = process.env.LLM_PROVIDER === 'openai' ? 'openai' : 'gemini';
  const modeloPorDefecto = proveedor === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o-mini';

  return {
    proveedor,
    apiKey,
    modelo: (process.env.LLM_MODELO ?? '').trim() || modeloPorDefecto,
    baseUrl: (process.env.LLM_BASE_URL ?? '').trim() || (proveedor === 'gemini' ? GEMINI_BASE : OPENAI_BASE),
    maxTokens: leerNum('LLM_MAX_TOKENS', 700),
    timeoutMs: leerNum('LLM_TIMEOUT_MS', 45_000),
  };
}
