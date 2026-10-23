// Zona 6 — ORQUESTADOR de sincronizacion.
//
// ejecutarsincronizacion(fuenteOficialId) es el unico punto que escribe en la
// base dentro de todo el subsistema de sincronizacion, y SOLO escribe:
//   - fila de auditoria en tarea_sincronizacion,
//   - pendientes en historial_cambio_articulo (via el diff),
//   - el arbol de secciones (via prepararSecciones; NUNCA toca `articulo`).
//
// NUNCA modifica `articulo.texto` ni publica. Un fallo del conector (p.ej. red
// inalcanzable) se captura: la tarea queda 'fallida' y la fuente 'con_error',
// y el proceso NO revienta (otras fuentes/cron siguen funcionando).
import { prisma } from '../lib/prisma.js';
import { obtenerConector } from '../conectores/registro.js';
import { claveSeccion, type ResultadoNormalizado } from '../conectores/tipos.js';
import { calcularCambios, prepararSecciones, type CambioDetectado } from './diff.js';

export interface ResultadoSincronizacion {
  fuenteOficialId: string;
  tareaId: string;
  estado: 'exitosa' | 'con_cambios_pendientes' | 'fallida';
  cambiosDetectados: number;
  error?: string;
}

/** Un codigo de la fuente (minimo lo que necesita el orquestador). */
type CodigoFuente = { id: string; slug: string };

/** Elige a que codigo(s) de la fuente aplica el resultado del conector. */
function seleccionarCodigos(codigos: CodigoFuente[], resultado: ResultadoNormalizado): CodigoFuente[] {
  // Las fuentes se siembran 1:1 (un documento por fuente). Si ademas el slug del
  // resultado coincide con un codigo, se limita a ese (por si una fuente tuviera
  // varios documentos). TODO (Zona 11): fuentes multi-documento reales.
  const porSlug = codigos.find((c) => c.slug === resultado.codigo.slug);
  return porSlug ? [porSlug] : codigos;
}

export async function ejecutarSincronizacion(
  fuenteOficialId: string,
): Promise<ResultadoSincronizacion> {
  const fuente = await prisma.fuenteOficial.findUnique({
    where: { id: fuenteOficialId },
    include: { codigos: { select: { id: true, slug: true } } },
  });

  if (!fuente) {
    throw new Error(`FuenteOficial no encontrada: ${fuenteOficialId}`);
  }

  // Fila de auditoria creada AL INICIO con estado placeholder 'fallida': si el
  // proceso muere de forma dura, el registro queda como fallo (safe-by-default).
  // Se sobreescribe al finalizar.
  const tarea = await prisma.tareaSincronizacion.create({
    data: {
      fuenteOficialId,
      iniciadoEn: new Date(),
      estado: 'fallida',
      log: `Sincronizacion iniciada (conector=${fuente.conectorKey ?? 'sin_key'}).`,
    },
  });

  try {
    const conector = obtenerConector({
      conectorKey: fuente.conectorKey,
      urlOrigen: fuente.urlOrigen,
    });
    const resultado = await conector.obtener();

    const codigos = seleccionarCodigos(fuente.codigos, resultado);
    let totalCambios = 0;
    const resumenCodigos: string[] = [];

    for (const codigo of codigos) {
      // Preview de secciones: deja el arbol listo para materializar 'nuevo' mas
      // adelante (Zona 7). Idempotente; NO toca articulos.
      await prepararSecciones(codigo.id, resultado.secciones, claveSeccion);

      const creados: CambioDetectado[] = await calcularCambios(codigo.id, resultado);
      totalCambios += creados.length;
      const porTipo = contarPorTipo(creados);
      resumenCodigos.push(`${codigo.slug}: +${creados.length} (${porTipo})`);
    }

    const estado = totalCambios > 0 ? 'con_cambios_pendientes' : 'exitosa';
    const log = [
      `Sincronizacion ${estado}.`,
      `Cambios nuevos: ${totalCambios}.`,
      ...resumenCodigos,
    ].join(' ');

    await prisma.$transaction([
      prisma.tareaSincronizacion.update({
        where: { id: tarea.id },
        data: { estado, cambiosDetectados: totalCambios, finalizadoEn: new Date(), log },
      }),
      prisma.fuenteOficial.update({
        where: { id: fuenteOficialId },
        data: { ultimaSincronizacionEn: new Date(), estado: 'activa' },
      }),
    ]);

    return { fuenteOficialId, tareaId: tarea.id, estado, cambiosDetectados: totalCambios };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    await prisma.tareaSincronizacion.update({
      where: { id: tarea.id },
      data: {
        estado: 'fallida',
        finalizadoEn: new Date(),
        log: `Sincronizacion FALLIDA: ${mensaje}`,
      },
    });
    await prisma.fuenteOficial.update({
      where: { id: fuenteOficialId },
      data: { estado: 'con_error' },
    });
    // No se relanza: el fallo queda aislado en esta fuente/tarea.
    return {
      fuenteOficialId,
      tareaId: tarea.id,
      estado: 'fallida',
      cambiosDetectados: 0,
      error: mensaje,
    };
  }
}

function contarPorTipo(cambios: CambioDetectado[]): string {
  const nuevo = cambios.filter((c) => c.tipoCambio === 'nuevo').length;
  const mod = cambios.filter((c) => c.tipoCambio === 'modificado').length;
  const der = cambios.filter((c) => c.tipoCambio === 'derogado').length;
  return `nuevo=${nuevo}, modificado=${mod}, derogado=${der}`;
}

/** Sincroniza todas las fuentes que tengan conectorKey (usado por --all). */
export async function sincronizarTodas(): Promise<ResultadoSincronizacion[]> {
  const fuentes = await prisma.fuenteOficial.findMany({
    where: { conectorKey: { not: null } },
    select: { id: true },
  });
  const resultados: ResultadoSincronizacion[] = [];
  for (const f of fuentes) {
    // Cada fuente aislada: un fallo no detiene a las demas.
    resultados.push(await ejecutarSincronizacion(f.id));
  }
  return resultados;
}
