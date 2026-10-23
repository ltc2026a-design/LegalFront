// Zona 5 — Rutas PUBLICAS de favoritos y de la etiqueta opcional de dispositivo.
//
// NO llevan autenticacion de administrador: la identidad es el `device_id` que
// la app genera en el propio dispositivo. Por eso todo lo de aqui esta pensado
// para poder anadir rate limiting por IP/device en la Zona 11 sin tocar la
// logica (los handlers son finos y delegan 100% en el servicio).
//
// Respuestas JSON en camelCase, errores con la forma compartida { error: "..." }.
import { type Response, Router } from 'express';
import { errorJson } from '../http/errors.js';
import * as favoritos from '../services/favoritos.service.js';
import type { Resultado } from '../services/favoritos.service.js';

export const favoritosRouter = Router();

/** Traduce un Resultado del servicio a su respuesta HTTP correspondiente. */
function responder<T>(res: Response, resultado: Resultado<T>): void {
  if (!resultado.ok) {
    res.status(resultado.status).json(errorJson(resultado.error));
    return;
  }
  res.status(resultado.status).json(resultado.data);
}

// 1) Guardar un articulo (idempotente: si ya era favorito, devuelve el existente).
favoritosRouter.post('/favoritos', async (req, res) => {
  const cuerpo = (req.body ?? {}) as { deviceId?: unknown; articuloId?: unknown };
  responder(res, await favoritos.agregar(cuerpo.deviceId, cuerpo.articuloId));
});

// 2) Listar los favoritos del dispositivo (ordenados por creadoEn descendente).
favoritosRouter.get('/favoritos', async (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
  responder(res, await favoritos.listar(deviceId));
});

// 3) Quitar un favorito SOLO si pertenece al usuario_app de ese deviceId.
favoritosRouter.delete('/favoritos/:id', async (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
  responder(res, await favoritos.eliminar(req.params.id, deviceId));
});

// 4) "Registro" OPCIONAL de etiqueta (nombre/correo) sobre el device_id.
//    No es alta de cuenta: no hay contrasena ni login. Ver regla de producto.
favoritosRouter.post('/app/registro', async (req, res) => {
  const cuerpo = (req.body ?? {}) as { deviceId?: unknown; nombre?: unknown; email?: unknown };
  responder(res, await favoritos.registrar(cuerpo.deviceId, cuerpo.nombre, cuerpo.email));
});
