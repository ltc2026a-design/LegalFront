// Zona 11 — PRUEBAS END-TO-END por HTTP (supertest sobre la app Express).
// (a) USUARIO: buscar -> abrir articulo -> favoritos (POST/GET/DELETE) -> senal
//     offline (X-Served-By) expuesta por el servidor.
// (b) ADMIN: login -> pendientes -> aprobar -> el texto publicado se sirve por la
//     API publica (aprueba que el flujo admin -> datos de la app de consulta).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { vi } from 'vitest';
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => {
      throw new Error('push bloqueado en pruebas');
    }),
  },
}));

import { prisma } from '../lib/prisma.js';
import { V1_HTML, V2_HTML, crearEscenarioFixture, repuntarFuente, textoFixture, borrarEscenario } from './helpers/fixture.js';
import { appDePrueba, tokenAdmin } from './helpers/http.js';
import { ORIGEN_PERMITIDO } from './helpers/constantes.js';
import { ejecutarSincronizacion } from '../sincronizacion/orquestador.js';

const app = appDePrueba();

describe('e2e (a) · usuario anonimo por device_id', () => {
  let slug = '';
  let codigoId = '';
  let esc: { fuenteId: string; codigoId: string; slug: string };

  beforeAll(async () => {
    esc = await crearEscenarioFixture('e2euser', V1_HTML);
    slug = esc.slug;
    codigoId = esc.codigoId;
  });
  afterAll(async () => {
    await borrarEscenario(esc);
  });

  it('GET /api/codigos lista el codigo de prueba', async () => {
    const r = await request(app).get('/api/codigos');
    expect(r.status).toBe(200);
    expect(r.body.codigos.some((c: { slug: string }) => c.slug === slug)).toBe(true);
  });

  it('GET /api/buscar devuelve un resultado REALZADO con <mark>', async () => {
    // 'acceso información' (acentuado) es lo que realmente casa con
    // plainto_tsquery('spanish', ...) sobre el texto del fixture (art. 1).
    const r = await request(app).get('/api/buscar').query({ q: 'acceso información' });
    expect(r.status).toBe(200);
    // Determinista: nos quedamos solo con los resultados del codigo de prueba.
    const mios = r.body.resultados.filter((x: { codigoSlug: string }) => x.codigoSlug === slug);
    expect(mios.length).toBeGreaterThan(0);
    const conMark = mios.find((x: { destacado: string }) => x.destacado.includes('<mark>'));
    expect(conMark).toBeTruthy();
    expect(conMark.codigoSlug).toBe(slug);
  });

  it('GET articulo por slug+numero (abrir desde el resultado)', async () => {
    const r = await request(app).get(`/api/codigos/${slug}/articulos/1`);
    expect(r.status).toBe(200);
    expect(r.body.articulo.numero).toBe('1');
    expect(r.body.articulo.texto).toContain('acceso a la información');
  });

  it('POST/GET/DELETE /api/favoritos por device_id (idempotente + solo propio)', async () => {
    const art = await prisma.articulo.findFirst({ where: { codigoId, numero: '1' } });
    const dev = 'device-e2euser-1';

    const add = await request(app).post('/api/favoritos').send({ deviceId: dev, articuloId: art!.id });
    expect(add.status).toBe(200);
    const favId = add.body.favorito.id;

    // idempotencia: repetir no duplica.
    const add2 = await request(app).post('/api/favoritos').send({ deviceId: dev, articuloId: art!.id });
    expect(add2.body.favorito.id).toBe(favId);

    const list = await request(app).get('/api/favoritos').query({ deviceId: dev });
    expect(list.status).toBe(200);
    expect(list.body.favoritos.some((f: { id: string }) => f.id === favId)).toBe(true);

    // OTRO dispositivo no lo ve.
    const lista2 = await request(app).get('/api/favoritos').query({ deviceId: 'device-otro' });
    expect(lista2.body.favoritos.some((f: { id: string }) => f.id === favId)).toBe(false);

    const del = await request(app).delete(`/api/favoritos/${favId}`).query({ deviceId: dev });
    expect(del.status).toBe(200);

    const list3 = await request(app).get('/api/favoritos').query({ deviceId: dev });
    expect(list3.body.favoritos.some((f: { id: string }) => f.id === favId)).toBe(false);
  });

  it('senal offline: el servidor EXPONE X-Served-By (cabecera CORS)', async () => {
    const r = await request(app).get('/api/codigos').set('Origin', ORIGEN_PERMITIDO);
    expect(r.status).toBe(200);
    const expuesto = String(r.headers['access-control-expose-headers'] ?? '');
    expect(expuesto.toLowerCase()).toContain('x-served-by');
  });
});

describe('e2e (b) · admin aprueba y la API publica refleja el cambio', () => {
  let esc: { fuenteId: string; codigoId: string; slug: string };

  beforeAll(async () => {
    esc = await crearEscenarioFixture('e2eadm', V1_HTML);
    await ejecutarSincronizacion(esc.fuenteId);
    await repuntarFuente(esc.fuenteId, V2_HTML);
    await ejecutarSincronizacion(esc.fuenteId);
  });
  afterAll(async () => {
    await prisma.historialCambioArticulo.deleteMany({ where: { codigoId: esc.codigoId } });
    await borrarEscenario(esc);
  });

  it('login -> cambios-pendientes muestra el pendiente fixture', async () => {
    const token = await tokenAdmin(app);
    const r = await request(app)
      .get('/api/admin/cambios-pendientes')
      .query({ codigo: esc.slug })
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(r.body.cambios.some((c: { tipoCambio: string }) => c.tipoCambio === 'modificado')).toBe(
      true,
    );
  });

  it('aprobar modificado -> GET publico /api/codigos/:slug/articulos/3 muestra el texto v2', async () => {
    const token = await tokenAdmin(app);
    const mod = await prisma.historialCambioArticulo.findFirst({
      where: { codigoId: esc.codigoId, estado: 'pendiente_revision', tipoCambio: 'modificado' },
    });
    const apr = await request(app)
      .post(`/api/admin/cambios/${mod!.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);
    expect(apr.status).toBe(200);

    const v2 = (await textoFixture(V2_HTML, '3'))!;
    const pub = await request(app).get(`/api/codigos/${esc.slug}/articulos/3`);
    expect(pub.status).toBe(200);
    expect(pub.body.articulo.texto).toBe(v2);
  });
});
