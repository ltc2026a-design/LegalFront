// Zona 11 — PRUEBA DE INTEGRACION del flujo dorado (golden path), offline via
// el conector de FIXTURE de Zona 6. Cubre el ciclo completo:
//   sync v2 -> 3 pendientes (nuevo/modificado/derogado, estado=pendiente_revision)
//   sin tocar el texto PUBLICO -> admin se loguea (JWT) -> aprueba modificado/nuevo/
//   derogado y la API publica refleja los cambios -> aprobar un articulo favorito
//   crea NotificacionCambio e invoca el dispatcher de push (envio simulado, sin
//   lanzar) -> rechazar deja el articulo intacto -> re-aprobar un resuelto da 409.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
// Mock ANTES de importar la app (vi.mock se eleva, pero se declara arriba para
// dejar claro que NINGUN push real sale a la red durante la suite).
import { vi } from 'vitest';
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => {
      const err = new Error('push bloqueado en pruebas') as Error & { statusCode?: number };
      err.statusCode = undefined;
      throw err;
    }),
  },
}));
import webpush from 'web-push';

import { prisma } from '../lib/prisma.js';
import { V1_HTML, V2_HTML, crearEscenarioFixture, fotoArticulos, repuntarFuente, textoFixture } from './helpers/fixture.js';
import { appDePrueba, tokenAdmin } from './helpers/http.js';
import { ejecutarSincronizacion } from '../sincronizacion/orquestador.js';

const app = appDePrueba();
const DEVICE = 'device-golden-0001';
let fuenteId = '';
let codigoId = '';
let slug = '';

async function pendientes(tipo: string) {
  return prisma.historialCambioArticulo.findMany({
    where: { codigoId, estado: 'pendiente_revision', tipoCambio: tipo as never },
    orderBy: { fechaDeteccion: 'asc' },
  });
}

beforeAll(async () => {
  const esc = await crearEscenarioFixture('golden', V1_HTML);
  fuenteId = esc.fuenteId;
  codigoId = esc.codigoId;
  slug = esc.slug;
  // baseline v1 (sin cambios) y luego reforma simulada a v2 -> pendientes.
  await ejecutarSincronizacion(fuenteId);
  await repuntarFuente(fuenteId, V2_HTML);
  const res = await ejecutarSincronizacion(fuenteId);
  expect(res.estado).toBe('con_cambios_pendientes');
  expect(res.cambiosDetectados).toBe(3);
});

describe('flujo dorado · fixture -> pendientes -> aprobacion -> publicacion', () => {
  it('los 3 cambios quedan pendientes y el texto PUBLICO NO cambia', async () => {
    const mod = await pendientes('modificado');
    const nuevo = await pendientes('nuevo');
    const derog = await pendientes('derogado');
    expect(mod.length).toBe(1);
    expect(nuevo.length).toBe(1);
    expect(derog.length).toBe(1);
    expect(mod[0].numero).toBe('3');
    expect(nuevo[0].numero).toBe('7');
    expect(derog[0].numero).toBe('6');

    // Invariante: la tabla articulo sigue en v1 (nada publicado).
    const foto = await fotoArticulos(codigoId);
    const v1Texto3 = (await textoFixture(V1_HTML, '3'))!;
    expect(foto.get('3')?.texto).toBe(v1Texto3); // NO el de v2
    expect(foto.get('6')?.vigente).toBe(true); // derogado aun no aplicado
    expect(foto.has('7')).toBe(false); // nuevo aun no creado
  });

  it('login de admin devuelve JWT valido (GET /auth/me)', async () => {
    const token = await tokenAdmin(app);
    const me = await request(app).get('/api/admin/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.admin.email ?? me.body.admin.id).toBeTruthy();
    expect(me.body.admin.rol).toBe('administrador');
  });

  it('favoritar el art.3 y registrar un dispositivo web (pre-parar push)', async () => {
    const art3 = await prisma.articulo.findFirst({ where: { codigoId, numero: '3' } });
    expect(art3).not.toBeNull();

    const fav = await request(app)
      .post('/api/favoritos')
      .send({ deviceId: DEVICE, articuloId: art3!.id });
    expect(fav.status).toBe(200);

    const dev = await request(app)
      .post('/api/app/dispositivos')
      .send({
        deviceId: DEVICE,
        plataforma: 'web',
        endpoint: 'https://push.ejemplo-invalido.test/subscribe/abc',
        keys: { p256dh: 'BKdtestp256dhvalue', auth: 'dtestAuthKey123' },
      });
    expect([200, 201]).toContain(dev.status);
  });

  it('APROBAR modificado: publica texto v2 + crea NotificacionCambio + dispara push', async () => {
    const token = await tokenAdmin(app);
    const mod = (await pendientes('modificado'))[0];
    const r = await request(app)
      .post(`/api/admin/cambios/${mod.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.notificacion?.destinatarios).toBeGreaterThanOrEqual(1);

    // Texto publico ahora es el de v2.
    const foto = await fotoArticulos(codigoId);
    const v2Texto3 = (await textoFixture(V2_HTML, '3'))!;
    expect(foto.get('3')?.texto).toBe(v2Texto3);

    // API publica refleja el cambio.
    const pub = await request(app).get(`/api/codigos/${slug}/articulos/3`);
    expect(pub.status).toBe(200);
    expect(pub.body.articulo.texto).toBe(v2Texto3);

    // Notificacion escrita en BD para el articulo.
    const art3 = await prisma.articulo.findFirst({ where: { codigoId, numero: '3' } });
    const notif = await prisma.notificacionCambio.count({ where: { articuloId: art3!.id } });
    expect(notif).toBeGreaterThanOrEqual(1);

    // Dispatcher de push invocado (intento de envio al dispositivo), sin lanzar.
    expect(vi.isMockFunction(webpush.sendNotification)).toBe(true);
    expect(webpush.sendNotification).toHaveBeenCalled();
  });

  it('APROBAR nuevo: crea el articulo en la seccion correcta', async () => {
    const token = await tokenAdmin(app);
    const nuevo = (await pendientes('nuevo'))[0];
    const r = await request(app)
      .post(`/api/admin/cambios/${nuevo.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);

    const art7 = await prisma.articulo.findFirst({
      where: { codigoId, numero: '7' },
      include: { seccion: { include: { padre: true } } },
    });
    expect(art7).not.toBeNull();
    // El art.7 de v2 vive bajo TITULO SEGUNDO > CAPITULO UNICO.
    expect(art7?.seccion).not.toBeNull();
    expect(
      `${art7?.seccion?.nombre} ${art7?.seccion?.padre?.nombre ?? ''}`.toUpperCase(),
    ).toContain('SANCIONADOR');

    const pub = await request(app).get(`/api/codigos/${slug}/articulos/7`);
    expect(pub.status).toBe(200);
    expect(pub.body.articulo.texto).toBe((await textoFixture(V2_HTML, '7'))!);
  });

  it('APROBAR derogado: articulo queda vigente=false', async () => {
    const token = await tokenAdmin(app);
    const derog = (await pendientes('derogado'))[0];
    const r = await request(app)
      .post(`/api/admin/cambios/${derog.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);

    const art6 = await prisma.articulo.findFirst({ where: { codigoId, numero: '6' } });
    expect(art6?.vigente).toBe(false);
    const pub = await request(app).get(`/api/codigos/${slug}/articulos/6`);
    expect(pub.body.articulo.vigente).toBe(false);
  });

  it('RECHAZAR deja el articulo intacto; re-aprobar un RESUELTO da 409', async () => {
    // Segundo escenario independiente para no interferir con las aprobaciones.
    const esc2 = await crearEscenarioFixture('golden-rechazo', V1_HTML);
    await ejecutarSincronizacion(esc2.fuenteId);
    await repuntarFuente(esc2.fuenteId, V2_HTML);
    await ejecutarSincronizacion(esc2.fuenteId);
    const token = await tokenAdmin(app);

    const mod2 = await prisma.historialCambioArticulo.findFirst({
      where: { codigoId: esc2.codigoId, estado: 'pendiente_revision', tipoCambio: 'modificado' },
    });
    expect(mod2).not.toBeNull();
    const textoAntes = (await fotoArticulos(esc2.codigoId)).get('3')?.texto;

    const rej = await request(app)
      .post(`/api/admin/cambios/${mod2!.id}/rechazar`)
      .set('Authorization', `Bearer ${token}`);
    expect(rej.status).toBe(200);
    expect(rej.body.cambio.estado).toBe('rechazado');

    // El articulo NO cambio tras rechazar.
    const textoDespues = (await fotoArticulos(esc2.codigoId)).get('3')?.texto;
    expect(textoDespues).toBe(textoAntes);

    // Re-aprobar un cambio ya RESUELTO (rechazado) => 409.
    const re = await request(app)
      .post(`/api/admin/cambios/${mod2!.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);
    expect(re.status).toBe(409);

    await prisma.historialCambioArticulo
      .deleteMany({ where: { codigoId: esc2.codigoId } })
      .catch(() => undefined);
    await prisma.codigo.delete({ where: { id: esc2.codigoId } }).catch(() => undefined);
    await prisma.fuenteOficial.delete({ where: { id: esc2.fuenteId } }).catch(() => undefined);
  });
});
