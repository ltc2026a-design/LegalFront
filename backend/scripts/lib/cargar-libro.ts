// Pipeline comun de carga de LIBROS COMPLETOS: escribe en Postgres el resultado
// de un analizador de texto oficial (Markdown de Lex MX o PDF del POE).
//
// Reglas de negocio que aqui se mantienen:
//  - Todo lo que se carga por importacion deja bitacora en historial_cambio_articulo
//    con origen "edicion_manual" y estado "aprobado" (Zona 7/8: la bandeja de
//    revision es para los conectores, no para la carga certificada del dueño).
//  - --limpiar reconstruye el libro desde cero; NUNCA toca los cambios que aun
//    estan pendientes de revision.
import { prisma } from '../../src/lib/prisma.js';

export type TipoNivel = 'libro' | 'titulo' | 'capitulo' | 'seccion';

export interface Nivel {
  tipo: TipoNivel;
  numero: string;
  nombre: string;
}

export interface ArticuloImport {
  numero: string;
  texto: string;
  ruta: Nivel[];
  /// Fecha de la ultima reforma declarada en las notas editoriales del articulo.
  fechaReforma?: Date | null;
}

export interface MetaLibro {
  /// Nombre corto para los mensajes ("CPF", "Código Civil QR").
  sigla: string;
  /// "DOF" para leyes federales, "POE" para códigos estatales/municipales.
  etiqueta: string;
  /// AAAA-MM-DD de la ultima reforma que declara el documento.
  ultimaReforma: string;
  /// Lineas que se guardan en la bitacora de sincronizacion (trazabilidad).
  procedencia: string[];
}

export interface OpcionesCarga {
  seco?: boolean;
  reescribir?: boolean;
  limpiar?: boolean;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function cargarLibro(slug: string, meta: MetaLibro, importados: ArticuloImport[], opciones: OpcionesCarga = {}): Promise<void> {
  const seco = Boolean(opciones.seco);
  const reescribir = Boolean(opciones.reescribir);
  const limpiar = Boolean(opciones.limpiar);
  const prefijo = `[cargar:${meta.sigla}]`;

  // En el documento consolidado los transitorios cierran el libro, pero la nota
  // preliminar los cita al inicio; el orden estable los deja al final.
  importados.sort((a, b) => (/^\d/.test(a.numero) ? 0 : 1) - (/^\d/.test(b.numero) ? 0 : 1));

  const codigo = await prisma.codigo.findUnique({ where: { slug } });
  if (!codigo) {
    console.error(`${prefijo} No existe codigo con slug "${slug}".`);
    process.exit(1);
  }

  if (limpiar && !seco) {
    // Reconstruccion completa del libro: se retiran los articulos y el arbol
    // generados por una importacion previa (con sus favoritos/historial
    // encadenados) para reemplazarlos por el texto de la fuente definitiva.
    const idsArts = (await prisma.articulo.findMany({ where: { codigoId: codigo.id }, select: { id: true } })).map((a) => a.id);
    const hist = await prisma.historialCambioArticulo.deleteMany({
      where: { estado: { not: 'pendiente_revision' }, OR: [{ codigoId: codigo.id }, { articuloId: { in: idsArts } }] },
    });
    const secs = await prisma.seccion.deleteMany({ where: { codigoId: codigo.id } });
    const arts = await prisma.articulo.deleteMany({ where: { id: { in: idsArts } } });
    console.log(`${prefijo} limpiados ${arts.count} articulos, ${secs.count} secciones, ${hist.count} registros de historial.`);
  }

  const existentes = await prisma.articulo.findMany({ where: { codigoId: codigo.id }, select: { id: true, numero: true, texto: true, fechaUltimaReforma: true } });
  const mapExistentes = new Map(existentes.map((a) => [a.numero, a]));
  const numsImport = new Set(importados.map((a) => a.numero));
  const sinMatch = importados.filter((a) => !mapExistentes.has(a.numero));
  const huerfanas = existentes.filter((a) => !numsImport.has(a.numero));
  console.log(`${prefijo} ${importados.length} articulos | coincidencias ${importados.length - sinMatch.length} | huerfanas en BD ${huerfanas.length}`);
  if (sinMatch.length) console.log('  nuevos ejemplo:', sinMatch.slice(0, 8).map((a) => a.numero).join(', '));
  if (huerfanas.length) console.log('  huerfanas ejemplo:', huerfanas.slice(0, 8).map((a) => `${a.numero}(${a.texto.length})`).join(', '));

  if (seco) {
    const cambioTexto = importados.filter((a) => {
      const prev = mapExistentes.get(a.numero);
      return prev && prev.texto !== a.texto;
    }).length;
    console.log(`${prefijo} SECO: ${cambioTexto} textos diferirian, ${sinMatch.length} serian nuevos, ${huerfanas.length} sobrarian. Nada escrito.`);
    return;
  }

  const cacheSecciones = new Map<string, string>();
  const contadores = new Map<string, number>();
  for (const s of await prisma.seccion.findMany({ where: { codigoId: codigo.id }, orderBy: { orden: 'asc' } })) {
    cacheSecciones.set(claveSeccion(s.seccionPadreId ?? 'root', s.tipo, s.numero, s.nombre), s.id);
    const hermanoKey = `${s.seccionPadreId ?? 'root'}:`;
    contadores.set(hermanoKey, Math.max(contadores.get(hermanoKey) ?? 0, s.orden));
  }

  const asegurar = async (ruta: Nivel[]): Promise<string | null> => {
    let padreId: string | null = null;
    for (const nivel of ruta) {
      const key = claveSeccion(padreId ?? 'root', nivel.tipo, nivel.numero, nivel.nombre);
      const previo = cacheSecciones.get(key);
      if (previo) {
        padreId = previo;
        continue;
      }
      const hermanoKey = `${padreId ?? 'root'}:`;
      const ordenHijo = (contadores.get(hermanoKey) ?? 0) + 1;
      contadores.set(hermanoKey, ordenHijo);
      const creado = await prisma.seccion.create({ data: { codigoId: codigo.id, seccionPadreId: padreId, tipo: nivel.tipo, numero: nivel.numero, nombre: nivel.nombre, orden: ordenHijo } });
      cacheSecciones.set(key, creado.id);
      padreId = creado.id;
    }
    return padreId;
  };

  let creados = 0;
  let actualizados = 0;
  let corregidos = 0;
  let iguales = 0;
  const historial: { articuloId: string; numero: string; tipo: 'nuevo' | 'modificado'; anterior: string | null; nuevo: string }[] = [];
  const correcciones: { articuloId: string; nuevo: string }[] = [];

  // El arbol de secciones se construye de forma estrictamente secuencial: si
  // dos articulos vecinos resolvieran la misma ruta en paralelo, ambos verian
  // la cache vacia y crearian nodos duplicados (mismo tipo/numero/hermano).
  const rutas: (string | null)[] = new Array(importados.length);
  for (let i = 0; i < importados.length; i++) {
    rutas[i] = await asegurar(importados[i].ruta);
    if (i % 2000 === 0) console.log(`${prefijo} arbol ${i}/${importados.length} ...`);
  }

  const procesar = async (a: ArticuloImport, idx: number): Promise<void> => {
    const prev = mapExistentes.get(a.numero);
    // Articulo que el documento oficial lista como derogado: se marca para que
    // la app lo muestre asi, pero su texto sigue siendo consultable. El \b evita
    // marcar los transitorios que empiezan con "Se derogan todas las...".
    const vigente = !/^(?:\(\s*se deroga\s*\)|derogad[oa]s?\b|se deroga\b)/i.test(a.texto);
    const fecha = a.fechaReforma ?? prev?.fechaUltimaReforma ?? null;
    if (prev && prev.texto === a.texto) {
      if (fecha && !prev.fechaUltimaReforma) await prisma.articulo.update({ where: { id: prev.id }, data: { fechaUltimaReforma: fecha } });
      iguales += 1;
      return;
    }
    const seccionId = rutas[idx];
    if (prev) {
      await prisma.articulo.update({ where: { id: prev.id }, data: { texto: a.texto, seccionId, vigente, fechaUltimaReforma: fecha, orden: idx + 1, actualizadoEn: new Date() } });
      if (reescribir) {
        corregidos += 1;
        correcciones.push({ articuloId: prev.id, nuevo: a.texto });
      } else {
        historial.push({ articuloId: prev.id, numero: a.numero, tipo: 'modificado', anterior: prev.texto, nuevo: a.texto });
        actualizados += 1;
      }
    } else {
      const nuevo = await prisma.articulo.create({ data: { codigoId: codigo.id, seccionId, numero: a.numero, texto: a.texto, vigente, fechaUltimaReforma: fecha, orden: idx + 1 } });
      historial.push({ articuloId: nuevo.id, numero: a.numero, tipo: 'nuevo', anterior: null, nuevo: a.texto });
      creados += 1;
    }
  };

  for (let i = 0; i < importados.length; i += 25) {
    const corte = importados.slice(i, i + 25);
    await Promise.all(corte.map((a, j) => procesar(a, i + j)));
    if (i % 600 === 0) console.log(`${prefijo} ${i}/${importados.length} ...`);
  }

  // Articulos que una fuente anterior invento o duplico: se retiran para que el
  // libro refleje solo el texto oficial.
  let eliminados = 0;
  if (huerfanas.length) {
    await prisma.articulo.deleteMany({ where: { id: { in: huerfanas.map((a) => a.id) } } });
    eliminados = huerfanas.length;
  }

  for (const c of correcciones) {
    const ult = await prisma.historialCambioArticulo.findFirst({
      where: { articuloId: c.articuloId, estado: 'aprobado', origen: 'edicion_manual' },
      orderBy: { fechaDeteccion: 'desc' },
      select: { id: true },
    });
    if (ult) await prisma.historialCambioArticulo.update({ where: { id: ult.id }, data: { textoNuevo: c.nuevo } });
  }

  for (let i = 0; i < historial.length; i += 100) {
    await prisma.historialCambioArticulo.createMany({
      data: historial.slice(i, i + 100).map((h) => ({
        articuloId: h.articuloId,
        codigoId: codigo.id,
        numero: h.numero,
        tipoCambio: h.tipo,
        textoAnterior: h.anterior,
        textoNuevo: h.nuevo,
        origen: 'edicion_manual',
        estado: 'aprobado',
        fechaAprobacion: new Date(),
      })),
    });
  }

  const fechaReforma = FECHA_ISO.test(meta.ultimaReforma) ? new Date(`${meta.ultimaReforma}T00:00:00.000Z`) : codigo.fechaUltimaReforma;
  await prisma.codigo.update({
    where: { id: codigo.id },
    data: {
      versionVigente: meta.ultimaReforma ? `Texto vigente con reforma ${meta.etiqueta} ${meta.ultimaReforma}` : codigo.versionVigente,
      fechaUltimaReforma: fechaReforma,
    },
  });

  if (codigo.fuenteOficialId) {
    await prisma.tareaSincronizacion.create({
      data: {
        fuenteOficialId: codigo.fuenteOficialId,
        estado: 'exitosa',
        cambiosDetectados: creados + actualizados + corregidos,
        log: [`IMPORTACION TEXTO COMPLETO (${new Date().toISOString()})`, ...meta.procedencia, `Ultima reforma declarada: ${meta.ultimaReforma || '?'}`, `Articulos: ${importados.length} | creados ${creados}, actualizados ${actualizados}, corregidos ${corregidos}, eliminados ${eliminados}, sin cambios ${iguales}`].join(' | '),
      },
    });
  }

  console.log(`${prefijo} creados ${creados}, actualizados ${actualizados}, corregidos ${corregidos}, eliminados ${eliminados}, sin cambios ${iguales}.`);
}

function claveSeccion(padre: string, tipo: string, numero: string, nombre: string): string {
  return `#byParent#${padre}#${tipo}:${numero}:${nombre}`;
}
