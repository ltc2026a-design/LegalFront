// Zona 11 — PRUEBAS DE SEGURIDAD.
//
// 1) BARRIDO 401: ninguna ruta de ESCRITURA de administracion es alcanzable sin
//    Bearer JWT valido (ni con token basura). Las escrituras por device_id
//    (/api/favoritos, /api/app/registro, /api/app/dispositivos) son PUBLICAS por
//    diseno y NO se barren: forman parte de la API anonima de la app de consulta.
// 2) BLOQUEO DE LOGIN: 5 fallos de credenciales -> 429 demasiados_intentos, y a
//    partir de ahi el login CORRECTO tambien queda bloqueado (el limiter corta
//    antes del handler). Con un limiter nuevo (instancia limpia) el login valido
//    si pasa -> demuestra que es bloqueo por intentos, no puerta cerrada.
// 3) RATE LIMIT: GET /api/buscar (el mas estricto) -> 429 limite_excedido al
//    superar la cuota de la ventana.
// 4) SIN AUTORREGISTRO (regla dura de producto): no existe ninguna ruta publica
//    que cree credenciales -> todas las rutas "adivinadas" devuelven 404
//    ruta_no_encontrada (nunca 200/201).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { appDePrueba, tokenAdmin } from './helpers/http.js';
import { ADMIN_TEST } from './helpers/constantes.js';

type Metodo = 'get' | 'post' | 'patch' | 'delete';

/** Dispara una peticion por metodo, con cuerpo vacio y Bearer opcional. */
async function enviar(app: Express, metodo: Metodo, ruta: string, bearer?: string) {
  const req =
    metodo === 'get'
      ? request(app).get(ruta)
      : metodo === 'post'
        ? request(app).post(ruta)
        : metodo === 'patch'
          ? request(app).patch(ruta)
          : request(app).delete(ruta);
  if (bearer !== undefined) req.set('Authorization', bearer);
  if (metodo !== 'get') req.send({});
  return req;
}

// App por defecto: en NODE_ENV=test los limitadores van DESACTIVADOS, asi que el
// barrido 401 y el 404 no se ven afectados por el rate limiting.
describe('seguridad (1) · barrido 401 en las escrituras de administracion', () => {
  const app = appDePrueba();

  // (metodo, ruta) montadas bajo /api/admin/*. Los ids son dummy: requireAdmin
  // corta ANTES de que el handler los toque.
  const escrituras: Array<[Metodo, string]> = [
    ['post', '/api/admin/codigos'],
    ['patch', '/api/admin/codigos/no-existe'],
    ['delete', '/api/admin/codigos/no-existe'],
    ['post', '/api/admin/codigos/no-existe/secciones'],
    ['post', '/api/admin/codigos/no-existe/secciones/orden'],
    ['post', '/api/admin/codigos/no-existe/articulos'],
    ['post', '/api/admin/codigos/no-existe/articulos/batch'],
    ['patch', '/api/admin/secciones/no-existe'],
    ['delete', '/api/admin/secciones/no-existe'],
    ['patch', '/api/admin/articulos/no-existe'],
    ['delete', '/api/admin/articulos/no-existe'],
    ['post', '/api/admin/fuentes'],
    ['patch', '/api/admin/fuentes/no-existe'],
    ['post', '/api/admin/fuentes/no-existe/pausa'],
    ['post', '/api/admin/fuentes/no-existe/sincronizar'],
    ['post', '/api/admin/cambios/no-existe/aprobar'],
    ['post', '/api/admin/cambios/no-existe/rechazar'],
    ['post', '/api/admin/notificaciones/general'],
  ];

  for (const [metodo, ruta] of escrituras) {
    it(`${metodo.toUpperCase()} ${ruta} sin token -> 401 no_autenticado`, async () => {
      const r = await enviar(app, metodo, ruta);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'no_autenticado' });
    });

    it(`${metodo.toUpperCase()} ${ruta} con token basura -> 401 no_autenticado`, async () => {
      const r = await enviar(app, metodo, ruta, 'Bearer no.es.un.jwt');
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'no_autenticado' });
    });
  }

  it('las lecturas de administracion tambien exigen Bearer (GET /api/admin/codigos)', async () => {
    const r = await request(app).get('/api/admin/codigos');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'no_autenticado' });
  });

  it('CONTRUEBANO: con token valido el barrido NO da 401 (la ruta vive)', async () => {
    const token = await tokenAdmin(app);
    const r = await request(app).get('/api/admin/dashboard/resumen').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
  });

  it('las escrituras publicas por device_id NO estan protegidas (son anonimas por diseno)', async () => {
    // /api/app/registro es alta de dispositivo/anonima; debe responder algo que
    // NO sea 401 (400 por payload invalido es aceptable, nunca no_autenticado).
    const r = await request(app).post('/api/app/registro').send({});
    expect(r.status).not.toBe(401);
    expect(r.body?.error).not.toBe('no_autenticado');
  });
});

describe('seguridad (2) · bloqueo de login por intentos', () => {
  it('5 fallos -> 429 demasiados_intentos y luego el login valido tambien se bloquea', async () => {
    // App dedicada con el limiter de login ON y umbral bajo. Cada crearApp() trae
    // un store en memoria NUEVO e independiente.
    const app = appDePrueba({ limites: { desactivados: false, generalMax: 100_000, loginMax: 5 } });

    const intentosFallidos: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(app).post('/api/admin/auth/login').send({
        email: ADMIN_TEST.email,
        password: 'clave-muy-incorrecta-' + i,
      });
      intentosFallidos.push(r.status);
    }

    // Debe aparecer al menos un 429 tras agotar la cuota de fallos.
    expect(intentosFallidos).toContain(429);
    const i429 = intentosFallidos.indexOf(429);
    // Antes del bloqueo, los intentos son 401 (credenciales invalidas).
    for (let i = 0; i < i429; i++) expect(intentosFallidos[i]).toBe(401);

    // Una vez bloqueado, el login CORRECTO queda cortado por el limiter (429),
    // porque el limiter va montado ANTES del router y ni llega a verificar la clave.
    const bloqueado = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_TEST.email, password: ADMIN_TEST.password });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body).toEqual({ error: 'demasiados_intentos' });
  });

  it('instancia limpia (ventana nueva): el login valido SÍ pasa (200 + token)', async () => {
    // Store nuevo = contador a cero => no hay bloqueo pendiente. Demuestra que el
    // 429 anterior era por acumulacion de intentos, no una puerta cerrada.
    const app = appDePrueba({ limites: { desactivados: false, generalMax: 100_000, loginMax: 5 } });
    const r = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_TEST.email, password: ADMIN_TEST.password });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
  });
});

describe('seguridad (3) · rate limiting estricto en /api/buscar', () => {
  it('superar la cuota de busqueda -> 429 limite_excedido', async () => {
    const app = appDePrueba({ limites: { desactivados: false, generalMax: 100_000, buscarMax: 3 } });

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await request(app).get('/api/buscar').query({ q: 'acceso informacion publica' });
      statuses.push(r.status);
    }
    // Las primeras 3 pasan (200); la 4.a supera buscarMax=3 -> 429.
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);

    // El 429 lleva el codigo de error compartido.
    const r429 = await request(app).get('/api/buscar').query({ q: 'acceso informacion publica' });
    expect(r429.status).toBe(429);
    expect(r429.body).toEqual({ error: 'limite_excedido' });
  });
});

describe('seguridad (4) · NO existe autorregistro de credenciales (regla dura)', () => {
  const app = appDePrueba();

  // Ninguna de estas rutas debe CREAR credenciales (jamais 200/201). Dos casos
  // legitimos de "no publica":
  //   - bajo /api/admin/* : todo el espacio esta protegido por requireAdmin de
  //     forma blankets (router.use), asi que sin token responde 401. Esto es una
  //     garantia MAS fuerte que 404: la ruta es inalcanzable sin sesion, no solo
  //     "no existe".
  //   - bajo /api (espacio publico) : sencillamente no existe => 404.
  const rutasAdminProhibidas = [
    '/api/admin/auth/register',
    '/api/admin/auth/registro',
    '/api/admin/auth/signup',
    '/api/admin/auth/crear-admin',
    '/api/admin/auth/crear-administrador',
    '/api/admin/registro',
    '/api/admin/crear-admin',
    '/api/admin/admins',
    '/api/admin/usuarios',
  ];

  const rutasPublicasProhibidas = [
    '/api/auth/register',
    '/api/auth/signup',
    '/api/auth/registro',
    '/api/register',
    '/api/signup',
    '/api/registro',
    '/api/usuarios',
    '/api/crear-admin',
  ];

  for (const ruta of rutasAdminProhibidas) {
    it(`POST ${ruta} -> 401 (espacio admin protegido; NUNCA crea credenciales)`, async () => {
      const r = await request(app)
        .post(ruta)
        .send({ email: 'alguien@ejemplo.mx', password: 'QualquierCosalargo123', nombre: 'X' });
      expect([200, 201]).not.toContain(r.status);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'no_autenticado' });
    });
  }

  for (const ruta of rutasPublicasProhibidas) {
    it(`POST ${ruta} -> 404 ruta_no_encontrada (no es publica ni crea credenciales)`, async () => {
      const r = await request(app)
        .post(ruta)
        .send({ email: 'alguien@ejemplo.mx', password: 'QualquierCosalargo123', nombre: 'X' });
      expect([200, 201]).not.toContain(r.status);
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: 'ruta_no_encontrada' });
    });
  }

  it('el login solo VERIFICA: un email inexistente da 401 generico (no registra)', async () => {
    const r = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'no-existe@ejemplo.mx', password: 'ClaveLargaFalsa123' });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'credenciales_invalidas' });
  });
});
