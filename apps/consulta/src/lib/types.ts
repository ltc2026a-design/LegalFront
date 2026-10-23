// Zona 4 — Tipos de las respuestas de la API publica de consulta (Zona 3).
// Reflejan exactamente los JSON (camelCase) que devuelve backend/src/services/consulta.service.ts.

/** Estado de un codigo dentro de la biblioteca. */
export type Jurisdiccion = 'federal' | 'estatal_quintana_roo' | 'municipal' | string;

export interface FuenteOficialResumen {
  nombre: string;
  urlOrigen: string;
  jurisdiccion: string;
}

/** Item de GET /api/codigos */
export interface CodigoListaItem {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  jurisdiccion: Jurisdiccion;
  descripcion: string;
  versionVigente: string;
  fechaUltimaReforma: string | null;
  totalArticulos: number;
  fuenteOficial: FuenteOficialResumen | null;
}

export interface ListaCodigosResponse {
  codigos: CodigoListaItem[];
}

/** Nodo del arbol jerarquico de GET /api/codigos/:slug */
export interface ArticuloExtract {
  id: string;
  numero: string;
  orden: number;
  extracto: string;
}

export interface SeccionNodo {
  id: string | null;
  tipo: string | null;
  numero: string | null;
  nombre: string;
  orden: number;
  /** Articulos del nodo + todos los descendientes. */
  totalArticulos: number;
  /** Solo articulos directamente unidos a esta seccion. */
  articulos: ArticuloExtract[];
  hijos: SeccionNodo[];
}

export interface CodigoDetalle {
  codigo: {
    id: string;
    slug: string;
    nombre: string;
    tipo: string;
    jurisdiccion: Jurisdiccion;
    descripcion: string;
    versionVigente: string;
    fechaUltimaReforma: string | null;
  };
  arbol: SeccionNodo[];
}

export interface BreadcrumbItem {
  tipo: string;
  numero: string | null;
  nombre: string;
}

/** GET /api/codigos/:slug/articulos/:numero */
export interface ArticuloDetalle {
  codigo: { slug: string; nombre: string };
  fuenteOficial: { nombre: string; urlOrigen: string } | null;
  articulo: {
    id: string;
    numero: string;
    texto: string;
    esApartadoClave: boolean;
    vigente: boolean;
    fechaUltimaReforma: string | null;
    breadcrumb: BreadcrumbItem[];
  };
}

/** GET /api/buscar — `destacado` puede traer <mark>…</mark> generados por el servidor. */
export interface ResultadoBusqueda {
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  vigente: boolean;
  destacado: string;
}

export interface BusquedaResponse {
  query: string;
  total: number;
  resultados: ResultadoBusqueda[];
}

/** GET /api/salto — candidatos cuando la consulta es un numero de articulo. */
export interface CandidatoSalto {
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  vigente: boolean;
  extracto: string;
}

export interface SaltoResponse {
  reconocida: boolean;
  clave: string;
  candidatos: CandidatoSalto[];
}

/** GET /api/apartados-clave */
export interface ApartadoClaveItem {
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  extracto: string;
}

export interface ApartadosClaveResponse {
  apartados: ApartadoClaveItem[];
}

// ---------- Zona 12: asistente de consultas con IA ----------

/** GET /api/asistente/estado — si hay llave del proveedor (nunca se expone). */
export interface EstadoAsistente {
  listo: boolean;
  proveedor: string | null;
  modelo: string | null;
}

/** Fuente citada por el asistente: enlaza directo al artículo del acervo. */
export interface FuenteAsistente {
  n: number;
  articuloId: string;
  codigoSlug: string;
  codigoNombre: string;
  numero: string;
  vigente: boolean;
  texto: string;
}

export interface TurnoAsistente {
  rol: 'usuario' | 'asistente';
  texto: string;
}

/** Resultado acumulado de una respuesta en streaming. */
export interface RespuestaAsistente {
  texto: string;
  fuentes: FuenteAsistente[];
  sinFuentes: boolean;
  /** Preguntas de seguimiento que el servidor ya puede responder. */
  sugerencias: string[];
}

/** GET /api/asistente/guiado — respuesta del chat cuando no hay IA. */
export interface RespuestaGuiada {
  fuentes: FuenteAsistente[];
  sugerencias: string[];
}

// ---------- Zona 5: favoritos por device_id ----------

/** Item de GET /api/favoritos (resumen del articulo guardado). */
export interface FavoritoItem {
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

export interface FavoritosResponse {
  favoritos: FavoritoItem[];
}

/** POST /api/favoritos -> confirmacion del favorito guardado (o del existente). */
export interface FavoritoCorto {
  id: string;
  articuloId: string;
  creadoEn: string;
}

export interface FavoritoResponse {
  favorito: FavoritoCorto;
}

/** POST /api/app/registro -> etiqueta OPCIONAL del dispositivo (sin contrasena). */
export interface UsuarioAppResumen {
  id: string;
  deviceId: string;
  nombre: string | null;
  email: string | null;
}

export interface RegistroResponse {
  usuarioApp: UsuarioAppResumen;
}

// ---------- Fase 2/3: cuenta de persona (la crea el dueno por CLI) ----------

/** El usuario con el que trabaja la app despues de iniciar sesion. */
export interface UsuarioCuenta {
  id: string;
  nombre: string;
  email: string;
  /** device_id de la cuenta: es la clave de SUS favoritos. */
  deviceId: string;
}

/** POST /api/app/login */
export interface LoginResponse {
  token: string;
  usuario: UsuarioCuenta;
}

/** Preferencias de lectura/avisos de la cuenta (PreferenciasApp en el backend). */
export interface PreferenciasApp {
  tema: 'claro' | 'oscuro' | 'auto';
  tamanoLetra: number;
  codigoFavorito: string | null;
  notificaciones: boolean;
  silencioDesde: string | null;
  silencioHasta: string | null;
  guardarHistorial: boolean;
}

/** GET /api/app/yo (Bearer) */
export interface YoResponse {
  usuario: { id: string; nombre: string; email: string; creadoEn: string };
  favoritos: number;
  preferencias: PreferenciasApp | null;
}

/** PATCH /api/app/preferencias (Bearer) */
export interface PreferenciasResponse {
  preferencias: PreferenciasApp;
}
