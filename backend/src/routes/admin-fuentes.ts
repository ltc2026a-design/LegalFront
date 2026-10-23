// Zona 8 — gestion de FUENTES OFICIALES del admin (todo bajo requireAdmin).
//
// "Forzar sincronizacion" delega por completo en el orquestador de Zona 6
// (`ejecutarSincronizacion`): NUNCA publica, deja pendientes y captura el fallo
// del conector sin tumbar el proceso (fuente -> con_error, tarea -> fallida).
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { ejecutarSincronizacion } from '../sincronizacion/orquestador.js';
import { CONECTOR_KEYS } from '../conectores/registro.js';
import {
  ENUM_JURISDICCION,
  ENUM_METODO_INGESTA,
  boolOpcional,
  esValorDe,
  strOpcional,
} from '../services/contenido.service.js';

export const adminFuentesRouter = Router();
adminFuentesRouter.use(requireAdmin);

function resumen(f: {
  id: string;
  nombre: string;
  jurisdiccion: string;
  urlOrigen: string;
  metodoIngesta: string;
  conectorKey: string | null;
  frecuenciaSincronizacion: string;
  ultimaSincronizacionEn: Date | null;
  estado: string;
  _count: { codigos: number };
}) {
  return {
    id: f.id,
    nombre: f.nombre,
    jurisdiccion: f.jurisdiccion,
    urlOrigen: f.urlOrigen,
    metodoIngesta: f.metodoIngesta,
    conectorKey: f.conectorKey,
    frecuenciaSincronizacion: f.frecuenciaSincronizacion,
    ultimaSincronizacionEn: f.ultimaSincronizacionEn,
    estado: f.estado,
    totalCodigos: f._count.codigos,
  };
}

/** Valida campos comunes de alta/edicion; devuelve el codigo de error o null. */
function validarCampos(body: Record<string, unknown>, obligatorio: boolean): string | null {
  if (obligatorio) {
    if (!strOpcional(body.nombre)) return 'nombre_requerido';
    if (!strOpcional(body.urlOrigen)) return 'url_origen_requerida';
    if (!strOpcional(body.frecuenciaSincronizacion)) return 'frecuencia_requerida';
    if (!esValorDe(ENUM_JURISDICCION, body.jurisdiccion)) return 'jurisdiccion_invalida';
    if (!esValorDe(ENUM_METODO_INGESTA, body.metodoIngesta)) return 'metodo_invalido';
  }
  if (body.jurisdiccion !== undefined && !esValorDe(ENUM_JURISDICCION, body.jurisdiccion)) {
    return 'jurisdiccion_invalida';
  }
  if (body.metodoIngesta !== undefined && !esValorDe(ENUM_METODO_INGESTA, body.metodoIngesta)) {
    return 'metodo_invalido';
  }
  if (body.conectorKey !== undefined && body.conectorKey !== null) {
    const key = strOpcional(body.conectorKey);
    if (key && !CONECTOR_KEYS.includes(key as (typeof CONECTOR_KEYS)[number])) {
      return 'conector_desconocido';
    }
  }
  return null;
}

adminFuentesRouter.get('/fuentes', async (_req, res) => {
  const fuentes = await prisma.fuenteOficial.findMany({
    include: { _count: { select: { codigos: true } } },
    orderBy: [{ jurisdiccion: 'asc' }, { nombre: 'asc' }],
  });
  res.status(200).json({ fuentes: fuentes.map(resumen) });
});

adminFuentesRouter.post('/fuentes', async (req, res) => {
  const err = validarCampos(req.body ?? {}, true);
  if (err) {
    res.status(400).json(errorJson(err));
    return;
  }
  const creada = await prisma.fuenteOficial.create({
    data: {
      nombre: (req.body.nombre as string).trim(),
      jurisdiccion: req.body.jurisdiccion,
      urlOrigen: (req.body.urlOrigen as string).trim(),
      metodoIngesta: req.body.metodoIngesta,
      frecuenciaSincronizacion: (req.body.frecuenciaSincronizacion as string).trim(),
      conectorKey: strOpcional(req.body.conectorKey),
    },
    include: { _count: { select: { codigos: true } } },
  });
  res.status(201).json(resumen(creada));
});

adminFuentesRouter.patch('/fuentes/:id', async (req, res) => {
  const existente = await prisma.fuenteOficial.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!existente) {
    res.status(404).json(errorJson('fuente_no_encontrada'));
    return;
  }
  const err = validarCampos(req.body ?? {}, false);
  if (err) {
    res.status(400).json(errorJson(err));
    return;
  }
  const data: Record<string, unknown> = {};
  const nombre = strOpcional(req.body?.nombre);
  if (nombre !== null) data.nombre = nombre;
  const url = strOpcional(req.body?.urlOrigen);
  if (url !== null) data.urlOrigen = url;
  const frecuencia = strOpcional(req.body?.frecuenciaSincronizacion);
  if (frecuencia !== null) data.frecuenciaSincronizacion = frecuencia;
  if (req.body?.jurisdiccion !== undefined) data.jurisdiccion = req.body.jurisdiccion;
  if (req.body?.metodoIngesta !== undefined) data.metodoIngesta = req.body.metodoIngesta;
  if (req.body?.conectorKey !== undefined) {
    data.conectorKey = strOpcional(req.body.conectorKey); // null = desvincular conector
  }

  const actualizada = await prisma.fuenteOficial.update({
    where: { id: existente.id },
    data,
    include: { _count: { select: { codigos: true } } },
  });
  res.status(200).json(resumen(actualizada));
});

// Pausar/Reactivar. REGLA: pausar NO pisa un estado con_error (la senal de
// error debe verse hasta que la fuente vuelva a funcionar o se reactive).
adminFuentesRouter.post('/fuentes/:id/pausa', async (req, res) => {
  const existente = await prisma.fuenteOficial.findUnique({
    where: { id: req.params.id },
    select: { id: true, estado: true },
  });
  if (!existente) {
    res.status(404).json(errorJson('fuente_no_encontrada'));
    return;
  }
  const activa = boolOpcional(req.body?.activa);
  if (activa === null) {
    res.status(400).json(errorJson('activa_requerida'));
    return;
  }

  const destino = activa ? 'activa' : existente.estado === 'con_error' ? 'con_error' : 'en_pausa';
  const actualizada = await prisma.fuenteOficial.update({
    where: { id: existente.id },
    data: { estado: destino },
    include: { _count: { select: { codigos: true } } },
  });
  res.status(200).json({ ...resumen(actualizada), conservoError: !activa && existente.estado === 'con_error' });
});

// Forzar sincronizacion YA: reutiliza el orquestador de Zona 6 (no publica,
// deja pendientes; un fallo de red termina en fallida/con_error sin caer).
adminFuentesRouter.post('/fuentes/:id/sincronizar', async (req, res) => {
  const fuente = await prisma.fuenteOficial.findUnique({
    where: { id: req.params.id },
    select: { id: true, conectorKey: true },
  });
  if (!fuente) {
    res.status(404).json(errorJson('fuente_no_encontrada'));
    return;
  }
  if (!fuente.conectorKey) {
    res.status(400).json(errorJson('fuente_sin_conector'));
    return;
  }

  const resultado = await ejecutarSincronizacion(fuente.id);
  const [tarea, actualizada] = await Promise.all([
    prisma.tareaSincronizacion.findUnique({
      where: { id: resultado.tareaId },
      select: { estado: true, cambiosDetectados: true, log: true },
    }),
    prisma.fuenteOficial.findUnique({
      where: { id: fuente.id },
      select: { estado: true, ultimaSincronizacionEn: true },
    }),
  ]);

  res.status(200).json({
    ok: resultado.estado !== 'fallida',
    sincronizacion: {
      fuenteOficialId: resultado.fuenteOficialId,
      tareaId: resultado.tareaId,
      estado: resultado.estado,
      cambiosDetectados: resultado.cambiosDetectados,
      error: resultado.error ?? null,
    },
    tarea,
    fuente: actualizada,
  });
});
