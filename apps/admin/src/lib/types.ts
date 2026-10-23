// Zona 7 — tipos del panel de administracion (reflejan las respuestas del backend
// routes/admin-auth.ts y routes/admin-cambios.ts).
export type RolAdmin = 'administrador' | 'editor_legal';
export type TipoCambio = 'nuevo' | 'modificado' | 'derogado';
export type EstadoCambio = 'pendiente_revision' | 'aprobado' | 'rechazado';
export type OrigenCambio = 'sincronizacion_automatica' | 'edicion_manual';

export interface AdminSesion {
  id: string;
  nombre: string;
  email: string;
  rol: RolAdmin;
}

/** Identidad que devuelve /auth/me (sin email: viene del token). */
export interface AdminContexto {
  id: string;
  nombre: string;
  rol: RolAdmin;
}

export interface LoginResponse {
  token: string;
  admin: AdminSesion;
}

export interface MeResponse {
  admin: AdminContexto;
}

export interface CambioPendiente {
  id: string;
  tipoCambio: TipoCambio;
  numero: string | null;
  codigoSlug: string | null;
  codigoNombre: string | null;
  estado: EstadoCambio;
  origen: OrigenCambio;
  fechaDeteccion: string;
  textoAnterior: string | null;
  textoNuevo: string;
  articuloId?: string;
  tieneApartadoClave: boolean;
}

export interface CambiosPendientesResponse {
  total: number;
  cambios: CambioPendiente[];
}

export interface DetalleArticulo {
  id: string;
  numero: string;
  texto: string;
  vigente: boolean;
  esApartadoClave: boolean;
}

export interface DetalleCambio {
  id: string;
  tipoCambio: TipoCambio;
  estado: EstadoCambio;
  origen: OrigenCambio;
  numero: string | null;
  fechaDeteccion: string;
  fechaAprobacion: string | null;
  textoAnterior: string | null;
  textoNuevo: string;
  articuloId: string | null;
  codigo: { id: string; slug: string; nombre: string } | null;
  articulo: DetalleArticulo | null;
  seccionRuta: string[];
}

export interface ResumenDashboard {
  pendientes: number;
  fuentes: { activas: number; en_pausa: number; con_error: number };
  codigos: number;
}

export interface NotificacionResultado {
  notificacionId: string;
  destinatarios: number;
}

export interface ResolucionResponse {
  ok: boolean;
  cambio: { id: string; estado: EstadoCambio; tipoCambio?: TipoCambio; articuloId?: string | null };
  notificacion?: NotificacionResultado | null;
}

// ---------- Zona 8 — gestion manual de contenido ----------

export type TipoCodigo =
  | 'constitucion'
  | 'codigo_penal'
  | 'codigo_civil'
  | 'codigo_fiscal'
  | 'codigo_procedimientos'
  | 'ley_organica'
  | 'otro';
export type Jurisdiccion = 'federal' | 'estatal_quintana_roo' | 'municipal';
export type TipoSeccion = 'libro' | 'titulo' | 'capitulo' | 'seccion';
export type MetodoIngesta = 'scraper' | 'api' | 'manual';
export type EstadoFuente = 'activa' | 'en_pausa' | 'con_error';

export interface CodigoAdminItem {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  jurisdiccion: string;
  versionVigente: string;
  fechaUltimaReforma: string | null;
  totalArticulos: number;
  totalSecciones: number;
  fuenteOficialId: string | null;
  fuenteNombre: string | null;
}

export interface CodigoCompleto {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  jurisdiccion: string;
  descripcion: string;
  versionVigente: string;
  fechaUltimaReforma: string | null;
  fuenteOficialId: string | null;
  fuenteNombre: string | null;
}

export interface ArticuloEditor {
  id: string;
  numero: string;
  texto: string;
  esApartadoClave: boolean;
  vigente: boolean;
  orden: number;
}

export interface SeccionEditor {
  id: string;
  tipo: string;
  numero: string;
  nombre: string;
  orden: number;
  articulos: ArticuloEditor[];
  hijos: SeccionEditor[];
}

export interface EstructuraResponse {
  codigo: CodigoCompleto;
  secciones: SeccionEditor[];
  sinSeccion: ArticuloEditor[];
}

export interface LoteItemInput {
  numero: string;
  texto: string;
  rutaSecciones?: string[];
  esApartadoClave?: boolean;
  vigente?: boolean;
}

export interface LoteResultado {
  creados: number;
  omitidos: number;
  errores: { indice: number; numero: string | null; error: string }[];
}

export interface FuenteItem {
  id: string;
  nombre: string;
  jurisdiccion: string;
  urlOrigen: string;
  metodoIngesta: string;
  conectorKey: string | null;
  frecuenciaSincronizacion: string;
  ultimaSincronizacionEn: string | null;
  estado: string;
  totalCodigos: number;
}

export interface FuentesResponse {
  fuentes: FuenteItem[];
}

export interface SincronizarResponse {
  ok: boolean;
  sincronizacion: {
    fuenteOficialId: string;
    tareaId: string;
    estado: 'exitosa' | 'con_cambios_pendientes' | 'fallida';
    cambiosDetectados: number;
    error: string | null;
  };
  tarea: { estado: string; cambiosDetectados: number; log: string } | null;
  fuente: { estado: string; ultimaSincronizacionEn: string | null } | null;
}

export interface CodigosResponse {
  codigos: CodigoAdminItem[];
}

// ---------- Zona 9 — notificaciones push ----------

/** Resultado de difundir un aviso general (POST /admin/notificaciones/general). */
export interface DifundirResponse {
  notificacionId: string;
  total: number;
  enviados: number;
  fallidos: number;
  /** Suscripciones web muertas (404/410) eliminadas de la BD. */
  eliminados: number;
  /** Destinos nativos (android/ios/desktop): pendientes, transporte en Zona 10. */
  pendientes: number;
}

/** Item de GET /admin/notificaciones (listado reciente). */
export interface NotificacionAdminItem {
  id: string;
  titulo: string;
  mensaje: string;
  enviadaEn: string | null;
  enviadaATodos: boolean;
  articuloId: string | null;
  contextoArticulo: string | null;
}

export interface NotificacionesResponse {
  total: number;
  notificaciones: NotificacionAdminItem[];
}
