// Zona 3: rutas publicas de consulta (SOLO GET / solo lectura, sin autenticacion).
// Se montan sobre la base /api existente (ver server.ts).
import { Router } from 'express';
import { errorJson } from '../http/errors.js';
import * as consulta from '../services/consulta.service.js';
import * as salto from '../services/salto.service.js';

export const consultaRouter = Router();

// 1) Listado de codigos de la biblioteca.
consultaRouter.get('/codigos', async (_req, res) => {
  const codigos = await consulta.getListaCodigos();
  res.status(200).json({ codigos });
});

// 4) Busqueda de texto completo (se define antes que /:slug para claridad de rutas).
consultaRouter.get('/buscar', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q.trim()) {
    res.status(400).json(errorJson('falta_query'));
    return;
  }
  const codigo =
    typeof req.query.codigo === 'string' && req.query.codigo.trim() ? req.query.codigo : undefined;

  const limiteRaw = Number(req.query.limit);
  const limit =
    Number.isFinite(limiteRaw) && limiteRaw >= 1 ? Math.min(Math.floor(limiteRaw), 100) : 30;

  const respuesta = await consulta.buscar(q, codigo, limit);
  res.status(200).json(respuesta);
});

// 4b) Salto directo por numero de articulo: "art 151", "11 bis", "transitorio primero".
// Es un filtro por el campo `numero`, mucho mas barato que /buscar, asi que solo le
// aplica el limitador general de /api (ver app.ts).
consultaRouter.get('/salto', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q.trim()) {
    res.status(400).json(errorJson('falta_query'));
    return;
  }
  const codigo =
    typeof req.query.codigo === 'string' && req.query.codigo.trim() ? req.query.codigo.trim() : undefined;

  res.status(200).json(await salto.saltarArticulo(q.trim(), codigo));
});

// 5) Apartados clave de todos los codigos.
consultaRouter.get('/apartados-clave', async (_req, res) => {
  const apartados = await consulta.getApartadosClave();
  res.status(200).json({ apartados });
});

// 2) Arbol jerarquico de un codigo por slug.
consultaRouter.get('/codigos/:slug', async (req, res) => {
  const detalle = await consulta.getCodigoDetalle(req.params.slug);
  if (!detalle) {
    res.status(404).json(errorJson('no_encontrado'));
    return;
  }
  res.status(200).json(detalle);
});

// 3) Detalle de un articulo por codigo + numero.
consultaRouter.get('/codigos/:slug/articulos/:numero', async (req, res) => {
  const detalle = await consulta.getArticuloDetalle(req.params.slug, req.params.numero);
  if (!detalle) {
    res.status(404).json(errorJson('no_encontrado'));
    return;
  }
  res.status(200).json(detalle);
});
