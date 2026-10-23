// Zona 4 — Saneado del resaltado de busqueda (campo `destacado` de la API).
//
// La API (backend/src/services/consulta.service.ts -> ts_headline) devuelve texto plano con
// etiquetas <mark>…</mark> alrededor de los terminos coincidentes. Antes de insertarlo con
// dangerouslySetInnerHTML se SANEABA: se conservan unicamente las marcas <mark>/</mark>
// (normalizadas y sin atributos) y se elimina cualquier otra etiqueta. El texto fuera de las
// marcas se conserva tal cual (se renderiza como texto del nodo, no como HTML interpretable).
// Este es el UNICO punto de la app donde se inyecta HTML, y solo para el campo confiable
// generado por el servidor.

export function sanitizarDestacado(html: string): string {
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?\/?)>/g, (match, tag: string) =>
    tag.toLowerCase() === 'mark' ? (match.startsWith('</') ? '</mark>' : '<mark>') : '',
  );
}
