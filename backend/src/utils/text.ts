// Zona 3: utilidades de texto para los extractos/preview de la API publica.

/** Colapsa saltos de linea y espacios multiples en un solo espacio. */
export function normalizarEspacios(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/**
 * Devuelve un preview de `texto` de hasta `max` caracteres.
 * Si hay recorte, corta en la ultima palabra cuando es posible y anade "…".
 */
export function extracto(texto: string, max: number): string {
  const plano = normalizarEspacios(texto);
  if (plano.length <= max) return plano;
  const corte = plano.slice(0, max);
  const ultimoEspacio = corte.lastIndexOf(' ');
  const fino = ultimoEspacio > max * 0.6 ? corte.slice(0, ultimoEspacio) : corte;
  return `${fino.trimEnd()}…`;
}
