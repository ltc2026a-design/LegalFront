// Zona 5 — Identidad del dispositivo.
//
// Regla de producto: el usuario NUNCA crea una cuenta. La unica identidad de la
// app de consulta es un `device_id` aleatorio generado en este mismo navegador
// y persistido en localStorage; ese id es la clave de sus favoritos.
const STORAGE_KEY = 'legal.deviceId';

/** Valor en memoria por si localStorage no esta disponible (modo privado / Cuota). */
let memoria: string | null = null;

/** UUIDv4 con fallback para entornos sin crypto.randomUUID (http no seguro). */
function nuevoId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback: uuid v4 con getRandomValues o, en el peor caso, Math.random.
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Devuelve el device_id estable del navegador, generandolo y guardandolo la
 * primera vez. Nunca lanza: si el almacenamiento falla, usa el valor en memoria
 * (los favoritos no se podran recuperar tras recargar, pero la app sigue usable).
 */
/** Lee el id guardado; null si no hay o el almacenamiento no esta disponible. */
function leerIdGuardado(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Formato esperado: un UUID (o equivalente) seguro para usar como clave. */
const FORMA_VALIDA = /^[A-Za-z0-9-]{8,64}$/;

export function getDeviceId(): string {
  if (memoria) return memoria;

  let id = leerIdGuardado();
  if (!id || !FORMA_VALIDA.test(id)) {
    id = nuevoId();
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sin localStorage: seguimos con el id en memoria durante esta sesion.
    }
  }

  memoria = id;
  return id;
}

/** Clave de localStorage usada por el device_id (util para pruebas/depuracion). */
export const DEVICE_ID_STORAGE_KEY = STORAGE_KEY;
