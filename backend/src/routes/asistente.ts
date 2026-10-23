// Zona 12 — Rutas PUBLICAS del asistente de consultas (sin cuentas, identidad = device_id).
//
// `POST /api/asistente/chat` responde NDJSON (una linea por evento) en vez de JSON
// unico: el usuario ve la respuesta mientras el modelo la escribe. Los eventos son
//   { tipo: "fuente", fuente }   -> cita disponible, ya se puede enlazar
//   { tipo: "token",  texto }    -> fragmento de la respuesta
//   { tipo: "fin",    sinFuentes, totalFuentes, sugerencias } -> termino (las fuentes ya vinieron una por una)
//   { tipo: "error",  error }    -> codigo corto (lm_cuota_excedida, lm_sin_configurar…)
//
// `GET /api/asistente/guiado` es el chat SIN IA: la misma recuperacion de fuentes y
// las mismas sugerencias, pero sin gastar cuota ni llamar al proveedor. Es GET para
// que el Service Worker la cachee y el chat responda tambien sin conexion.
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import type { Turno } from '../llm/cliente.js';
import * as asistente from '../services/asistente.service.js';
import type { FuenteAsistente, MetaAsistente } from '../services/asistente.service.js';

export const asistenteRouter = Router();

const MAX_HISTORIAL = 8;

function esTurno(v: unknown): v is Turno {
  const t = v as Turno | undefined;
  return Boolean(t && (t.rol === 'usuario' || t.rol === 'asistente') && typeof t.texto === 'string');
}

// Estado: le dice a la app si puede ofrecer el chat. Nunca se expone la llave.
asistenteRouter.get('/asistente/estado', (_req, res) => {
  res.status(200).json(asistente.describirEstado());
});

asistenteRouter.post('/asistente/chat', async (req, res) => {
  const cuerpo = (req.body ?? {}) as { pregunta?: unknown; historial?: unknown };
  const pregunta = typeof cuerpo.pregunta === 'string' ? cuerpo.pregunta : '';
  if (!pregunta.trim()) {
    res.status(400).json(errorJson('falta_pregunta'));
    return;
  }
  if (!asistente.describirEstado().listo) {
    // Sin LLM_API_KEY no hay chat: el cliente muestra la busqueda guiada.
    res.status(503).json(errorJson('lm_sin_configurar'));
    return;
  }

  const historial = Array.isArray(cuerpo.historial)
    ? cuerpo.historial.filter(esTurno).slice(-MAX_HISTORIAL)
    : [];

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const escribir = (objeto: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(objeto)}\n`);
  };

  const emisor = {
    fuente: (f: FuenteAsistente) => escribir({ tipo: 'fuente', fuente: f }),
    token: (texto: string) => escribir({ tipo: 'token', texto }),
    fin: (meta: MetaAsistente) => {
      // Las fuentes ya se mandaron una por una: aqui solo hace falta el marcador
      // de "no habia nada" y las preguntas de seguimiento para el chat.
      escribir({
        tipo: 'fin',
        sinFuentes: meta.sinFuentes,
        totalFuentes: meta.fuentes.length,
        sugerencias: meta.sugerencias,
      });
      res.end();
    },
    error: (codigo: string) => {
      escribir({ tipo: 'error', error: codigo });
      res.end();
    },
  };

  // Si el usuario cierra la pestana o le da "Detener" se corta la llamada al
  // proveedor: seguir generando costaria cuota sin nadie que lo lea. Se usa
  // `res` (no `req`): en Node el 'close' del request tambien salta al terminar
  // de leer el cuerpo, y ahi la respuesta sigue en curso.
  const control = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) control.abort();
  });

  await asistente.preguntar({ pregunta, historial }, emisor, { senal: control.signal });
});

asistenteRouter.get('/asistente/guiado', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q.trim()) {
    res.status(400).json(errorJson('falta_pregunta'));
    return;
  }
  try {
    const fuentes = await asistente.recuperarFuentes(q);
    res.status(200).json({ fuentes, sugerencias: asistente.sugerenciasDe(fuentes) });
  } catch (e) {
    console.error('[asistente] fallo la busqueda guiada:', e);
    res.status(500).json(errorJson('error_interno'));
  }
});
