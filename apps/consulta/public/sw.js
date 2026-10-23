/*
 * Zona 5 — Service Worker de la app web de consulta.
 *
 * Escrito "a mano" (sin Workbox) a proposito: la Zona 10 empaqueta esta misma
 * app en Capacitor/Tauri y ahi se usara almacenamiento local nativo, asi que
 * esta logica no debe atarse a ninguna libreria.
 *
 * Estrategias:
 *  - App shell (index.html y assets del build): se precacha en install y se
 *    sirve con network-first + fallback a cache, para que la SPA abra offline.
 *  - GET de /api: NETWORK-FIRST con CACHE-FALLBACK por URL completa. Si la red responde
 *    bien, se guarda la respuesta; si la red falla (o el backend esta caido) se sirve lo
 *    guardado y se marca con la cabecera `X-Served-By: cache` para que la app muestre el
 *    aviso de sin conexion.
 *  - Mejora (offline de libros): el contenido de los LIBROS (lista de codigos, arbol de
 *    un codigo y detalle de articulo) se guarda en una cache APARTE y mas grande que la
 *    de busquedas. Asi buscar mucho no expulsa el texto de los libros ya vistos, que son
 *    los que de verdad hace falta leer sin conexion.
 *  - Tamano de cache acotado: se recortan las entradas mas antiguas (la Cache
 *    API no guarda TTL, asi que se asume el orden de insercion de keys()).
 */

const VERSION = 'legal-consulta-v4';
const CACHE_SHELL = `${VERSION}-shell`;
const CACHE_API = `${VERSION}-api`; // contenido de los libros + favoritos (cap grande)
const CACHE_BUSQUEDA = `${VERSION}-busqueda`; // /buscar y /salto, efimeras (cap chico)
const MAX_API = 600;
const MAX_BUSQUEDA = 60;
const MAX_SHELL = 64;

/** Rutas internas de Vite en desarrollo (HMR, modulos crudos): no se tocan. */
function esRutaDeHerramientas(url) {
  return url.pathname.includes('/@') || url.pathname.startsWith('/api/health');
}

/** Cualquier GET cuyo path empiece por /api (mismo origen o backend en :3000). */
function esPeticionDeApi(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

/**
 * Datos PRIVADOS de una persona: nunca se guardan en la cache del navegador.
 * Son GET, asi que este listener los interceptaria; se dejan pasar en crudo
 * para que offline la pantalla de perfil simplemente avise (no lea el perfil
 * de quien uso el telefono antes).
 */
function esRutaPrivada(url) {
  return url.pathname === '/api/app/yo' || url.pathname === '/api/admin/auth/me';
}

function urlsDelShell() {
  const scope = self.registration.scope;
  return [scope, new URL('index.html', scope).href];
}

/** Busquedas y saltos por numero: consultas cambiantes, no son "el libro". */
function esBusqueda(url) {
  return url.pathname === '/api/buscar' || url.pathname.startsWith('/api/buscar/') ||
    url.pathname === '/api/salto' || url.pathname.startsWith('/api/salto/');
}

/** Recorta la cache dejando solo las `max` entradas mas recientes. */
async function recortarCache(cache, max) {
  const claves = await cache.keys();
  if (claves.length <= max) return;
  const sobrantes = claves.slice(0, claves.length - max);
  await Promise.all(sobrantes.map((request) => cache.delete(request)));
}

/** Copia una respuesta guardada anadiendo la cabecera que detecta el frontend. */
function marcadoDeCache(res) {
  const headers = new Headers(res.headers);
  headers.set('X-Served-By', 'cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function sinRespuesta({ api }) {
  if (api) {
    return new Response(JSON.stringify({ error: 'sin_conexion' }), {
      status: 504,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response('Contenido no disponible sin conexión.', { status: 504 });
}

/** Network-first con cache-fallback. `navegacion` => cae al shell si no hay nada. */
async function redPrimeraConCache(request, cacheName, opciones) {
  const { api = false, navegacion = false, max = MAX_API } = opciones ?? {};
  const cache = await caches.open(cacheName);

  try {
    const respuesta = await fetch(request);
    if (respuesta && respuesta.ok && respuesta.type !== 'opaque') {
      await cache.put(request, respuesta.clone());
      await recortarCache(cache, max);
    }
    return respuesta;
  } catch {
    const guardado = await cache.match(request);
    if (guardado) return marcadoDeCache(guardado);

    if (navegacion) {
      for (const url of urlsDelShell()) {
        const shell = await cache.match(url);
        if (shell) return marcadoDeCache(shell);
      }
    }

    // Nada guardado: se avisa con 504 (el frontend traduce "sin_conexion").
    return sinRespuesta({ api });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      await Promise.all(
        urlsDelShell().map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch {
            // Sin red durante la instalacion: se intentara de nuevo mas adelante.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(
        claves
          .filter((k) => k !== CACHE_SHELL && k !== CACHE_API && k !== CACHE_BUSQUEDA)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (esRutaDeHerramientas(url)) return;
  if (esRutaPrivada(url)) return;

  const api = esPeticionDeApi(url);
  const mismoOrigen = url.origin === self.location.origin;
  // No se interfiere con peticiones externas (fuentes oficiales, CDN, etc.).
  if (!api && !mismoOrigen) return;

  const navegacion = request.mode === 'navigate' || request.destination === 'document';

  // Los libros van a su propia cache grande; las busquedas a una chica para que no
  // desalojen el texto que hace falta leer sin conexion.
  if (api && esBusqueda(url)) {
    event.respondWith(redPrimeraConCache(request, CACHE_BUSQUEDA, { api, max: MAX_BUSQUEDA }));
    return;
  }

  const cacheName = api ? CACHE_API : CACHE_SHELL;
  const max = api ? MAX_API : MAX_SHELL;
  event.respondWith(redPrimeraConCache(request, cacheName, { api, navegacion, max }));
});

// ---------------------------------------------------------------------------
// Zona 9 — Web Push.
//
// Estrategias de cache (Zona 5) quedan INTACTAS: aqui solo se ANADEN los dos
// listeners de push. El backend envia un payload JSON { titulo, mensaje, url?,
// articuloId? } firmado con nuestra clave VAPID local; el Service Worker lo
// convierte en notificacion nativa y abre el articulo al hacer clic.
// ---------------------------------------------------------------------------

/** Ruta interna a abrir al pulsar el aviso (siempre sobre el scope de la app). */
function urlDeNotificacion(data) {
  const ruta = typeof data.url === 'string' && data.url ? data.url : '/';
  try {
    return new URL(ruta, self.registration.scope).href;
  } catch {
    return self.registration.scope;
  }
}

/** Lee el payload push (JSON { titulo, mensaje, url?, articuloId? }) con tolerancia. */
function leerPayloadPush(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    // no es JSON: se intenta como texto plano en el cuerpo.
  }
  try {
    const texto = event.data.text();
    return texto ? { mensaje: texto } : {};
  } catch {
    return {};
  }
}

/**
 * Fase 4 — preferencias que la app duplica en IndexedDB.
 * El Service Worker NO tiene localStorage, y la franja de silencio tiene que
 * respetarse aunque la app este cerrada: IndexedDB es el unico sitio que ambos lados
 * pueden leer sin levantar la pagina.
 */
const IDB_PREFS = 'legal-preferencias';
const IDB_PREFS_STORE = 'preferencias';
const IDB_PREFS_CLAVE = 'activos';

function leerPreferenciasDelDispositivo() {
  return new Promise((resolve) => {
    try {
      const apertura = indexedDB.open(IDB_PREFS, 1);
      apertura.onsuccess = () => {
        const db = apertura.result;
        if (!db.objectStoreNames.contains(IDB_PREFS_STORE)) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction(IDB_PREFS_STORE, 'readonly');
        const solicitud = tx.objectStore(IDB_PREFS_STORE).get(IDB_PREFS_CLAVE);
        solicitud.onsuccess = () => {
          db.close();
          resolve(solicitud.result ?? null);
        };
        solicitud.onerror = () => {
          db.close();
          resolve(null);
        };
      };
      apertura.onerror = () => resolve(null);
      // Sin datos guardados (nunca abrieron la configuracion): se avisa normal.
      setTimeout(() => resolve(null), 800);
    } catch {
      resolve(null);
    }
  });
}

/** Mismo criterio que enSilencio() de la app: admite la franja que cruza medianoche. */
function dentroDeFranja(desde, hasta, ahora) {
  if (typeof desde !== 'string' || typeof hasta !== 'string') return false;
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const a = Number(desde.slice(0, 2)) * 60 + Number(desde.slice(3, 5));
  const b = Number(hasta.slice(0, 2)) * 60 + Number(hasta.slice(3, 5));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a <= b ? minutos >= a && minutos < b : minutos >= a || minutos < b;
}

self.addEventListener('push', (event) => {
  // El payload lo manda el backend (envio.ts) como JSON. leerPayloadPush nunca
  // lanza: un push sin datos o malformado se traduce a un aviso generico.
  const datos = leerPayloadPush(event);

  const titulo = datos.titulo || 'Consulta Legal';
  const opciones = {
    body: datos.mensaje || '',
    tag: datos.articuloId ? `legal-${datos.articuloId}` : 'legal-general',
    // reemplaza avisos previos del mismo tag en vez de apilarlos.
    renotify: true,
    data: { url: datos.url ?? null, articuloId: datos.articuloId ?? null },
  };

  event.waitUntil(
    (async () => {
      const preferencias = await leerPreferenciasDelDispositivo();
      // "Recibir avisos" apagado: el aviso no se muestra (la suscripcion existe igual,
      // es el interruptor de la persona el que manda).
      if (preferencias && preferencias.notificaciones === false) return;
      if (preferencias && dentroDeFranja(preferencias.silencioDesde, preferencias.silencioHasta, new Date())) {
        // Franja de silencio: llega, pero sin sonido ni vibracion.
        opciones.silent = true;
      }
      await self.registration.showNotification(titulo, opciones);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = urlDeNotificacion(event.notification.data || {});

  event.waitUntil(
    (async () => {
      // Reutiliza una pestana ya abierta de la app si existe (foco + navegacion).
      const ventanas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const cliente of ventanas) {
        if ('focus' in cliente) {
          try {
            await cliente.navigate(destino);
          } catch {
            /* algunas plataformas no permiten navigate: al menos hacemos foco */
          }
          return cliente.focus();
        }
      }
      // Ninguna abierta: se abre una pestana nueva en la app.
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })(),
  );
});
