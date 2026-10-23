// Zona 4 — Utilidades de presentacion (fechas y etiquetas de jurisdiccion/tipo).

/** "2024-06-15T00:00:00Z" -> "15 jun 2024" (es-MX). Null-seguro. */
export function fmtFecha(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Las fechas oficiales se guardan a medianoche UTC; sin timeZone el navegador
  // las retrocede un dia en zonas del oeste (México, UTC-6).
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(d)
    .replace(/\./g, '');
}

/**
 * Extracto corto de un texto (Zona 5): se usa para pintar al instante la
 * tarjeta de un favorito creado en modo optimista, antes de que el servidor
 * devuelva su propio extracto. Recorta en palabra cuando es posible.
 */
export function recortar(texto: string, max = 140): string {
  const plano = texto.replace(/\s+/g, ' ').trim();
  if (plano.length <= max) return plano;
  const corte = plano.slice(0, max);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return `${(ultimoEspacio > max * 0.6 ? corte.slice(0, ultimoEspacio) : corte).trimEnd()}…`;
}

/**
 * Iniciales del avatar de la cuenta (Fase 3): "Ana Pérez" -> "AP", un nombre -> "A",
 * y si no hay nombre usa el correo ("ana@x.mx" -> "A"). Maximo 2 letras, en mayusculas.
 */
export function iniciales(nombreOEmail: string): string {
  const base = nombreOEmail.trim();
  if (!base) return '?';
  if (base.includes('@')) return base[0].toUpperCase();
  const partes = base.split(/\s+/).filter(Boolean);
  const letras = (partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '');
  return letras.toUpperCase() || '?';
}

/** Etiqueta legible de la jurisdiccion (clave interna -> titulo del grupo). */
export const ETIQUETA_JURISDICCION: Record<string, string> = {
  federal: 'Federal',
  estatal_quintana_roo: 'Quintana Roo',
  municipal: 'Municipal',
};

export function etiquetaJurisdiccion(j: string): string {
  return ETIQUETA_JURISDICCION[j] ?? j;
}

/** Etiqueta legible del tipo de documento. */
const ETIQUETA_TIPO: Record<string, string> = {
  constitucion: 'Constitución',
  ley: 'Ley',
  codigo: 'Código',
  reglamento: 'Reglamento',
  constitucion_local: 'Constitución local',
};

export function etiquetaTipo(tipo: string): string {
  return ETIQUETA_TIPO[tipo] ?? tipo;
}

/** Orden de agrupacion exigido por la spec: federal > estatal > municipal. */
const ORDEN_JURISDICCION: Record<string, number> = {
  federal: 0,
  estatal_quintana_roo: 1,
  municipal: 2,
};

export function ordenJurisdiccion(j: string): number {
  return ORDEN_JURISDICCION[j] ?? 99;
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Normaliza para comparar: minusculas y sin diacriticos. */
function sinDiacriticos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Etiqueta de una seccion (nodo del arbol o migaja) sin duplicar informacion.
 * Si el `nombre` ya empieza con el tipo/numero ("Título Primero — De las garantías…"),
 * se usa solo el nombre; si no, se antepone "Tipo Numero — nombre".
 */
export function etiquetaSeccion(
  tipo: string | null,
  numero: string | null,
  nombre: string,
): string {
  const prefijo = [tipo ? capitalizar(tipo) : '', numero ?? ''].filter(Boolean).join(' ');
  if (!nombre) return prefijo;
  if (!prefijo) return nombre;
  if (sinDiacriticos(nombre).startsWith(sinDiacriticos(prefijo))) return nombre;
  return `${prefijo} — ${nombre}`;
}
