// Zona 5 — Favoritos por device_id (API PUBLICA, sin autenticacion de administrador).
//
// Regla de producto inquebrantable: el usuario final NUNCA se registra con
// cuenta/contrasena. La identidad de la app es SOLO un `device_id` generado en
// el propio dispositivo; el "registro" de esta zona es una etiqueta OPCIONAL
// (nombre/correo) sobre ese device_id, sin credenciales.
//
// Este servicio SIEMPRE filtra por deviceId: un dispositivo jamas puede leer ni
// borrar favoritos de otro.
import type { Favorito } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { extracto } from '../utils/text.js';

const EXTRACTO_FAVORITO = 140;
const DEVICE_ID_MAX = 200;
const NOMBRE_MAX = 120;
const EMAIL_MAX = 254;

/** Resultado de una operacion: datos o error HTTP ya tipificado (lo traduce la ruta). */
export type Resultado<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

// ---------- Utilidades de entrada ----------

/** Cadena recortada o null (si no es string / esta vacia / es demasiado larga). */
function texto(value: unknown, max = DEVICE_ID_MAX): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t || t.length > max) return null;
  return t;
}

/** Cadena opcional: null si viene vacia; `error` si viene malformada (la ruta da 400). */
function textoOpcional(value: unknown, max: number): { valor: string | null } | { error: true } {
  if (value == null) return { valor: null };
  if (typeof value !== 'string') return { error: true };
  const t = value.trim();
  if (!t) return { valor: null };
  if (t.length > max) return { error: true };
  return { valor: t };
}

// ---------- Salida camelCase ----------

export interface FavoritoCorto {
  id: string;
  articuloId: string;
  creadoEn: string;
}

export interface FavoritoListaItem {
  id: string;
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  esApartadoClave: boolean;
  vigente: boolean;
  extracto: string;
  creadoEn: string;
}

export interface UsuarioAppResumen {
  id: string;
  deviceId: string;
  nombre: string | null;
  email: string | null;
}

function aFavoritoCorto(f: Favorito): FavoritoCorto {
  return { id: f.id, articuloId: f.articuloId, creadoEn: f.creadoEn.toISOString() };
}

// ---------- Usuario anonimo por device_id ----------

/** Devuelve el usuario_app del deviceId, creandolo si es la primera vez. */
async function asegurarUsuarioApp(deviceId: string) {
  return prisma.usuarioApp.upsert({
    where: { deviceId },
    update: {},
    create: { deviceId },
  });
}

// ---------- 1) POST /api/favoritos (idempotente) ----------

export async function agregar(
  deviceIdInput: unknown,
  articuloIdInput: unknown,
): Promise<Resultado<{ favorito: FavoritoCorto }>> {
  const deviceId = texto(deviceIdInput);
  if (!deviceId) return { ok: false, status: 400, error: 'deviceId_requerido' };

  const articuloId = texto(articuloIdInput, 100);
  if (!articuloId) return { ok: false, status: 404, error: 'articulo_no_encontrado' };

  const articulo = await prisma.articulo.findUnique({
    where: { id: articuloId },
    select: { id: true },
  });
  if (!articulo) return { ok: false, status: 404, error: 'articulo_no_encontrado' };

  const usuario = await asegurarUsuarioApp(deviceId);

  // Idempotencia: si ya estaba favorito se devuelve el existente (sin duplicados
  // y sin error). La carrera entre dos POST se resuelve recuperando la fila.
  try {
    const favorito = await prisma.favorito.upsert({
      where: { usuarioAppId_articuloId: { usuarioAppId: usuario.id, articuloId } },
      update: {},
      create: { usuarioAppId: usuario.id, articuloId },
    });
    return { ok: true, status: 200, data: { favorito: aFavoritoCorto(favorito) } };
  } catch (e) {
    const existente = await prisma.favorito.findUnique({
      where: { usuarioAppId_articuloId: { usuarioAppId: usuario.id, articuloId } },
    });
    if (existente) return { ok: true, status: 200, data: { favorito: aFavoritoCorto(existente) } };
    throw e;
  }
}

// ---------- 2) GET /api/favoritos?deviceId=... ----------

export async function listar(
  deviceIdInput: unknown,
): Promise<Resultado<{ favoritos: FavoritoListaItem[] }>> {
  const deviceId = texto(deviceIdInput);
  if (!deviceId) return { ok: false, status: 400, error: 'deviceId_requerido' };

  const usuario = await prisma.usuarioApp.findUnique({ where: { deviceId } });
  if (!usuario) return { ok: true, status: 200, data: { favoritos: [] } };

  const favoritos = await prisma.favorito.findMany({
    where: { usuarioAppId: usuario.id },
    include: { articulo: { include: { codigo: true } } },
    orderBy: { creadoEn: 'desc' },
  });

  return {
    ok: true,
    status: 200,
    data: {
      favoritos: favoritos.map((f) => ({
        id: f.id,
        articuloId: f.articuloId,
        codigoSlug: f.articulo.codigo.slug,
        codigoNombre: f.articulo.codigo.nombre,
        numero: f.articulo.numero,
        esApartadoClave: f.articulo.esApartadoClave,
        vigente: f.articulo.vigente,
        extracto: extracto(f.articulo.texto, EXTRACTO_FAVORITO),
        creadoEn: f.creadoEn.toISOString(),
      })),
    },
  };
}

// ---------- 3) DELETE /api/favoritos/:id?deviceId=... ----------

export async function eliminar(
  idInput: unknown,
  deviceIdInput: unknown,
): Promise<Resultado<{ ok: true; id: string }>> {
  const deviceId = texto(deviceIdInput);
  if (!deviceId) return { ok: false, status: 400, error: 'deviceId_requerido' };

  const id = texto(idInput, 100);
  if (!id) return { ok: false, status: 404, error: 'no_encontrado' };

  // El filtro por relacion garantiza que solo se borra un favorito PROPIO.
  const propio = await prisma.favorito.findFirst({ where: { id, usuarioApp: { deviceId } } });
  if (!propio) return { ok: false, status: 404, error: 'no_encontrado' };

  await prisma.favorito.delete({ where: { id } });
  return { ok: true, status: 200, data: { ok: true, id } };
}

// ---------- 4) POST /api/app/registro (etiqueta OPCIONAL, sin contrasena) ----------

export async function registrar(
  deviceIdInput: unknown,
  nombreInput: unknown,
  emailInput: unknown,
): Promise<Resultado<{ usuarioApp: UsuarioAppResumen }>> {
  const deviceId = texto(deviceIdInput);
  if (!deviceId) return { ok: false, status: 400, error: 'deviceId_requerido' };

  const nombre = textoOpcional(nombreInput, NOMBRE_MAX);
  if ('error' in nombre) return { ok: false, status: 400, error: 'nombre_invalido' };

  const email = textoOpcional(emailInput, EMAIL_MAX);
  if ('error' in email) return { ok: false, status: 400, error: 'email_invalido' };
  if (email.valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.valor)) {
    return { ok: false, status: 400, error: 'email_invalido' };
  }

  // No se pisa un dato existente con vacio: `undefined` = "no tocar" en Prisma.
  const datos = {
    ...(nombre.valor !== null ? { nombre: nombre.valor } : {}),
    ...(email.valor !== null ? { email: email.valor } : {}),
  };

  const usuario = await prisma.usuarioApp.upsert({
    where: { deviceId },
    update: datos,
    create: { deviceId, ...datos },
  });

  return {
    ok: true,
    status: 200,
    data: {
      usuarioApp: {
        id: usuario.id,
        deviceId: usuario.deviceId,
        nombre: usuario.nombre,
        email: usuario.email,
      },
    },
  };
}
