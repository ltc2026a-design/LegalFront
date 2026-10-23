// Zona 7 — utilidades de formato para el admin.

/** Fecha corta legible (es-MX), con hora. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

const ROL_TEXTO: Record<string, string> = {
  administrador: 'Administrador',
  editor_legal: 'Editor legal',
};

export function rolLabel(rol: string): string {
  return ROL_TEXTO[rol] ?? rol;
}

const TIPO_TEXTO: Record<string, string> = {
  nuevo: 'Nuevo',
  modificado: 'Modificado',
  derogado: 'Derogado',
};

export function tipoLabel(tipo: string): string {
  return TIPO_TEXTO[tipo] ?? tipo;
}

// ---------- Zona 8 — vocabulario del gestor de contenido ----------

/** Clase comun para inputs/selects/textareas de los formularios del panel. */
export const CLASE_CAMPO =
  'w-full rounded-lg border border-primary/30 bg-white px-3 py-2 font-sans text-sm ' +
  'text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary';

export const TIPOS_CODIGO: { valor: string; etiqueta: string }[] = [
  { valor: 'constitucion', etiqueta: 'Constitución' },
  { valor: 'codigo_penal', etiqueta: 'Código Penal' },
  { valor: 'codigo_civil', etiqueta: 'Código Civil' },
  { valor: 'codigo_fiscal', etiqueta: 'Código Fiscal' },
  { valor: 'codigo_procedimientos', etiqueta: 'Código de Procedimientos' },
  { valor: 'ley_organica', etiqueta: 'Ley Orgánica' },
  { valor: 'otro', etiqueta: 'Otro' },
];

export const JURISDICCIONES: { valor: string; etiqueta: string }[] = [
  { valor: 'federal', etiqueta: 'Federal' },
  { valor: 'estatal_quintana_roo', etiqueta: 'Quintana Roo (estatal)' },
  { valor: 'municipal', etiqueta: 'Municipal' },
];

export const TIPOS_SECCION: { valor: string; etiqueta: string }[] = [
  { valor: 'libro', etiqueta: 'Libro' },
  { valor: 'titulo', etiqueta: 'Título' },
  { valor: 'capitulo', etiqueta: 'Capítulo' },
  { valor: 'seccion', etiqueta: 'Sección' },
];

export const METODOS_INGESTA: { valor: string; etiqueta: string }[] = [
  { valor: 'scraper', etiqueta: 'Scraper (HTML oficial)' },
  { valor: 'api', etiqueta: 'API' },
  { valor: 'manual', etiqueta: 'Manual (importación)' },
];

export const CONECTOR_KEYS: { valor: string; etiqueta: string }[] = [
  { valor: '', etiqueta: '— sin conector —' },
  { valor: 'diputados_federal', etiqueta: 'Cámara de Diputados (federal)' },
  { valor: 'fixture', etiqueta: 'Fixture local (offline)' },
  { valor: 'manual_import', etiqueta: 'Importación manual JSON' },
];

function etiquetaDe(opciones: { valor: string; etiqueta: string }[], v: string): string {
  return opciones.find((o) => o.valor === v)?.etiqueta ?? v;
}

export function tipoCodigoLabel(v: string): string {
  return etiquetaDe(TIPOS_CODIGO, v);
}

export function jurisdiccionLabel(v: string): string {
  return etiquetaDe(JURISDICCIONES, v);
}

export function metodoLabel(v: string): string {
  return etiquetaDe(METODOS_INGESTA, v);
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sinDiacriticos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Etiqueta de seccion identica a la del arbol de consulta (Zona 4). */
export function etiquetaSeccion(tipo: string, numero: string, nombre: string): string {
  const prefijo = [capitalizar(tipo), numero].filter(Boolean).join(' ');
  if (!nombre) return prefijo;
  if (!prefijo) return nombre;
  if (sinDiacriticos(nombre).startsWith(sinDiacriticos(prefijo))) return nombre;
  return `${prefijo} — ${nombre}`;
}
