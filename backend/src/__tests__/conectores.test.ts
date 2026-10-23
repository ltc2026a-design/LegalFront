// Zona 11 — pruebas de CONECTORES (parser, diff, idempotencia y fallo elegante).
// Ninguna toca red real: el fixture lee HTML local y el conector federal usa un
// fetch simulado que rechaza.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConectorFixture } from '../conectores/conector-fixture.js';
import { parsearResultado } from '../conectores/parser-html.js';
import { detectarCambios } from '../sincronizacion/diff.js';
import { ejecutarSincronizacion } from '../sincronizacion/orquestador.js';
import { prisma } from '../lib/prisma.js';
import {
  V1_HTML,
  V2_HTML,
  borrarEscenario,
  crearEscenarioFixture,
  repuntarFuente,
} from './helpers/fixture.js';

describe('conector fixture + parser', () => {
  it('normaliza el fixture v1 a la forma esperada (6 articulos, metadatos)', async () => {
    const res = await new ConectorFixture(V1_HTML, {
      slug: 'codigo-demo',
      nombre: 'Código Demo',
    }).obtener();
    expect(res.codigo.slug).toBe('codigo-demo');
    expect(res.articulos.map((a) => a.numero).sort()).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(res.articulos.every((a) => a.texto.length > 0)).toBe(true);
    // Arbol: 2 titulos (primero/segundo), cada uno con capitulos.
    expect(res.secciones.length).toBeGreaterThanOrEqual(2);
    const titulo1 = res.secciones.find((s) => s.tipo === 'titulo');
    expect(titulo1?.children.some((c) => c.tipo === 'capitulo')).toBe(true);
  });

  it('v2 respecto a v1 cambia el art.3, elimina el 6 y anade el 7', async () => {
    const v1 = await new ConectorFixture(V1_HTML).obtener();
    const v2 = await new ConectorFixture(V2_HTML).obtener();
    const n1 = new Set(v1.articulos.map((a) => a.numero));
    const n2 = new Set(v2.articulos.map((a) => a.numero));
    expect(n1.has('6')).toBe(true);
    expect(n2.has('6')).toBe(false); // derogado en v2
    expect(n2.has('7')).toBe(true); // nuevo en v2
    const t3v1 = v1.articulos.find((a) => a.numero === '3')!.texto;
    const t3v2 = v2.articulos.find((a) => a.numero === '3')!.texto;
    expect(t3v1).not.toBe(t3v2); // modificado
  });

  it('parsearResultado reconoce ARTICULO con sufijos y cabeceras de seccion', () => {
    const html = `
      <html><body>
      <p>TITULO UNO: PRUEBA</p>
      <p>Artículo 1o. Texto primero.</p>
      <p>Artículo 17 BIS Texto bis.</p>
      </body></html>`;
    const r = parsearResultado(html, {
      slug: 'x',
      nombre: 'X',
      tipo: 'otro',
      jurisdiccion: 'federal',
    });
    const nums = r.articulos.map((a) => a.numero);
    expect(nums).toContain('1');
    expect(nums).toContain('17 BIS');
  });
});

describe('motor de diff (en memoria) clasifica nuevo/modificado/derogado', () => {
  it('produce exactamente un cambio de cada tipo', async () => {
    const v2 = await new ConectorFixture(V2_HTML).obtener();
    const porNumero = new Map(v2.articulos.map((a) => [a.numero, a.texto]));
    // Baseline en BD: 1,2,4,5 identicos a v2; 3 con texto ANTIGUO; 6 vigente ausente
    // en v2 (derogado); y NO existe el 7 (nuevo en v2).
    const db = [
      { id: 'a1', numero: '1', texto: porNumero.get('1')!, vigente: true },
      { id: 'a2', numero: '2', texto: porNumero.get('2')!, vigente: true },
      { id: 'a3', numero: '3', texto: 'TEXTO ANTIGUO DISTINTO', vigente: true },
      { id: 'a4', numero: '4', texto: porNumero.get('4')!, vigente: true },
      { id: 'a5', numero: '5', texto: porNumero.get('5')!, vigente: true },
      { id: 'a6', numero: '6', texto: 'Articulo que desaparece en v2', vigente: true },
    ];
    const cambios = detectarCambios('codigo-x', db, v2);
    const porTipo = cambios.map((c) => `${c.tipoCambio}:${c.numero}`).sort();
    expect(porTipo).toEqual(['derogado:6', 'modificado:3', 'nuevo:7']);
  });
});

describe('idempotencia de sincronizacion (no duplica pendientes)', () => {
  let esc: { fuenteId: string; codigoId: string; slug: string };

  beforeAll(async () => {
    esc = await crearEscenarioFixture('idem', V1_HTML);
    // baseline: sincronizar v1 no debe dar cambios (BD == fuente).
    const r1 = await ejecutarSincronizacion(esc.fuenteId);
    expect(r1.estado).toBe('exitosa');
    expect(r1.cambiosDetectados).toBe(0);
    await repuntarFuente(esc.fuenteId, V2_HTML);
  });

  afterAll(async () => {
    await prisma.historialCambioArticulo
      .deleteMany({ where: { codigoId: esc.codigoId } })
      .catch(() => undefined);
    await borrarEscenario(esc);
  });

  it('v2 deja 3 pendientes y la re-ejecucion no los duplica', async () => {
    const r2 = await ejecutarSincronizacion(esc.fuenteId);
    expect(r2.estado).toBe('con_cambios_pendientes');
    expect(r2.cambiosDetectados).toBe(3);

    const primeraVez = await prisma.historialCambioArticulo.count({
      where: { codigoId: esc.codigoId, estado: 'pendiente_revision' },
    });
    expect(primeraVez).toBe(3);

    // Re-ejecucion con la MISMA fuente (v2): no debe anadir pendientes nuevos.
    const r3 = await ejecutarSincronizacion(esc.fuenteId);
    expect(r3.cambiosDetectados).toBe(0);

    const segundaVez = await prisma.historialCambioArticulo.count({
      where: { codigoId: esc.codigoId, estado: 'pendiente_revision' },
    });
    expect(segundaVez).toBe(3);
  });
});

describe('conector federal: fallo ELEGANTE sin red (fetch rechazado)', () => {
  const fuenteId = 'fuente-federal-fallo';
  beforeAll(async () => {
    await prisma.fuenteOficial
      .create({
        data: {
          id: fuenteId,
          nombre: 'Federal (sin red)',
          jurisdiccion: 'federal',
          urlOrigen: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/PRUEBA.pdf',
          metodoIngesta: 'scraper',
          frecuenciaSincronizacion: 'manual',
          estado: 'activa',
          conectorKey: 'diputados_federal',
        },
      })
      .catch(() => undefined);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.fuenteOficial
      .deleteMany({ where: { id: fuenteId } })
      .catch(() => undefined);
  });

  it('tarea=fallida, fuente=con_error y NO revienta el proceso', async () => {
    // Simula el bloqueo de red del host (.gob.mx inalcanzable) sin tocar la red.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED simulado (.gob.mx inalcanzable)'))),
    );

    const res = await ejecutarSincronizacion(fuenteId); // no lanza
    expect(res.estado).toBe('fallida');

    const fuente = await prisma.fuenteOficial.findUnique({ where: { id: fuenteId } });
    expect(fuente?.estado).toBe('con_error');

    const tarea = await prisma.tareaSincronizacion.findFirst({
      where: { fuenteOficialId: fuenteId },
      orderBy: { iniciadoEn: 'desc' },
    });
    expect(tarea?.estado).toBe('fallida');

    // fetch intentado (max 1 reintento => 2 llamadas como mucho).
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
