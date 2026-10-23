// Zona 8 — estructura y articulos MANUALES del admin (todo bajo requireAdmin).
//
// Secciones: alta/edicion/reorden con cualquier profundidad (auto-relacion del
// schema). El borrado de una seccion elimina sus hijas (Cascade) y DEJA VIVOS
// los articulos que colgaban de ella: la relacion Articulo.seccion usa
// onDelete: SetNull (confirmado en schema.prisma), asi que pasan al grupo
// "sin seccion".
//
// Articulos: cada alta/edicion manual se PUBLICA y registra historial
// origen=edicion_manual + estado=aprobado (ver contenido.service.ts). El lote
// (batch) es la via rapida de carga y reutiliza el reconciliador de secciones
// de Zona 6 para las `rutaSecciones`.
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  ENUM_TIPO_SECCION,
  boolOpcional,
  cargarLoteArticulos,
  crearArticuloPublicado,
  esValorDe,
  fechaOpcional,
  importarArchivoManual,
  registrarEdicionManualTexto,
  strOpcional,
} from '../services/contenido.service.js';
import { notificarCambioAprobado } from '../notificaciones/notificar.js';

export const adminEstructuraRouter = Router();
adminEstructuraRouter.use(requireAdmin);

const MAX_LOTE = 2000;

async function codigoExiste(id: string): Promise<boolean> {
  const c = await prisma.codigo.findUnique({ where: { id }, select: { id: true } });
  return Boolean(c);
}

/** Valida que la seccion exista y pertenezca al codigo. Devuelve su id o null. */
async function seccionDelCodigo(id: string, codigoId: string): Promise<string | null> {
  const s = await prisma.seccion.findFirst({ where: { id, codigoId }, select: { id: true } });
  return s?.id ?? null;
}

// ---------- Secciones ----------

adminEstructuraRouter.post('/codigos/:id/secciones', async (req, res) => {
  if (!(await codigoExiste(req.params.id))) {
    res.status(404).json(errorJson('codigo_no_encontrado'));
    return;
  }
  if (!esValorDe(ENUM_TIPO_SECCION, req.body?.tipo)) {
    res.status(400).json(errorJson('tipo_invalido'));
    return;
  }
  const numero = strOpcional(req.body?.numero);
  const nombre = strOpcional(req.body?.nombre);
  if (!numero || !nombre) {
    res.status(400).json(errorJson('numero_nombre_requeridos'));
    return;
  }
  const seccionPadreId = strOpcional(req.body?.seccionPadreId);
  if (seccionPadreId && !(await seccionDelCodigo(seccionPadreId, req.params.id))) {
    res.status(400).json(errorJson('padre_no_pertenece_codigo'));
    return;
  }
  const ordenRaw = Number(req.body?.orden);
  const orden =
    Number.isFinite(ordenRaw) && ordenRaw >= 0
      ? Math.floor(ordenRaw)
      : ((
          await prisma.seccion.aggregate({
            where: { codigoId: req.params.id, seccionPadreId },
            _max: { orden: true },
          })
        )._max.orden ?? 0) + 1;

  const creada = await prisma.seccion.create({
    data: { codigoId: req.params.id, tipo: req.body.tipo, numero, nombre, orden, seccionPadreId },
  });
  res.status(201).json(creada);
});

adminEstructuraRouter.patch('/secciones/:id', async (req, res) => {
  const existente = await prisma.seccion.findUnique({
    where: { id: req.params.id },
    select: { id: true, codigoId: true },
  });
  if (!existente) {
    res.status(404).json(errorJson('seccion_no_encontrada'));
    return;
  }

  const data: Record<string, unknown> = {};
  if (req.body?.tipo !== undefined) {
    if (!esValorDe(ENUM_TIPO_SECCION, req.body.tipo)) {
      res.status(400).json(errorJson('tipo_invalido'));
      return;
    }
    data.tipo = req.body.tipo;
  }
  const numero = strOpcional(req.body?.numero);
  if (numero !== null) data.numero = numero;
  const nombre = strOpcional(req.body?.nombre);
  if (nombre !== null) data.nombre = nombre;
  const ordenRaw = Number(req.body?.orden);
  if (Number.isFinite(ordenRaw) && ordenRaw >= 0) data.orden = Math.floor(ordenRaw);

  if (req.body?.seccionPadreId !== undefined) {
    const padreId = strOpcional(req.body.seccionPadreId);
    if (padreId) {
      if (padreId === existente.id) {
        res.status(400).json(errorJson('ciclo_no_permitido'));
        return;
      }
      if (!(await seccionDelCodigo(padreId, existente.codigoId))) {
        res.status(400).json(errorJson('padre_no_pertenece_codigo'));
        return;
      }
      // Anti-ciclo: subir desde el padre propuesto y comprobar que no llega al nodo.
      let cursor = padreId;
      const visitadas = new Set<string>([cursor]);
      for (;;) {
        const p = await prisma.seccion.findUnique({
          where: { id: cursor },
          select: { seccionPadreId: true },
        });
        const siguiente = p?.seccionPadreId;
        if (!siguiente) break;
        if (siguiente === existente.id || visitadas.has(siguiente)) {
          res.status(400).json(errorJson('ciclo_no_permitido'));
          return;
        }
        visitadas.add(siguiente);
        cursor = siguiente;
      }
    }
    data.seccionPadreId = padreId;
  }

  const actualizada = await prisma.seccion.update({ where: { id: existente.id }, data });
  res.status(200).json(actualizada);
});

adminEstructuraRouter.delete('/secciones/:id', async (req, res) => {
  const existente = await prisma.seccion.findUnique({
    where: { id: req.params.id },
    select: { id: true, codigoId: true, _count: { select: { articulos: true } } },
  });
  if (!existente) {
    res.status(404).json(errorJson('seccion_no_encontrada'));
    return;
  }
  // Cascade: se eliminan las sub-secciones. Articulos: SetNull (se conservan).
  await prisma.seccion.delete({ where: { id: existente.id } });
  res.status(200).json({
    ok: true,
    articulosDesvinculados: existente._count.articulos,
  });
});

adminEstructuraRouter.post('/codigos/:id/secciones/orden', async (req, res) => {
  if (!(await codigoExiste(req.params.id))) {
    res.status(404).json(errorJson('codigo_no_encontrado'));
    return;
  }
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) {
    res.status(400).json(errorJson('items_requeridos'));
    return;
  }
  const operaciones = [];
  for (const raw of items) {
    const id = typeof raw?.id === 'string' ? raw.id : '';
    const orden = Number(raw?.orden);
    if (!id || !Number.isFinite(orden)) {
      res.status(400).json(errorJson('items_invalidos'));
      return;
    }
    if (!(await seccionDelCodigo(id, req.params.id))) {
      res.status(400).json(errorJson('seccion_no_pertenece_codigo'));
      return;
    }
    operaciones.push(prisma.seccion.update({ where: { id }, data: { orden: Math.floor(orden) } }));
  }
  await prisma.$transaction(operaciones);
  res.status(200).json({ ok: true, actualizados: operaciones.length });
});

// ---------- Articulos ----------

adminEstructuraRouter.post('/codigos/:id/articulos', async (req, res) => {
  if (!(await codigoExiste(req.params.id))) {
    res.status(404).json(errorJson('codigo_no_encontrado'));
    return;
  }
  const numero = strOpcional(req.body?.numero);
  const texto = strOpcional(req.body?.texto);
  if (!numero || !texto) {
    res.status(400).json(errorJson('numero_texto_requeridos'));
    return;
  }
  const duplicado = await prisma.articulo.findFirst({
    where: { codigoId: req.params.id, numero },
    select: { id: true },
  });
  if (duplicado) {
    res.status(409).json(errorJson('numero_duplicado'));
    return;
  }
  const admin = req.admin;
  if (!admin) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }
  let seccionId: string | null = null;
  const seccionRaw = strOpcional(req.body?.seccionId);
  if (seccionRaw) {
    seccionId = await seccionDelCodigo(seccionRaw, req.params.id);
    if (!seccionId) {
      res.status(400).json(errorJson('seccion_no_pertenece_codigo'));
      return;
    }
  }
  const ordenRaw = Number(req.body?.orden);
  const articulo = await crearArticuloPublicado({
    codigoId: req.params.id,
    numero,
    texto,
    seccionId,
    esApartadoClave: boolOpcional(req.body?.esApartadoClave) ?? false,
    vigente: boolOpcional(req.body?.vigente) ?? true,
    orden: Number.isFinite(ordenRaw) && ordenRaw >= 0 ? Math.floor(ordenRaw) : undefined,
    adminId: admin.id,
  });
  const codigo = await prisma.codigo.findUnique({
    where: { id: req.params.id },
    select: { nombre: true },
  });
  const notificacion = codigo
    ? await notificarCambioAprobado({
        articuloId: articulo.id,
        codigoNombre: codigo.nombre,
        numero,
      })
    : null;
  res
    .status(201)
    .json({ articulo, historial: { origen: 'edicion_manual', estado: 'aprobado' }, notificacion });
});

adminEstructuraRouter.patch('/articulos/:id', async (req, res) => {
  const anterior = await prisma.articulo.findUnique({
    where: { id: req.params.id },
    select: { id: true, codigoId: true, numero: true, texto: true },
  });
  if (!anterior) {
    res.status(404).json(errorJson('articulo_no_encontrado'));
    return;
  }
  const admin = req.admin;
  if (!admin) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }

  const numero = strOpcional(req.body?.numero);
  const texto = strOpcional(req.body?.texto);
  const seccionRaw = req.body?.seccionId === undefined ? undefined : strOpcional(req.body.seccionId);

  const numeroFinal = numero ?? anterior.numero;
  if (numero && numero !== anterior.numero) {
    const colision = await prisma.articulo.findFirst({
      where: { codigoId: anterior.codigoId, numero },
      select: { id: true },
    });
    if (colision) {
      res.status(409).json(errorJson('numero_duplicado'));
      return;
    }
  }
  let seccionId: string | null | undefined;
  if (seccionRaw !== undefined) {
    if (seccionRaw === null) {
      seccionId = null;
    } else {
      seccionId = await seccionDelCodigo(seccionRaw, anterior.codigoId);
      if (!seccionId) {
        res.status(400).json(errorJson('seccion_no_pertenece_codigo'));
        return;
      }
    }
  }

  const data: Record<string, unknown> = {};
  if (numero !== null) data.numero = numero;
  if (texto !== null) data.texto = texto;
  if (seccionId !== undefined) data.seccionId = seccionId;
  const clave = boolOpcional(req.body?.esApartadoClave);
  if (clave !== null) data.esApartadoClave = clave;
  const vigente = boolOpcional(req.body?.vigente);
  if (vigente !== null) data.vigente = vigente;
  if (req.body?.fechaUltimaReforma !== undefined) {
    data.fechaUltimaReforma = fechaOpcional(req.body.fechaUltimaReforma);
  }

  const articulo = await prisma.articulo.update({ where: { id: anterior.id }, data });

  // Unico caso que genera historial: cambio de TEXTO (edicion_manual aprobado).
  // Los toggles esApartadoClave/vigente se auditan con actualizadoEn.
  let historialRegistrado = false;
  let notificacion = null;
  if (texto !== null && texto !== anterior.texto) {
    await registrarEdicionManualTexto({
      articuloId: anterior.id,
      codigoId: anterior.codigoId,
      numero: numeroFinal,
      textoAnterior: anterior.texto,
      textoNuevo: texto,
      adminId: admin.id,
    });
    historialRegistrado = true;
    const codigo = await prisma.codigo.findUnique({
      where: { id: anterior.codigoId },
      select: { nombre: true },
    });
    if (codigo) {
      notificacion = await notificarCambioAprobado({
        articuloId: anterior.id,
        codigoNombre: codigo.nombre,
        numero: numeroFinal,
      });
    }
  }

  res.status(200).json({ articulo, historialRegistrado, notificacion });
});

adminEstructuraRouter.delete('/articulos/:id', async (req, res) => {
  const existente = await prisma.articulo.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!existente) {
    res.status(404).json(errorJson('articulo_no_encontrado'));
    return;
  }
  // Borrado duro (no es derogacion): Favorito/Notificacion/Historial caen por
  // las relaciones del schema.
  await prisma.articulo.delete({ where: { id: existente.id } });
  res.status(200).json({ ok: true });
});

// ---------- Carga en lote (la estrella de la Zona 8) ----------

adminEstructuraRouter.post('/codigos/:id/articulos/batch', async (req, res) => {
  if (!(await codigoExiste(req.params.id))) {
    res.status(404).json(errorJson('codigo_no_encontrado'));
    return;
  }
  const admin = req.admin;
  if (!admin) {
    res.status(401).json(errorJson('no_autenticado'));
    return;
  }

  // Via alternativa: importar el JSON del conector manual de Zona 6.
  const archivo = strOpcional(req.body?.archivo);
  if (req.body?.importFrom === 'conector_manual') {
    if (!archivo) {
      res.status(400).json(errorJson('archivo_requerido'));
      return;
    }
    try {
      const resultado = await importarArchivoManual(req.params.id, admin.id, archivo);
      res.status(200).json(resultado);
      return;
    } catch (err) {
      res.status(400).json(errorJson(`archivo_invalido: ${err instanceof Error ? err.message.split('\n')[0] : 'error'}`));
      return;
    }
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items || items.length === 0) {
    res.status(400).json(errorJson('items_requeridos'));
    return;
  }
  if (items.length > MAX_LOTE) {
    res.status(400).json(errorJson('lote_demasiado_grande'));
    return;
  }

  const resultado = await cargarLoteArticulos(req.params.id, admin.id, items);
  // El lote NO notifica articulo por articulo: es carga inicial/masiva. Las
  // ediciones sueltas (POST/PATCH) si publican con su notificacion en BD.
  res.status(200).json(resultado);
});
