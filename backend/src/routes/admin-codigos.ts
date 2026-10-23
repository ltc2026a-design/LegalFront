// Zona 8 — CRUD de codigos/leyes del admin (todo bajo requireAdmin).
//
// Alta/edicion/borrado de Codigos + el arbol completo (/estructura) que alimenta
// el editor del panel. Lo que aqui se escribe se PUBLICA de inmediato: la API
// publica de consulta (Zona 3) lee `codigo`/`seccion`/`articulo` en crudo, asi
// que un codigo nuevo aparece en /api/codigos sin paso adicional.
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  ENUM_JURISDICCION,
  ENUM_TIPO_CODIGO,
  esValorDe,
  fechaOpcional,
  slugUnico,
  strOpcional,
} from '../services/contenido.service.js';
import type { Jurisdiccion } from '../generated/prisma/client.js';

export const adminCodigosRouter = Router();
adminCodigosRouter.use(requireAdmin);

const ORDEN_JURISDICCION: Record<string, number> = {
  federal: 0,
  estatal_quintana_roo: 1,
  municipal: 2,
};

function resumenLista(c: {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  jurisdiccion: string;
  versionVigente: string;
  fechaUltimaReforma: Date | null;
  fuenteOficialId: string | null;
  _count: { articulos: number; secciones: number };
  fuenteOficial: { nombre: string } | null;
}) {
  return {
    id: c.id,
    slug: c.slug,
    nombre: c.nombre,
    tipo: c.tipo,
    jurisdiccion: c.jurisdiccion,
    versionVigente: c.versionVigente,
    fechaUltimaReforma: c.fechaUltimaReforma,
    totalArticulos: c._count.articulos,
    totalSecciones: c._count.secciones,
    fuenteOficialId: c.fuenteOficialId,
    fuenteNombre: c.fuenteOficial?.nombre ?? null,
  };
}

// Lista para el panel (jurisdiccion -> nombre).
adminCodigosRouter.get('/codigos', async (_req, res) => {
  const codigos = await prisma.codigo.findMany({
    include: {
      fuenteOficial: { select: { nombre: true } },
      _count: { select: { articulos: true, secciones: true } },
    },
  });
  codigos.sort(
    (a, b) =>
      (ORDEN_JURISDICCION[a.jurisdiccion] ?? 99) - (ORDEN_JURISDICCION[b.jurisdiccion] ?? 99) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
  res.status(200).json({ codigos: codigos.map(resumenLista) });
});

// Alta: slug automatico desde el nombre (sin acentos) si no se envia.
adminCodigosRouter.post('/codigos', async (req, res) => {
  const nombre = strOpcional(req.body?.nombre);
  if (!nombre) {
    res.status(400).json(errorJson('nombre_requerido'));
    return;
  }
  if (!esValorDe(ENUM_TIPO_CODIGO, req.body?.tipo)) {
    res.status(400).json(errorJson('tipo_invalido'));
    return;
  }
  if (!esValorDe(ENUM_JURISDICCION, req.body?.jurisdiccion)) {
    res.status(400).json(errorJson('jurisdiccion_invalida'));
    return;
  }
  const fuenteOficialId = strOpcional(req.body?.fuenteOficialId);
  if (fuenteOficialId) {
    const f = await prisma.fuenteOficial.findUnique({
      where: { id: fuenteOficialId },
      select: { id: true },
    });
    if (!f) {
      res.status(400).json(errorJson('fuente_inexistente'));
      return;
    }
  }
  const slug = await slugUnico(strOpcional(req.body?.slug) ?? nombre);

  const creado = await prisma.codigo.create({
    data: {
      nombre,
      tipo: req.body.tipo,
      jurisdiccion: req.body.jurisdiccion as Jurisdiccion,
      descripcion: strOpcional(req.body?.descripcion) ?? '',
      versionVigente: strOpcional(req.body?.versionVigente) ?? 'Texto vigente',
      fechaUltimaReforma: fechaOpcional(req.body?.fechaUltimaReforma),
      fuenteOficialId,
      slug,
    },
  });
  res.status(201).json(creado);
});

// Edicion (incluye versionVigente / fechaUltimaReforma / fuenteOficialId).
adminCodigosRouter.patch('/codigos/:id', async (req, res) => {
  const existente = await prisma.codigo.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!existente) {
    res.status(404).json(errorJson('codigo_no_encontrado'));
    return;
  }

  const data: Record<string, unknown> = {};
  const nombre = strOpcional(req.body?.nombre);
  if (nombre !== null) data.nombre = nombre;
  const descripcion = strOpcional(req.body?.descripcion);
  if (descripcion !== null) data.descripcion = descripcion;
  const version = strOpcional(req.body?.versionVigente);
  if (version !== null) data.versionVigente = version;
  if (req.body?.tipo !== undefined) {
    if (!esValorDe(ENUM_TIPO_CODIGO, req.body.tipo)) {
      res.status(400).json(errorJson('tipo_invalido'));
      return;
    }
    data.tipo = req.body.tipo;
  }
  if (req.body?.jurisdiccion !== undefined) {
    if (!esValorDe(ENUM_JURISDICCION, req.body.jurisdiccion)) {
      res.status(400).json(errorJson('jurisdiccion_invalida'));
      return;
    }
    data.jurisdiccion = req.body.jurisdiccion;
  }
  if (req.body?.fechaUltimaReforma !== undefined) {
    data.fechaUltimaReforma = fechaOpcional(req.body.fechaUltimaReforma);
  }
  if (req.body?.fuenteOficialId !== undefined) {
    const fuenteId = strOpcional(req.body.fuenteOficialId);
    if (fuenteId) {
      const f = await prisma.fuenteOficial.findUnique({
        where: { id: fuenteId },
        select: { id: true },
      });
      if (!f) {
        res.status(400).json(errorJson('fuente_inexistente'));
        return;
      }
    }
    data.fuenteOficialId = fuenteId;
  }
  const slug = strOpcional(req.body?.slug);
  if (slug) {
    const tomado = await prisma.codigo.findUnique({ where: { slug }, select: { id: true } });
    if (tomado && tomado.id !== req.params.id) {
      res.status(409).json(errorJson('slug_en_uso'));
      return;
    }
    data.slug = slug;
  }

  const actualizado = await prisma.codigo.update({ where: { id: req.params.id }, data });
  res.status(200).json(actualizado);
});

// Borrado con cascada (secciones + articulos; el historial ligado tambien cae).
adminCodigosRouter.delete('/codigos/:id', async (req, res) => {
  const codigo = await prisma.codigo.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      _count: { select: { articulos: true, secciones: true } },
    },
  });
  if (!codigo) {
    res.status(404).json(errorJson('codigo_no_encontrado'));
    return;
  }
  await prisma.codigo.delete({ where: { id: codigo.id } });
  res.status(200).json({
    ok: true,
    eliminados: {
      codigo: true,
      articulos: codigo._count.articulos,
      secciones: codigo._count.secciones,
    },
  });
});

// ---------- Estructura completa para el editor ----------

interface ArtFila {
  id: string;
  numero: string;
  texto: string;
  esApartadoClave: boolean;
  vigente: boolean;
  orden: number;
}

const ordenArticulosEditor = (a: ArtFila, b: ArtFila): number => a.orden - b.orden;

adminCodigosRouter.get('/codigos/:slug/estructura', async (req, res) => {
  const codigo = await prisma.codigo.findUnique({
    where: { slug: req.params.slug },
    include: {
      fuenteOficial: { select: { id: true, nombre: true } },
      secciones: true,
      articulos: {
        select: {
          id: true,
          numero: true,
          texto: true,
          esApartadoClave: true,
          vigente: true,
          orden: true,
          seccionId: true,
        },
      },
    },
  });
  if (!codigo) {
    res.status(404).json(errorJson('codigo_no_encontrado'));
    return;
  }

  const artsPorSeccion = new Map<string, ArtFila[]>();
  const sinSeccion: ArtFila[] = [];
  for (const a of codigo.articulos) {
    const fila: ArtFila = {
      id: a.id,
      numero: a.numero,
      texto: a.texto,
      esApartadoClave: a.esApartadoClave,
      vigente: a.vigente,
      orden: a.orden,
    };
    if (a.seccionId) {
      const arr = artsPorSeccion.get(a.seccionId) ?? [];
      arr.push(fila);
      artsPorSeccion.set(a.seccionId, arr);
    } else {
      sinSeccion.push(fila);
    }
  }

  interface Nodo {
    id: string;
    tipo: string;
    numero: string;
    nombre: string;
    orden: number;
    articulos: ArtFila[];
    hijos: Nodo[];
  }
  type SeccionPlana = (typeof codigo.secciones)[number];
  const idsValidos = new Set(codigo.secciones.map((s) => s.id));
  const hijosPorPadre = new Map<string, SeccionPlana[]>();
  const raices: SeccionPlana[] = [];
  for (const s of codigo.secciones) {
    const padreId = s.seccionPadreId && idsValidos.has(s.seccionPadreId) ? s.seccionPadreId : null;
    if (padreId) {
      const arr = hijosPorPadre.get(padreId) ?? [];
      arr.push(s);
      hijosPorPadre.set(padreId, arr);
    } else {
      raices.push(s);
    }
  }

  const ordenSecciones = (a: SeccionPlana, b: SeccionPlana): number =>
    a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');

  function nodoDe(s: SeccionPlana): Nodo {
    const hijos = (hijosPorPadre.get(s.id) ?? []).slice().sort(ordenSecciones).map(nodoDe);
    return {
      id: s.id,
      tipo: s.tipo as string,
      numero: s.numero,
      nombre: s.nombre,
      orden: s.orden,
      articulos: (artsPorSeccion.get(s.id) ?? []).slice().sort(ordenArticulosEditor),
      hijos,
    };
  }

  res.status(200).json({
    codigo: {
      id: codigo.id,
      slug: codigo.slug,
      nombre: codigo.nombre,
      tipo: codigo.tipo,
      jurisdiccion: codigo.jurisdiccion,
      descripcion: codigo.descripcion,
      versionVigente: codigo.versionVigente,
      fechaUltimaReforma: codigo.fechaUltimaReforma,
      fuenteOficialId: codigo.fuenteOficialId,
      fuenteNombre: codigo.fuenteOficial?.nombre ?? null,
    },
    secciones: raices.slice().sort(ordenSecciones).map(nodoDe),
    sinSeccion: sinSeccion.sort(ordenArticulosEditor),
  });
});
