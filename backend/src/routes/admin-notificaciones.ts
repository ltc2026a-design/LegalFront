// Zona 9 — difusion GENERAL de notificaciones desde el panel (bajo requireAdmin).
//
// "Notificacion general" = aviso que NO va ligado a un articulo: se guarda como
// NotificacionCambio(enviadaATodos=true, articuloId=null, enviadaEn=now) y se
// dispara a TODOS los dispositivos registrados (web envia de verdad; nativo queda
// como stub pendiente Zona 10). Sigue vigente la regla de producto: el usuario de
// la app NO necesita cuenta; aqui solo un admin autenticado difunde.
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { enviarPush, aDestinatario } from '../notificaciones/envio.js';

export const adminNotificacionesRouter = Router();
adminNotificacionesRouter.use(requireAdmin);

const TITULO_MAX = 200;
const MENSAJE_MAX = 500;

function txt(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

// 1) Difundir un aviso general a todos los dispositivos.
//    POST /api/admin/notificaciones/general { titulo, mensaje }
adminNotificacionesRouter.post('/notificaciones/general', async (req, res) => {
  const titulo = txt(req.body?.titulo, TITULO_MAX);
  const mensaje = txt(req.body?.mensaje, MENSAJE_MAX);
  if (!titulo || !mensaje) {
    res.status(400).json(errorJson('titulo_mensaje_requeridos'));
    return;
  }

  // Fila en BD (invariante heredado de Zona 7: SIEMPRE se escribe la notificacion).
  const notificacion = await prisma.notificacionCambio.create({
    data: { titulo, mensaje, enviadaATodos: true, enviadaEn: new Date(), articuloId: null },
    select: { id: true },
  });

  // Transporte real a TODOS los dispositivos registrados (todas las plataformas).
  const dispositivos = await prisma.dispositivoPush.findMany({
    select: { id: true, tokenPush: true, plataforma: true },
  });
  const envio = await enviarPush({
    payload: { titulo, mensaje, url: '/' },
    destinatarios: dispositivos.map(aDestinatario),
  });

  res.status(200).json({
    notificacionId: notificacion.id,
    total: envio.total,
    enviados: envio.enviados,
    fallidos: envio.fallidos,
    eliminados: envio.eliminados,
    pendientes: envio.pendientes,
  });
});

// 2) Listado reciente (para la mini-vista del panel).
//    GET /api/admin/notificaciones?limit=30
adminNotificacionesRouter.get('/notificaciones', async (req, res) => {
  const raw = Number(req.query.limit);
  const limite = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 100) : 30;

  const filas = await prisma.notificacionCambio.findMany({
    orderBy: [{ enviadaEn: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take: limite,
    include: {
      articulo: { select: { numero: true, codigo: { select: { nombre: true, slug: true } } } },
    },
  });

  const notificaciones = filas.map((n) => ({
    id: n.id,
    titulo: n.titulo,
    mensaje: n.mensaje,
    enviadaEn: n.enviadaEn ? n.enviadaEn.toISOString() : null,
    enviadaATodos: n.enviadaATodos,
    articuloId: n.articuloId,
    contextoArticulo: n.articulo ? `${n.articulo.codigo.nombre} · art. ${n.articulo.numero}` : null,
  }));

  res.status(200).json({ total: notificaciones.length, notificaciones });
});
