// Zona 7 — revision editorial de cambios pendientes (TODO bajo requireAdmin).
//
// El motor de diff (Zona 6) NUNCA publicaba: solo dejaba filas en
// `historial_cambio_articulo` con estado=pendiente_revision. Aqui ocurre la
// PUBLICACION al APROBAR, materializando segun tipoCambio:
//   modificado -> articulo.texto = textoNuevo, vigente=true, fechaUltimaReforma=now.
//   derogado   -> articulo.vigente=false, fechaUltimaReforma=now.
//   nuevo      -> crea el articulo y le resuelve la seccion REUTILIZANDO el
//                 resolver de Zona 6: se vuelve a invocar el conector de la
//                 fuente para obtener la `rutaSecciones` del numero, se
//                 idempotentiza el arbol con `prepararSecciones` y se mapea la
//                 ruta a seccionId con `resolverSeccionId` (el historial NO
//                 guarda la ruta: solo codigoId+numero+textos, ver diff.ts).
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { EstadoCambio, TipoCambio } from '../generated/prisma/client.js';
import { notificarCambioAprobado } from '../notificaciones/notificar.js';
import { obtenerConector } from '../conectores/registro.js';
import { prepararSecciones, resolverSeccionId } from '../sincronizacion/diff.js';
import { claveSeccion } from '../conectores/tipos.js';

export const adminCambiosRouter = Router();
adminCambiosRouter.use(requireAdmin);

const TIPOS_VALIDOS: readonly string[] = Object.values(TipoCambio);

/** Construye el DTO de una fila pendiente para el listado. */
function resumenCambio(c: {
  id: string;
  tipoCambio: keyof typeof TipoCambio;
  numero: string | null;
  estado: keyof typeof EstadoCambio;
  origen: string;
  fechaDeteccion: Date;
  textoAnterior: string | null;
  textoNuevo: string;
  articuloId: string | null;
  codigo: { slug: string; nombre: string } | null;
  articulo: { esApartadoClave: boolean } | null;
}) {
  return {
    id: c.id,
    tipoCambio: c.tipoCambio,
    numero: c.numero,
    codigoSlug: c.codigo?.slug ?? null,
    codigoNombre: c.codigo?.nombre ?? null,
    estado: c.estado,
    origen: c.origen,
    fechaDeteccion: c.fechaDeteccion,
    textoAnterior: c.textoAnterior,
    textoNuevo: c.textoNuevo,
    articuloId: c.articuloId ?? undefined,
    tieneApartadoClave: c.articulo?.esApartadoClave ?? false,
  };
}

// 1) Bandeja de pendientes (estado=pendiente_revision).
adminCambiosRouter.get('/cambios-pendientes', async (req, res) => {
  const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : undefined;
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    res.status(400).json(errorJson('tipo_invalido'));
    return;
  }
  const codigoSlug =
    typeof req.query.codigo === 'string' && req.query.codigo.trim()
      ? req.query.codigo.trim()
      : undefined;

  const where: Record<string, unknown> = { estado: EstadoCambio.pendiente_revision };
  if (tipo) where.tipoCambio = tipo;
  if (codigoSlug) where.codigo = { slug: codigoSlug };

  const filas = await prisma.historialCambioArticulo.findMany({
    where,
    orderBy: { fechaDeteccion: 'desc' },
    include: {
      codigo: { select: { slug: true, nombre: true } },
      articulo: { select: { esApartadoClave: true } },
    },
  });

  const cambios = filas.map(resumenCambio);
  res.status(200).json({ total: cambios.length, cambios });
});

// Sube por la cadena de padres para construir el breadcrumb de una seccion.
async function rutaSeccionLabels(seccionId: string): Promise<string[]> {
  const partes: string[] = [];
  let actual = await prisma.seccion.findUnique({
    where: { id: seccionId },
    select: { nombre: true, seccionPadreId: true },
  });
  while (actual) {
    partes.unshift(actual.nombre);
    actual = actual.seccionPadreId
      ? await prisma.seccion.findUnique({
          where: { id: actual.seccionPadreId },
          select: { nombre: true, seccionPadreId: true },
        })
      : null;
  }
  return partes;
}

// 2) Detalle completo de un cambio para el comparador.
adminCambiosRouter.get('/cambios/:id', async (req, res) => {
  const c = await prisma.historialCambioArticulo.findUnique({
    where: { id: req.params.id },
    include: {
      codigo: { select: { id: true, slug: true, nombre: true } },
      articulo: {
        select: {
          id: true,
          numero: true,
          texto: true,
          vigente: true,
          esApartadoClave: true,
          seccionId: true,
        },
      },
    },
  });
  if (!c) {
    res.status(404).json(errorJson('cambio_no_encontrado'));
    return;
  }
  const seccionRuta = c.articulo?.seccionId ? await rutaSeccionLabels(c.articulo.seccionId) : [];

  res.status(200).json({
    id: c.id,
    tipoCambio: c.tipoCambio,
    estado: c.estado,
    origen: c.origen,
    numero: c.numero,
    fechaDeteccion: c.fechaDeteccion,
    fechaAprobacion: c.fechaAprobacion,
    textoAnterior: c.textoAnterior,
    textoNuevo: c.textoNuevo,
    articuloId: c.articuloId,
    codigo: c.codigo,
    articulo: c.articulo
      ? {
          id: c.articulo.id,
          numero: c.articulo.numero,
          texto: c.articulo.texto,
          vigente: c.articulo.vigente,
          esApartadoClave: c.articulo.esApartadoClave,
        }
      : null,
    seccionRuta,
  });
});

// 3) Aprobar: materializa el cambio segun tipoCambio y notifica.
adminCambiosRouter.post('/cambios/:id/aprobar', async (req, res) => {
  const admin = req.admin;
  if (!admin) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }
  const id = req.params.id;
  const c = await prisma.historialCambioArticulo.findUnique({
    where: { id },
    include: {
      codigo: {
        select: {
          id: true,
          slug: true,
          nombre: true,
          fuenteOficial: { select: { conectorKey: true, urlOrigen: true } },
        },
      },
      articulo: { select: { id: true, numero: true, seccionId: true } },
    },
  });
  if (!c) {
    res.status(404).json(errorJson('cambio_no_encontrado'));
    return;
  }
  if (c.estado !== EstadoCambio.pendiente_revision) {
    res.status(409).json(errorJson('ya_revisado'));
    return;
  }

  const numero = c.numero ?? c.articulo?.numero ?? '';
  const ahora = new Date();
  let articuloId = c.articuloId;

  if (c.tipoCambio === TipoCambio.nuevo) {
    if (!c.codigoId) {
      res.status(409).json(errorJson('cambio_invalido'));
      return;
    }
    const codigoId = c.codigoId;

    // Resuelve la seccion destino reutilizando Zona 6 (el historial no guarda ruta).
    let seccionId: string | null = null;
    let esApartadoClave = false;
    let vigente = true;
    const fuente = c.codigo?.fuenteOficial;
    if (fuente?.conectorKey) {
      try {
        const resultado = await obtenerConector({
          conectorKey: fuente.conectorKey,
          urlOrigen: fuente.urlOrigen,
        }).obtener();
        const art = resultado.articulos.find((a) => a.numero === numero);
        const persistidas = await prepararSecciones(codigoId, resultado.secciones, claveSeccion);
        seccionId = art ? resolverSeccionId(art.rutaSecciones, persistidas) : null;
        esApartadoClave = art?.esApartadoClave ?? false;
        vigente = art?.vigente ?? true;
      } catch {
        // Sin conector disponible: se publica igual, adjunto directo del codigo.
      }
    }

    const max = await prisma.articulo.aggregate({ where: { codigoId }, _max: { orden: true } });
    const orden = (max._max.orden ?? 0) + 1;

    const nuevo = await prisma.articulo.create({
      data: {
        codigoId,
        numero,
        texto: c.textoNuevo,
        seccionId,
        vigente,
        esApartadoClave,
        orden,
        fechaUltimaReforma: ahora,
      },
      select: { id: true },
    });
    articuloId = nuevo.id;

    await prisma.historialCambioArticulo.update({
      where: { id },
      data: {
        estado: EstadoCambio.aprobado,
        fechaAprobacion: ahora,
        aprobadoPorId: admin.id,
        articuloId: nuevo.id,
      },
    });
  } else {
    // modificado / derogado requieren el articulo ya existente.
    if (!c.articuloId) {
      res.status(409).json(errorJson('cambio_invalido'));
      return;
    }
    if (c.tipoCambio === TipoCambio.modificado) {
      await prisma.$transaction([
        prisma.articulo.update({
          where: { id: c.articuloId },
          data: { texto: c.textoNuevo, vigente: true, fechaUltimaReforma: ahora },
        }),
        prisma.historialCambioArticulo.update({
          where: { id },
          data: {
            estado: EstadoCambio.aprobado,
            fechaAprobacion: ahora,
            aprobadoPorId: admin.id,
          },
        }),
      ]);
    } else {
      // derogado
      await prisma.$transaction([
        prisma.articulo.update({
          where: { id: c.articuloId },
          data: { vigente: false, fechaUltimaReforma: ahora },
        }),
        prisma.historialCambioArticulo.update({
          where: { id },
          data: {
            estado: EstadoCambio.aprobado,
            fechaAprobacion: ahora,
            aprobadoPorId: admin.id,
          },
        }),
      ]);
    }
  }

  let notificacion = null;
  if (articuloId) {
    notificacion = await notificarCambioAprobado({
      articuloId,
      codigoNombre: c.codigo?.nombre ?? '—',
      numero,
    });
  }

  res.status(200).json({
    ok: true,
    cambio: { id, estado: EstadoCambio.aprobado, tipoCambio: c.tipoCambio, articuloId },
    notificacion,
  });
});

// 4) Rechazar: SOLO marca historial=rechazado + quien lo reviso. NO toca el articulo.
adminCambiosRouter.post('/cambios/:id/rechazar', async (req, res) => {
  const admin = req.admin;
  if (!admin) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }
  const id = req.params.id;
  const c = await prisma.historialCambioArticulo.findUnique({ where: { id } });
  if (!c) {
    res.status(404).json(errorJson('cambio_no_encontrado'));
    return;
  }
  if (c.estado !== EstadoCambio.pendiente_revision) {
    res.status(409).json(errorJson('ya_revisado'));
    return;
  }
  await prisma.historialCambioArticulo.update({
    where: { id },
    data: { estado: EstadoCambio.rechazado, aprobadoPorId: admin.id },
  });
  res.status(200).json({ ok: true, cambio: { id, estado: EstadoCambio.rechazado } });
});

// 5) Resumen barato para la cabecera del home del admin.
adminCambiosRouter.get('/dashboard/resumen', async (_req, res) => {
  const [pendientes, activas, en_pausa, con_error, codigos] = await Promise.all([
    prisma.historialCambioArticulo.count({ where: { estado: EstadoCambio.pendiente_revision } }),
    prisma.fuenteOficial.count({ where: { estado: 'activa' } }),
    prisma.fuenteOficial.count({ where: { estado: 'en_pausa' } }),
    prisma.fuenteOficial.count({ where: { estado: 'con_error' } }),
    prisma.codigo.count(),
  ]);
  res.status(200).json({
    pendientes,
    fuentes: { activas, en_pausa, con_error },
    codigos,
  });
});
