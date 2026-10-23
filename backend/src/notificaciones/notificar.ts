// Zona 7 — gancho de notificacion al APROBAR un cambio.
//
// Regla: SIEMPRE se escribe la fila en BD (`notificacion_cambio`); el ENVIO real
// se delega ahora en el TRANSPORTE de Zona 9 (`enviarPush`), que dispatchea por
// plataforma (Web Push VAPID real hoy; FCM/APNs/desktop stub). No se toco CUANDO
// se llama (flujo de aprobacion de Zona 7 intacto) ni la escritura en BD.
import { prisma } from '../lib/prisma.js';
import { enviarPush, aDestinatario } from './envio.js';
import type { ResultadoEnvio } from './envio.js';

export interface CambioAprobadoInput {
  articuloId: string;
  codigoNombre: string;
  numero: string;
}

export interface ResultadoNotificacion {
  notificacionId: string;
  destinatarios: number;
  envio: ResultadoEnvio;
}

/**
 * Crea la notificacion (BD) asociada al articulo publicado y dispara el push
 * REAL a los dispositivos de los usuarios que tienen ese articulo en favoritos.
 */
export async function notificarCambioAprobado(
  input: CambioAprobadoInput,
): Promise<ResultadoNotificacion> {
  const titulo = `Reforma legal: ${input.codigoNombre}`;
  const mensaje = `El artículo ${input.numero} de ${input.codigoNombre} fue actualizado y ya está publicado.`;

  // 1) Escritura en BD (general, ligada al articulo).
  const notificacion = await prisma.notificacionCambio.create({
    data: {
      articuloId: input.articuloId,
      titulo,
      mensaje,
      enviadaATodos: true,
      enviadaEn: new Date(),
    },
    select: { id: true },
  });

  // Ruta a abrir al hacer clic en el aviso: la construimos desde el slug del
  // codigo (si el articulo sigue existiendo); si no, el aviso abre el inicio.
  const articulo = await prisma.articulo.findUnique({
    where: { id: input.articuloId },
    select: { codigo: { select: { slug: true } } },
  });
  const url = articulo
    ? `/codigo/${articulo.codigo.slug}/articulo/${encodeURIComponent(input.numero)}`
    : '/';

  // 2) Transporte (Zona 9): dispositivos de quien siga este articulo.
  const favoritos = await prisma.favorito.findMany({
    where: { articuloId: input.articuloId },
    select: {
      usuarioApp: {
        select: { dispositivosPush: { select: { id: true, tokenPush: true, plataforma: true } } },
      },
    },
  });

  const destinatarios = favoritos
    .flatMap((fav) => fav.usuarioApp?.dispositivosPush ?? [])
    .map(aDestinatario);

  const envio = await enviarPush({
    payload: { titulo, mensaje, url, articuloId: input.articuloId },
    destinatarios,
  });

  return { notificacionId: notificacion.id, destinatarios: envio.total, envio };
}
