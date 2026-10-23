// Zona 12 — Dudas de ejemplo del chat. Se muestran como preguntas de persona (no como
// términos de búsqueda) y cada una tiene respuesta en los 9 libros del acervo: están
// probadas contra GET /api/asistente/guiado, que es lo que contesta cuando no hay IA.

export interface Duda {
  /** Lo que se ve en el chip: corto, sin signos. */
  etiqueta: string;
  /** Lo que se pregunta al tocar el chip. */
  pregunta: string;
}

export const DUDAS_EJEMPLO: Duda[] = [
  { etiqueta: 'Pensión alimenticia', pregunta: '¿Cómo pido una pensión alimenticia?' },
  { etiqueta: 'Información pública', pregunta: '¿Cómo pido acceso a la información pública?' },
  { etiqueta: 'Divorcio', pregunta: '¿Qué necesito para divorciarme?' },
  { etiqueta: 'Amparo', pregunta: '¿Contra qué puedo promover un amparo?' },
  { etiqueta: 'Multas municipales', pregunta: '¿Qué pasa si no pago una multa municipal?' },
  { etiqueta: 'Servidores públicos', pregunta: '¿De qué responden los servidores públicos?' },
];
