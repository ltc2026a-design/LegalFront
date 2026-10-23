// Fase 2 — PRUEBAS DE CUENTAS DE PERSONA (app de consulta).
//
// Cubre la regla dura de producto (#1: "solo yo creo las credenciales") y la
// superficie nueva:
//   (1) POST /api/app/login   -> 200 + token, o 401 `credenciales_invalidas` GENERICO
//                                  (no revela si el correo existe).
//   (2) GET  /api/app/yo      -> requireAppUser: 401 sin token/basura/otro tipo, y
//                                401 si la cuenta fue borrada o nunca tuvo credenciales
//                                (el middleware RELÉ la fila, no se fía del JWT).
//   (3) AISLAMIENTO de tokens: el de persona no abre /api/admin/* y el de admin no
//       abre /api/app/yo (jwt.ts rechaza `tipo:'app'`, jwt-app.ts exige `tipo:'app'`).
//   (4) HERENCIA de favoritos: el login con deviceId COPIA (nunca mueve) los del
//       telefono a la cuenta, y es idempotente.
//   (5) SIN AUTORREGISTRO: ninguna ruta adivinada crea credenciales (404) y el alta
//       anonima por device_id (/api/app/registro) NUNCA deja una fila con credenciales.
//   (6) BLOQUEO de login: 5 fallos -> 429 `demasiados_intentos`, mismo limiter de Zona 7.
//
// Las credenciales se sembran DIRECTO en la base (argon2) porque no existe endpoint
// de alta: es exactamente la via del CLI `npm run usuario:create`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { prisma } from '../lib/prisma.js';
import { firmarTokenApp } from '../auth/jwt-app.js';
import { appDePrueba, tokenAdmin } from './helpers/http.js';
import { ADMIN_TEST } from './helpers/constantes.js';
import { borrarEscenario, crearEscenarioFixture, type Escenario } from './helpers/fixture.js';

const CUENTA = {
  deviceId: 'device-cuenta-test',
  email: 'ana-prueba@consulta-legal.local',
  nombre: 'Ana de Prueba',
  password: 'Ana-Clave-Larga-123',
} as const;

/** Telefono anonimo (alta por device_id, sin credenciales) con favoritos propios. */
const TELEFONO = 'device-telefono-test';
/** DeviceId usado solo para la herencia de favoritos. */
const TELEFONO_2 = 'device-telefono-herencia';
/** Cuenta que se borra a mitad de la suite (token huerfano). */
const CUENTA_BORRABLE = {
  deviceId: 'device-borrable-test',
  email: 'borrable@consulta-legal.local',
  password: 'Borrable-Clave-1234',
} as const;
/** Cuenta aparte para el PATCH de preferencias (no ensucia la de arriba). */
const CUENTA_PREFS = {
  deviceId: 'device-prefs-test',
  email: 'prefs@consulta-legal.local',
  password: 'Prefs-Clave-Larga-123',
} as const;
/** Fila de /api/app/registro usada para probar que el registro NO da credenciales. */
const REGISTRO_FALSO = {
  deviceId: 'device-registro-falso',
  email: 'pretende@consulta-legal.local',
} as const;

let escenario: Escenario;
let cuentaId = '';
let cuentaBorrableId = '';
let articulos: string[] = [];

async function login(body: Record<string, unknown>) {
  const app = appDePrueba();
  return request(app).post('/api/app/login').send(body);
}

/** Sesion valida de la cuenta sembrada (los tests no dependen del orden). */
async function tokenCuenta(): Promise<string> {
  const r = await login({ email: CUENTA.email, password: CUENTA.password });
  if (r.status !== 200) throw new Error(`login de prueba fallo: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token as string;
}

beforeAll(async () => {
  escenario = await crearEscenarioFixture('cuentas');
  const filas = await prisma.articulo.findMany({
    where: { codigoId: escenario.codigoId },
    select: { id: true },
    orderBy: { orden: 'asc' },
    take: 3,
  });
  articulos = filas.map((f) => f.id);
  if (articulos.length < 3) throw new Error('el fixture no trae 3 articulos para favoritos');

  const passwordHash = await argon2.hash(CUENTA.password);
  const creada = await prisma.usuarioApp.create({
    data: {
      deviceId: CUENTA.deviceId,
      loginEmail: CUENTA.email,
      nombre: CUENTA.nombre,
      passwordHash,
    },
    select: { id: true },
  });
  cuentaId = creada.id;

  // Telefono anonimo (sin credenciales) con sus propios favoritos.
  const telefono = await prisma.usuarioApp.create({
    data: { deviceId: TELEFONO },
    select: { id: true },
  });
  await prisma.favorito.create({ data: { usuarioAppId: telefono.id, articuloId: articulos[2] } });
  await prisma.favorito.create({ data: { usuarioAppId: cuentaId, articuloId: articulos[0] } });

  const borrable = await prisma.usuarioApp.create({
    data: {
      deviceId: CUENTA_BORRABLE.deviceId,
      loginEmail: CUENTA_BORRABLE.email,
      passwordHash: await argon2.hash(CUENTA_BORRABLE.password),
      nombre: 'Borrable',
    },
    select: { id: true },
  });
  cuentaBorrableId = borrable.id;

  await prisma.usuarioApp.create({
    data: {
      deviceId: CUENTA_PREFS.deviceId,
      loginEmail: CUENTA_PREFS.email,
      passwordHash: await argon2.hash(CUENTA_PREFS.password),
      nombre: 'Prefs',
    },
  });
});

afterAll(async () => {
  // Cascada: borrar el usuario_app se lleva sus favoritos y preferencias.
  await prisma.usuarioApp
    .deleteMany({
      where: {
        deviceId: {
          in: [
            CUENTA.deviceId,
            TELEFONO,
            TELEFONO_2,
            CUENTA_BORRABLE.deviceId,
            REGISTRO_FALSO.deviceId,
          ],
        },
      },
    })
    .catch(() => undefined);
  await borrarEscenario(escenario);
});

describe('cuentas (1) · POST /api/app/login', () => {
  it('credenciales correctas -> 200 con token de sesion y usuario', async () => {
    const r = await login({ email: CUENTA.email, password: CUENTA.password });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
    expect(r.body.usuario).toEqual({
      id: cuentaId,
      nombre: CUENTA.nombre,
      email: CUENTA.email,
      deviceId: CUENTA.deviceId,
    });
    // El hash nunca sale del servidor.
    expect(JSON.stringify(r.body)).not.toContain('$argon2');
  });

  it('el correo se normaliza a minusculas y tolera espacios', async () => {
    const r = await login({ email: `  ${CUENTA.email.toUpperCase()}  `, password: CUENTA.password });
    expect(r.status).toBe(200);
  });

  it('correo inexistente, clave incorrecta y cuerpo vacio dan el MISMO 401 generico', async () => {
    const casos: Array<Record<string, unknown>> = [
      { email: 'nadie@consulta-legal.local', password: CUENTA.password },
      { email: CUENTA.email, password: 'Clave-Super-Mala-999' },
      { email: '', password: CUENTA.password },
      { email: CUENTA.email, password: '' },
      { password: CUENTA.password },
      { email: CUENTA.email },
      {},
      { email: 12345, password: ['no-es-string'] },
    ];
    for (const cuerpo of casos) {
      const r = await login(cuerpo);
      expect(r.status).toBe(401);
      // Mismo codigo para todo: no se distingue "no existe" de "clave mala".
      expect(r.body).toEqual({ error: 'credenciales_invalidas' });
    }
  });

  it('una fila creada por device_id (registro anonimo) NO abre sesion', async () => {
    // POST /api/app/registro guarda nombre/correo de ETIQUETA, no credenciales.
    const reg = await request(appDePrueba())
      .post('/api/app/registro')
      .send({ deviceId: REGISTRO_FALSO.deviceId, nombre: 'Pretende', email: REGISTRO_FALSO.email });
    expect(reg.status).toBe(200);

    const fila = await prisma.usuarioApp.findUnique({
      where: { deviceId: REGISTRO_FALSO.deviceId },
      select: { loginEmail: true, passwordHash: true },
    });
    expect(fila?.loginEmail).toBeNull();
    expect(fila?.passwordHash).toBeNull();

    const r = await login({ email: REGISTRO_FALSO.email, password: CUENTA.password });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'credenciales_invalidas' });
  });
});

describe('cuentas (2) · GET /api/app/yo exige sesion de persona', () => {
  it('sin Bearer o con Bearer basura -> 401 no_autenticado', async () => {
    const app = appDePrueba();
    const sin = await request(app).get('/api/app/yo');
    expect(sin.status).toBe(401);
    expect(sin.body).toEqual({ error: 'no_autenticado' });

    const basura = await request(app).get('/api/app/yo').set('Authorization', 'Bearer no-es-un-jwt');
    expect(basura.status).toBe(401);
    expect(basura.body).toEqual({ error: 'no_autenticado' });
  });

  it('con token valido -> 200 con usuario, favoritos y preferencias (null si no las hay)', async () => {
    const r = await request(appDePrueba())
      .get('/api/app/yo')
      .set('Authorization', `Bearer ${await tokenCuenta()}`);
    expect(r.status).toBe(200);
    expect(r.body.usuario).toMatchObject({ id: cuentaId, nombre: CUENTA.nombre, email: CUENTA.email });
    expect(typeof r.body.favoritos).toBe('number');
    expect(r.body.preferencias).toBeNull();
  });

  it('un token de ADMIN no abre /api/app/yo', async () => {
    const admin = await tokenAdmin(appDePrueba());
    const r = await request(appDePrueba()).get('/api/app/yo').set('Authorization', `Bearer ${admin}`);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'no_autenticado' });
  });

  it('un token de persona NO abre el panel de administracion', async () => {
    const app = appDePrueba();
    const tok = await tokenCuenta();
    const rutas = [
      '/api/admin/codigos',
      '/api/admin/fuentes',
      '/api/admin/cambios-pendientes',
      '/api/admin/notificaciones',
      '/api/admin/dashboard/resumen',
    ];
    for (const ruta of rutas) {
      const r = await request(app).get(ruta).set('Authorization', `Bearer ${tok}`);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'no_autenticado' });
    }
    // Control: el admin legitimo si entra (el 401 de arriba es por el tipo de token).
    const ok = await request(app)
      .get('/api/admin/codigos')
      .set('Authorization', `Bearer ${await tokenAdmin(app)}`);
    expect(ok.status).toBe(200);
  });

  it('cuenta borrada por el dueno: el token sigue siendo valido, pero requireAppUser relee la base -> 401', async () => {
    const app = appDePrueba();
    const r = await request(app)
      .post('/api/app/login')
      .send({ email: CUENTA_BORRABLE.email, password: CUENTA_BORRABLE.password });
    expect(r.status).toBe(200);
    const tok = r.body.token as string;

    // El alta fue por la via del CLI (directo en la base); la baja es igual de rapida.
    await prisma.usuarioApp.delete({ where: { id: cuentaBorrableId } });

    const despues = await request(app).get('/api/app/yo').set('Authorization', `Bearer ${tok}`);
    expect(despues.status).toBe(401);
    expect(despues.body).toEqual({ error: 'no_autenticado' });
  });

  it('token firmado para una fila sin credenciales -> 401 (requireAppUser lo exige)', async () => {
    const anonimo = await prisma.usuarioApp.findUnique({
      where: { deviceId: TELEFONO },
      select: { id: true },
    });
    const tok = firmarTokenApp({
      id: anonimo!.id,
      deviceId: TELEFONO,
      nombre: 'anonimo',
      email: '',
    });
    const r = await request(appDePrueba()).get('/api/app/yo').set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'no_autenticado' });
  });
});

describe('cuentas (3) · herencia de favoritos del telefono', () => {
  async function favoritosDe(deviceId: string): Promise<string[]> {
    const u = await prisma.usuarioApp.findUnique({
      where: { deviceId },
      select: { favoritos: { select: { articuloId: true } } },
    });
    return (u?.favoritos ?? []).map((f) => f.articuloId).sort();
  }

  it('el login con deviceId COPIA los favoritos del telefono a la cuenta', async () => {
    const tel = await prisma.usuarioApp.create({
      data: { deviceId: TELEFONO_2 },
      select: { id: true },
    });
    await prisma.favorito.createMany({
      data: [
        { usuarioAppId: tel.id, articuloId: articulos[1] },
        { usuarioAppId: tel.id, articuloId: articulos[2] },
      ],
    });

    const antes = await favoritosDe(CUENTA.deviceId);
    expect(antes).toEqual([articulos[0]]);

    const r = await login({ email: CUENTA.email, password: CUENTA.password, deviceId: TELEFONO_2 });
    expect(r.status).toBe(200);
    // El device_id de la SESION es el de la CUENTA, no el del telefono que se entrego:
    // es la clave de sus favoritos y la que hace que la lista la siga entre equipos.
    expect(r.body.usuario.deviceId).toBe(CUENTA.deviceId);

    const despues = await favoritosDe(CUENTA.deviceId);
    expect(despues).toEqual([articulos[0], articulos[1], articulos[2]].sort());
    // COPIA, no mudanza: el telefono conserva su lista (quien no inicia sesion sigue viéndola).
    expect(await favoritosDe(TELEFONO_2)).toEqual([articulos[1], articulos[2]]);
  });

  it('repetir el login no duplica (identidad = cuenta, unique usuario+articulo)', async () => {
    const r = await login({ email: CUENTA.email, password: CUENTA.password, deviceId: TELEFONO_2 });
    expect(r.status).toBe(200);
    const cuenta = await prisma.favorito.count({ where: { usuarioAppId: cuentaId } });
    expect(cuenta).toBe(3);
  });

  it('sin deviceId el login no toca los favoritos de nadie', async () => {
    const r = await login({ email: CUENTA.email, password: CUENTA.password });
    expect(r.status).toBe(200);
    expect(await prisma.favorito.count({ where: { usuarioAppId: cuentaId } })).toBe(3);
  });
});

describe('cuentas (4) · NO existe autorregistro (regla dura)', () => {
  const app = appDePrueba();
  const rutas = [
    '/api/app/register',
    '/api/app/registro-cuenta',
    '/api/app/signup',
    '/api/app/crear-cuenta',
    '/api/app/cuenta',
    '/api/app/cuentas',
    '/api/app/usuarios',
    '/api/app/usuario',
    '/api/registro',
    '/api/usuarios',
    '/api/usuarios-app',
    '/api/crear-usuario',
  ];

  for (const ruta of rutas) {
    it(`POST ${ruta} -> 404 ruta_no_encontrada (nadie puede darse de alta)`, async () => {
      const r = await request(app)
        .post(ruta)
        .send({ email: 'alguien@ejemplo.mx', password: 'AlguienClaveLarga123', nombre: 'X' });
      expect([200, 201]).not.toContain(r.status);
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: 'ruta_no_encontrada' });
    });
  }

  it('el login solo VERIFICA: un email nuevo no crea nada', async () => {
    const r = await login({ email: 'nada-que-ver@ejemplo.mx', password: 'ClaveFalsaLarga123' });
    expect(r.status).toBe(401);
    expect(await prisma.usuarioApp.findUnique({ where: { loginEmail: 'nada-que-ver@ejemplo.mx' } })).toBeNull();
  });
});

describe('cuentas (5) · bloqueo de login por intentos', () => {
  it('5 fallos -> 429 demasiados_intentos y el login valido tambien queda cortado', async () => {
    const app = appDePrueba({ limites: { desactivados: false, generalMax: 100_000, loginMax: 5 } });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(app)
        .post('/api/app/login')
        .send({ email: CUENTA.email, password: 'mal-' + i });
      statuses.push(r.status);
    }
    expect(statuses).toContain(429);
    for (let i = 0; i < statuses.indexOf(429); i++) expect(statuses[i]).toBe(401);

    const bloqueado = await request(app)
      .post('/api/app/login')
      .send({ email: CUENTA.email, password: CUENTA.password });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body).toEqual({ error: 'demasiados_intentos' });
  });

  it('instancia limpia (ventana nueva): el login valido SÍ pasa', async () => {
    const app = appDePrueba({ limites: { desactivados: false, generalMax: 100_000, loginMax: 5 } });
    const r = await request(app)
      .post('/api/app/login')
      .send({ email: CUENTA.email, password: CUENTA.password });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
  });

  it('el bloqueo de /api/app/login no afecta el login del admin', async () => {
    const app = appDePrueba({ limites: { desactivados: false, generalMax: 100_000, loginMax: 5 } });
    for (let i = 0; i < 6; i++) {
      await request(app).post('/api/app/login').send({ email: CUENTA.email, password: 'mal-' + i });
    }
    const admin = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_TEST.email, password: ADMIN_TEST.password });
    expect(admin.status).toBe(200);
  });
});

describe('cuentas (6) · PATCH /api/app/preferencias (perfil de la persona)', () => {
  async function tokenPrefs(): Promise<string> {
    const r = await login({ email: CUENTA_PREFS.email, password: CUENTA_PREFS.password });
    if (r.status !== 200) throw new Error(`login prefs fallo: ${r.status}`);
    return r.body.token as string;
  }

  async function patch(cuerpo: Record<string, unknown>) {
    const app = appDePrueba();
    return request(app)
      .patch('/api/app/preferencias')
      .set('Authorization', `Bearer ${await tokenPrefs()}`)
      .send(cuerpo);
  }

  it('escribirla exige sesion: sin token 401 y con token de admin 401', async () => {
    const app = appDePrueba();
    const sin = await request(app).patch('/api/app/preferencias').send({ tema: 'oscuro' });
    expect(sin.status).toBe(401);
    expect(sin.body).toEqual({ error: 'no_autenticado' });

    const admin = await tokenAdmin(app);
    const conAdmin = await request(app)
      .patch('/api/app/preferencias')
      .set('Authorization', `Bearer ${admin}`)
      .send({ tema: 'oscuro' });
    expect(conAdmin.status).toBe(401);
    expect(conAdmin.body).toEqual({ error: 'no_autenticado' });
  });

  it('la primera escritura crea la fila y /api/app/yo la devuelve', async () => {
    const r = await patch({ tema: 'oscuro', tamanoLetra: 115, codigoFavorito: 'ley-federal-del-trabajo' });
    expect(r.status).toBe(200);
    expect(r.body.preferencias).toMatchObject({
      tema: 'oscuro',
      tamanoLetra: 115,
      codigoFavorito: 'ley-federal-del-trabajo',
      notificaciones: true,
      guardarHistorial: true,
    });

    const yo = await request(appDePrueba())
      .get('/api/app/yo')
      .set('Authorization', `Bearer ${await tokenPrefs()}`);
    expect(yo.status).toBe(200);
    expect(yo.body.preferencias?.tema).toBe('oscuro');
  });

  it('guardado PARCIAL: mandar solo un campo no pisa los demas', async () => {
    const r = await patch({ guardarHistorial: false });
    expect(r.status).toBe(200);
    expect(r.body.preferencias).toMatchObject({
      tema: 'oscuro',
      tamanoLetra: 115,
      guardarHistorial: false,
    });
  });

  it('el tamano de letra se ajusta al rango (85-140), no se rechaza', async () => {
    expect((await patch({ tamanoLetra: 10 })).body.preferencias.tamanoLetra).toBe(85);
    expect((await patch({ tamanoLetra: 999 })).body.preferencias.tamanoLetra).toBe(140);
    expect((await patch({ tamanoLetra: 100 })).body.preferencias.tamanoLetra).toBe(100);
  });

  it('la franja de silencio acepta HH:MM, vacia = sin franja', async () => {
    const r = await patch({ silencioDesde: '22:30', silencioHasta: '07:15' });
    expect(r.body.preferencias).toMatchObject({ silencioDesde: '22:30', silencioHasta: '07:15' });
    const limpio = await patch({ silencioDesde: '', silencioHasta: null });
    expect(limpio.body.preferencias).toMatchObject({ silencioDesde: null, silencioHasta: null });
  });

  it('un valor invalido se rechaza con 400 y NO escribe nada a medias', async () => {
    const antes = (await patch({})).body.preferencias;
    const r = await patch({ tema: 'neon', silencioDesde: '25:00', notificaciones: 'si' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('preferencias_invalidas');
    expect(new Set(r.body.campos as string[])).toEqual(new Set(['tema', 'silencioDesde', 'notificaciones']));
    const despues = (await patch({})).body.preferencias;
    expect(despues).toEqual(antes);
  });

  it('codigoFavorito = null quita el libro anclado', async () => {
    const r = await patch({ codigoFavorito: null });
    expect(r.body.preferencias.codigoFavorito).toBeNull();
  });
});
