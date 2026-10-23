// Zona 12 — Pruebas del asistente de consultas.
//
// La suite NUNCA llama a un proveedor de IA real: la orquestacion se prueba con un
// generador inyectable y el chat por HTTP con `fetch` simulado (SSE del dialecto
// Gemini). Lo que si se ejercita de verdad es la recuperacion sobre el acervo
// (fixtures de Zona 6/11), el armado del contexto, los codigos de error y el
// rate limiting.
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { codigoPorFalla, ErrorLlm, type PedidoLlm } from '../llm/cliente.js';
import {
  construirContexto,
  describirEstado,
  preguntar,
  recuperarFuentes,
  sugerenciasDe,
  temaDeLaPregunta,
  ventanasDelTema,
  type EmisorAsistente,
  type FuenteAsistente,
} from '../services/asistente.service.js';
import { appDePrueba } from './helpers/http.js';
import { V1_HTML, borrarEscenario, crearEscenarioFixture } from './helpers/fixture.js';

/** Emisor espia: guarda las lineas del stream en el orden en que salieron. */
function emisorEspia() {
  const eventos: string[] = [];
  const fuentes: FuenteAsistente[] = [];
  let meta: {
    texto: string;
    sinFuentes: boolean;
    fuentes: FuenteAsistente[];
    sugerencias: string[];
  } | null = null;
  let codigoError: string | null = null;
  const emisor: EmisorAsistente = {
    fuente: (f) => {
      eventos.push('fuente');
      fuentes.push(f);
    },
    token: (t) => {
      eventos.push('token');
      meta = {
        texto: `${meta?.texto ?? ''}${t}`,
        sinFuentes: meta?.sinFuentes ?? false,
        fuentes,
        sugerencias: meta?.sugerencias ?? [],
      };
    },
    fin: (m) => {
      eventos.push('fin');
      meta = { texto: meta?.texto ?? '', sinFuentes: m.sinFuentes, fuentes: m.fuentes, sugerencias: m.sugerencias };
    },
    error: (c) => {
      eventos.push('error');
      codigoError = c;
    },
  };
  return { emisor, eventos, fuentes, meta: () => meta, error: () => codigoError };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('asistente (1) · sin llave no hay chat, pero si hay estado claro', () => {
  const app = appDePrueba();

  it('GET /api/asistente/estado dice listo:false y no expone ninguna llave', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    expect(describirEstado()).toEqual({ listo: false, proveedor: null, modelo: null });

    const r = await request(app).get('/api/asistente/estado');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ listo: false, proveedor: null, modelo: null });
  });

  it('el estado SI muestra proveedor/modelo cuando hay llave (la llave jamas sale)', async () => {
    vi.stubEnv('LLM_API_KEY', 'llave-super-secreta');
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_MODELO', '');
    const estado = describirEstado();
    expect(estado).toEqual({ listo: true, proveedor: 'gemini', modelo: 'gemini-3.8-flash' });

    const r = await request(app).get('/api/asistente/estado');
    expect(JSON.stringify(r.body)).not.toContain('llave-super-secreta');
  });

  it('POST vacio -> 400 falta_pregunta', async () => {
    const r = await request(app).post('/api/asistente/chat').send({ pregunta: '   ' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'falta_pregunta' });
  });

  it('POST con pregunta pero sin llave -> 503 lm_sin_configurar', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const r = await request(app).post('/api/asistente/chat').send({ pregunta: 'acceso información' });
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'lm_sin_configurar' });
  });
});

describe('asistente (1b) · fallas del proveedor traducidas a codigos accionables', () => {
  it.each([
    [401, '{"error":{"code":401,"message":"Request had invalid authentication credentials."}}', 'lm_llave_invalida'],
    [403, '{"error":{"message":"API key not valid. Please pass a valid API key."}}', 'lm_llave_invalida'],
    [403, '{"error":{"message":"Your project has been denied access."}}', 'lm_sin_acceso'],
    [404, 'This model models/gemini-2.5-flash is no longer available to new users', 'lm_modelo_no_disponible'],
    [429, 'RESOURCE_EXHAUSTED', 'lm_cuota_excedida'],
    [500, 'internal', 'lm_no_responde'],
  ])('estado %i con %s -> %s', (status, detalle, esperado) => {
    expect(codigoPorFalla(status, detalle)).toBe(esperado);
  });
});

describe('asistente (2) · recuperacion sobre NUESTROS libros', () => {
  const app = appDePrueba();
  let esc: { fuenteId: string; codigoId: string; slug: string };

  beforeAll(async () => {
    esc = await crearEscenarioFixture('asist12', V1_HTML);
  });
  afterAll(async () => {
    await borrarEscenario(esc);
  });

  it('una pregunta de tema devuelve articulos reales del acervo como fuentes', async () => {
    const fuentes = await recuperarFuentes('¿Qué dice del acceso a la información?');
    expect(fuentes.length).toBeGreaterThan(0);
    expect(fuentes.length).toBeLessThanOrEqual(4);
    // Numeradas desde 1 y con texto: eso es lo unico que vera el modelo.
    expect(fuentes.map((f) => f.n)).toEqual(fuentes.map((_, i) => i + 1));
    for (const f of fuentes) {
      expect(f.texto.length).toBeGreaterThan(0);
      expect(f.codigoSlug.length).toBeGreaterThan(0);
    }
    expect(fuentes.some((f) => f.codigoSlug === esc.slug)).toBe(true);
  });

  it('una pregunta larga que no casa tal cual se recorta hasta encontrar el tema', async () => {
    // "tramite" no esta en el articulo y el FTS ANDA los terminos: sin recortes esto
    // seria un "no encontré", que es justamente lo que el chat no debe decir.
    const fuentes = await recuperarFuentes('¿Cuál es el trámite del acceso a la información?');
    expect(fuentes.length).toBeGreaterThan(0);
    expect(fuentes.some((f) => f.codigoSlug === esc.slug)).toBe(true);
  });

  it('ventanasDelTema prueba las ventanas largas antes que las palabras sueltas', () => {
    expect(ventanasDelTema('tramite acceso informacion publica')).toEqual([
      'tramite acceso informacion',
      'acceso informacion publica',
      'tramite acceso',
      'acceso informacion',
      'informacion publica',
      // sueltas, de la mas larga (la especifica del tema) a la mas corta
      'informacion',
      'tramite',
      'publica',
      'acceso',
    ]);
  });

  it('un numero de articulo en medio de la frase entra primero', async () => {
    const nombreLibro = esc.slug.split('-').join(' ');
    const fuentes = await recuperarFuentes(`¿Qué dice el artículo 1 del ${nombreLibro}?`);
    expect(fuentes.length).toBeGreaterThan(0);
    expect(fuentes[0].numero).toBe('1');
  });

  it('temaDeLaPregunta quita el ruido de la pregunta y deja el tema', () => {
    expect(temaDeLaPregunta('¿Qué dice el artículo 7 sobre los plazos para recurrir?')).toBe(
      'plazos recurrir',
    );
    // Los acentos se conservan: son los que indexa el config `spanish` de Postgres.
    expect(temaDeLaPregunta('¿Qué dice del acceso a la información?')).toBe('acceso información');
  });

  it('construirContexto marca el numero, la fuente y si esta derogado', () => {
    const contexto = construirContexto([
      {
        n: 1,
        articuloId: 'a1',
        codigoSlug: 'demo',
        codigoNombre: 'Código Demo',
        numero: '7 BIS',
        vigente: false,
        texto: 'Texto normativo de prueba.',
      },
    ]);
    expect(contexto).toContain('[1] Código Demo — artículo 7 BIS (DEROGADO)');
    expect(contexto).toContain('Texto normativo de prueba.');
    expect(contexto).toContain('unica informacion que puedes usar');
  });

  it('si no hay nada en el acervo se responde SIN gastar llamada al modelo', async () => {
    const esp = emisorEspia();
    const generar = vi.fn(async () => {
      throw new Error('no debe llamarse al proveedor');
    });
    await preguntar({ pregunta: 'blorpfnord ñññ', historial: [] }, esp.emisor, { generar });
    expect(generar).not.toHaveBeenCalled();
    expect(esp.eventos).toEqual(['token', 'fin']);
    expect(esp.meta()?.sinFuentes).toBe(true);
    expect(esp.meta()?.sugerencias).toEqual([]);
    expect(esp.meta()?.texto).toContain('No encontré');
  });

  it('cuando hay fuentes, el evento fin trae sus sugerencias', async () => {
    const esp = emisorEspia();
    await preguntar(
      { pregunta: 'acceso a la información', historial: [] },
      esp.emisor,
      { generar: async () => 'El acceso está garantizado [1].' },
    );
    expect(esp.meta()?.sinFuentes).toBe(false);
    expect(esp.meta()?.sugerencias.length).toBeGreaterThan(0);
  });

  it('las sugerencias solo salen de los articulos que ya encontramos', () => {
    const f = (n: number, codigoNombre: string, numero: string): FuenteAsistente => ({
      n,
      articuloId: `a${n}`,
      codigoSlug: 'demo',
      codigoNombre,
      numero,
      vigente: true,
      texto: 'x',
    });
    expect(sugerenciasDe([])).toEqual([]);

    // El mismo numero en dos libros -> pregunta por los libros, no por un tema inventado.
    expect(
      sugerenciasDe([f(1, 'Código Penal Federal', '151'), f(2, 'Código Penal para el Estado de Quintana Roo', '151')]),
    ).toEqual([
      '¿Qué dice el artículo 151 de Penal para el Estado de Quintana Roo?',
      '¿En qué libros está el artículo 151?',
    ]);

    // Numerico y en un solo libro.
    expect(sugerenciasDe([f(1, 'Código Penal Federal', '151')])).toEqual([
      '¿Qué más dice el libro sobre el artículo 151?',
    ]);

    // Un ordinal impreso (los transitorios) no empieza con digito: se pregunta por el.
    expect(sugerenciasDe([f(1, 'Código Civil para el Estado de Quintana Roo', 'PRIMERO')])).toEqual([
      '¿Qué dice el artículo PRIMERO de Civil para el Estado de Quintana Roo?',
    ]);
  });

  it('GET /api/asistente/guiado responde fuentes y sugerencias sin tocar la IA', async () => {
    const r = await request(app)
      .get('/api/asistente/guiado')
      .query({ q: '¿Qué dice del acceso a la información?' });
    expect(r.status).toBe(200);
    expect(r.body.fuentes.length).toBeGreaterThan(0);
    expect(r.body.sugerencias.length).toBeGreaterThan(0);
    expect(r.body.fuentes[0]).toMatchObject({ n: 1, numero: expect.any(String) });
  });

  it('GET /api/asistente/guiado con pregunta vacia -> 400 falta_pregunta', async () => {
    const r = await request(app).get('/api/asistente/guiado').query({ q: '   ' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'falta_pregunta' });
  });
});

describe('asistente (3) · orquestacion con generador falso', () => {
  let esc: { fuenteId: string; codigoId: string; slug: string };

  beforeAll(async () => {
    esc = await crearEscenarioFixture('asist12b', V1_HTML);
  });
  afterAll(async () => {
    await borrarEscenario(esc);
  });

  it('emite las fuentes ANTES de los tokens y cierra con fin', async () => {
    const esp = emisorEspia();
    const pedidos: PedidoLlm[] = [];
    await preguntar(
      { pregunta: 'acceso a la información', historial: [] },
      esp.emisor,
      {
        generar: async (pedido) => {
          pedidos.push(pedido);
          pedido.onFragmento?.('El artículo 1 dice que ');
          pedido.onFragmento?.('el acceso es garantizado [1].');
          return 'El artículo 1 dice que el acceso es garantizado [1].';
        },
      },
    );

    expect(esp.eventos).toEqual([
      ...esp.fuentes.map(() => 'fuente'),
      'token',
      'token',
      'fin',
    ]);
    expect(esp.meta()?.texto).toContain('El artículo 1 dice que el acceso es garantizado [1].');
    expect(esp.meta()?.sinFuentes).toBe(false);

    // El contexto de las fuentes va pegado a la pregunta dentro del ultimo turno.
    const ultimo = pedidos[0].turnos.at(-1)!;
    expect(ultimo.rol).toBe('usuario');
    expect(ultimo.texto).toContain('FUENTES DEL ACERVO');
    expect(ultimo.texto).toContain('PREGUNTA: acceso a la información');
    expect(pedidos[0].sistema).toContain('Cita entre corchetes');
    expect(pedidos[0].sistema).toContain('NO adivines');
    expect(pedidos[0].sistema).toContain('Siguiente paso');
  });

  it('el historial se recorta y el turno del modelo usa rol asistente', async () => {
    const esp = emisorEspia();
    let turnos: PedidoLlm['turnos'] = [];
    await preguntar(
      {
        pregunta: 'acceso a la información',
        historial: [
          { rol: 'usuario', texto: 'p1' },
          { rol: 'asistente', texto: 'r1' },
          { rol: 'usuario', texto: 'p2' },
          { rol: 'asistente', texto: 'r2' },
          { rol: 'usuario', texto: 'p3' },
          { rol: 'asistente', texto: 'r3' },
          { rol: 'usuario', texto: 'p4' },
        ],
      },
      esp.emisor,
      {
        generar: async (pedido) => {
          turnos = pedido.turnos;
          return 'ok';
        },
      },
    );
    // MAX_TURNOS_HISTORIAL = 6, mas el turno de la pregunta actual.
    expect(turnos).toHaveLength(7);
    expect(turnos[0].texto).toBe('r1');
    expect(turnos[5].texto).toBe('p4');
    expect(turnos[6].texto).toContain('PREGUNTA: acceso a la información');
  });

  it('un ErrorLlm del proveedor baja a un evento error con su codigo corto', async () => {
    const esp = emisorEspia();
    await preguntar({ pregunta: 'acceso a la información', historial: [] }, esp.emisor, {
      generar: async () => {
        throw new ErrorLlm('lm_cuota_excedida', '429 del proveedor');
      },
    });
    expect(esp.error()).toBe('lm_cuota_excedida');
    expect(esp.eventos.at(-1)).toBe('error');
  });

  it('una cancelacion del usuario no se registra como fallo', async () => {
    const esp = emisorEspia();
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    await preguntar({ pregunta: 'acceso a la información', historial: [] }, esp.emisor, {
      generar: async () => {
        throw new ErrorLlm('lm_cancelado', 'el usuario paró');
      },
    });
    expect(esp.error()).toBe('lm_cancelado');
    expect(consola).not.toHaveBeenCalled();
    consola.mockRestore();
  });
});

describe('asistente (4) · chat por HTTP con el proveedor simulado', () => {
  const app = appDePrueba();
  let esc: { fuenteId: string; codigoId: string; slug: string };

  beforeAll(async () => {
    esc = await crearEscenarioFixture('asist12c', V1_HTML);
  });
  afterAll(async () => {
    await borrarEscenario(esc);
  });

  /** Response SSE al modo Gemini: un evento por fragmento. */
  function sseGemini(fragmentos: string[]): Response {
    const cuerpo = new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder();
        for (const f of fragmentos) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: f }] } }] })}\n\n`));
        }
        c.close();
      },
    });
    return new Response(cuerpo, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  it('stream ndjson: fuentes, tokens y fin; la llave no aparece en la respuesta', async () => {
    vi.stubEnv('LLM_API_KEY', 'llave-de-prueba-no-real');
    const fetchFake = vi.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toContain(':streamGenerateContent');
      expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('llave-de-prueba-no-real');
      return sseGemini(['Según el acervo, el acceso está garantizado [1].', ' Más detalle [2].']);
    });
    vi.stubGlobal('fetch', fetchFake);

    const r = await request(app)
      .post('/api/asistente/chat')
      .send({ pregunta: 'acceso a la información', deviceId: 'device-asist12' });

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/x-ndjson');
    expect(r.headers['cache-control']).toContain('no-store');

    const eventos = r.text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { tipo: string; texto?: string; fuente?: FuenteAsistente; sinFuentes?: boolean });

    const tipos = eventos.map((e) => e.tipo);
    expect(tipos[0]).toBe('fuente');
    expect(tipos.filter((t) => t === 'token').length).toBeGreaterThan(0);
    expect(tipos.at(-1)).toBe('fin');
    expect(eventos.filter((e) => e.tipo === 'fuente').length).toBeGreaterThan(0);
    const texto = eventos
      .filter((e) => e.tipo === 'token')
      .map((e) => e.texto)
      .join('');
    expect(texto).toContain('el acceso está garantizado [1]');
    expect(r.text).not.toContain('llave-de-prueba-no-real');
    expect(fetchFake).toHaveBeenCalled();
  });

  it('un 401 del proveedor se traduce a lm_llave_invalida en el stream', async () => {
    vi.stubEnv('LLM_API_KEY', 'llave-mala');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"API key not valid"}}', { status: 401 })),
    );

    const r = await request(app)
      .post('/api/asistente/chat')
      .send({ pregunta: 'acceso a la información', deviceId: 'device-asist12-401' });

    expect(r.status).toBe(200);
    const ultimo = JSON.parse(r.text.trim().split('\n').at(-1)!) as { tipo: string; error?: string };
    expect(ultimo).toEqual({ tipo: 'error', error: 'lm_llave_invalida' });
  });

  it('el limiter de asistente corta por dispositivo (429 limite_excedido)', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const appLimitada = appDePrueba({
      limites: { desactivados: false, generalMax: 100_000, asistenteMax: 2 },
    });
    const cuerpo = { pregunta: 'acceso a la información', deviceId: 'device-asist12-limiter' };
    const estados: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await request(appLimitada).post('/api/asistente/chat').send(cuerpo);
      estados.push(r.status);
    }
    expect(estados.slice(0, 2)).toEqual([503, 503]);
    expect(estados[2]).toBe(429);
    const r429 = await request(appLimitada).post('/api/asistente/chat').send(cuerpo);
    expect(r429.body).toEqual({ error: 'limite_excedido' });
  });
});
