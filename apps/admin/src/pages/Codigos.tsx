// Zona 8 — "Códigos y leyes": listado editable (alta/edición inline/borrado con
// confirmación). Cada cambio se publica de inmediato: el admin autorregistra el
// contenido. Clic en la fila -> editor de estructura del código.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useBorrarCodigo,
  useCodigos,
  useCrearCodigo,
  useEditarCodigo,
  useFuentes,
} from '../lib/queries';
import { ApiError } from '../lib/api';
import {
  CLASE_CAMPO,
  JURISDICCIONES,
  TIPOS_CODIGO,
  fechaCorta,
  jurisdiccionLabel,
  tipoCodigoLabel,
} from '../lib/formato';
import Button from '../components/Button';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';

interface FormCodigo {
  nombre: string;
  tipo: string;
  jurisdiccion: string;
  descripcion: string;
  versionVigente: string;
  fechaUltimaReforma: string;
  fuenteOficialId: string;
}

const FORM_VACIO: FormCodigo = {
  nombre: '',
  tipo: 'otro',
  jurisdiccion: 'federal',
  descripcion: '',
  versionVigente: 'Texto vigente',
  fechaUltimaReforma: '',
  fuenteOficialId: '',
};

function mensaje(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'nombre_requerido') return 'El nombre es obligatorio.';
    if (err.status === 404) return 'El documento ya no existe (¿se borró?).';
    return `No se pudo guardar (${err.code ?? err.status}).`;
  }
  return 'Error inesperado.';
}

function SelectorFuente({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}) {
  const { data } = useFuentes();
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={CLASE_CAMPO}>
      <option value="">— sin fuente oficial —</option>
      {(data?.fuentes ?? []).map((f) => (
        <option key={f.id} value={f.id}>
          {f.nombre}
        </option>
      ))}
    </select>
  );
}

export default function Codigos() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCodigos();
  const crear = useCrearCodigo();
  const editar = useEditarCodigo();
  const borrar = useBorrarCodigo();

  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [nuevo, setNuevo] = useState<FormCodigo>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<FormCodigo>(FORM_VACIO);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function alta(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const creado = await crear.mutateAsync({
        nombre: nuevo.nombre,
        tipo: nuevo.tipo,
        jurisdiccion: nuevo.jurisdiccion,
        descripcion: nuevo.descripcion || 'Sin descripción.',
        versionVigente: nuevo.versionVigente,
        fechaUltimaReforma: nuevo.fechaUltimaReforma || null,
        fuenteOficialId: nuevo.fuenteOficialId || null,
      });
      setNuevo(FORM_VACIO);
      setMostrarAlta(false);
      const slug = (creado as { slug?: string }).slug;
      if (slug) navigate(`/codigos/${slug}/estructura`);
    } catch (err) {
      setError(mensaje(err));
    }
  }

  function empezarEdacion(id: string, f: FormCodigo) {
    setEditandoId(id);
    setEditando(f);
    setError(null);
  }

  async function guardarEdicion(id: string) {
    setError(null);
    try {
      await editar.mutateAsync({
        id,
        body: {
          nombre: editando.nombre,
          tipo: editando.tipo,
          jurisdiccion: editando.jurisdiccion,
          versionVigente: editando.versionVigente,
          fechaUltimaReforma: editando.fechaUltimaReforma || null,
          fuenteOficialId: editando.fuenteOficialId || null,
        },
      });
      setEditandoId(null);
    } catch (err) {
      setError(mensaje(err));
    }
  }

  async function eliminar(id: string) {
    setError(null);
    try {
      await borrar.mutateAsync(id);
      setConfirmandoId(null);
    } catch (err) {
      setError(mensaje(err));
    }
  }

  const camposEdicion = (valor: FormCodigo, set: (f: FormCodigo) => void) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-semibold text-texto/60">Nombre</span>
        <input
          className={CLASE_CAMPO}
          value={valor.nombre}
          onChange={(e) => set({ ...valor, nombre: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto/60">Tipo</span>
        <select
          className={CLASE_CAMPO}
          value={valor.tipo}
          onChange={(e) => set({ ...valor, tipo: e.target.value })}
        >
          {TIPOS_CODIGO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto/60">Jurisdicción</span>
        <select
          className={CLASE_CAMPO}
          value={valor.jurisdiccion}
          onChange={(e) => set({ ...valor, jurisdiccion: e.target.value })}
        >
          {JURISDICCIONES.map((j) => (
            <option key={j.valor} value={j.valor}>
              {j.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto/60">Versión vigente</span>
        <input
          className={CLASE_CAMPO}
          value={valor.versionVigente}
          onChange={(e) => set({ ...valor, versionVigente: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto/60">Fuente oficial</span>
        <SelectorFuente
          valor={valor.fuenteOficialId}
          onChange={(v) => set({ ...valor, fuenteOficialId: v })}
        />
      </label>
    </div>
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-primary-dark">Códigos y leyes</h1>
          <p className="mt-1 text-sm text-texto/60">
            Alta y edición manual: se publica de inmediato y queda auditada como edición del
            administrador.
          </p>
        </div>
        <Button onClick={() => setMostrarAlta((v) => !v)}>
          {mostrarAlta ? 'Cerrar' : '+ Agregar código'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-derogado/10 px-4 py-2 text-sm text-derogado">
          {error}
        </p>
      )}

      {mostrarAlta && (
        <Card sinAnimacion className="mb-5 p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold text-primary-dark">
            Nuevo código / ley
          </h2>
          <form onSubmit={alta} className="flex flex-col gap-3">
            {camposEdicion(nuevo, setNuevo)}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-texto/60">Descripción</span>
              <textarea
                className={CLASE_CAMPO}
                rows={2}
                value={nuevo.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-texto/60">
                Fecha de última reforma (opcional)
              </span>
              <input
                type="date"
                className={CLASE_CAMPO}
                value={nuevo.fechaUltimaReforma}
                onChange={(e) => setNuevo({ ...nuevo, fechaUltimaReforma: e.target.value })}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={!nuevo.nombre.trim() || crear.isPending}>
                {crear.isPending ? 'Guardando…' : 'Crear y editar estructura'}
              </Button>
              <Button variante="ghost" onClick={() => setMostrarAlta(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {isError && (
        <p className="rounded-lg bg-derogado/10 px-4 py-3 text-sm text-derogado">
          No se pudieron cargar los códigos. Verifica tu sesión.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {data?.codigos.map((c) => {
          const enEdicion = editandoId === c.id;
          const enConfirmacion = confirmandoId === c.id;
          return (
            <Card key={c.id} sinAnimacion className="p-4">
              {enEdicion ? (
                <div className="flex flex-col gap-3">
                  {camposEdicion(editando, setEditando)}
                  <div className="flex gap-2">
                    <Button
                      disabled={editar.isPending || !editando.nombre.trim()}
                      onClick={() => guardarEdicion(c.id)}
                    >
                      {editar.isPending ? 'Guardando…' : 'Guardar'}
                    </Button>
                    <Button variante="ghost" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    to={`/codigos/${c.slug}/estructura`}
                    className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <p className="font-serif text-lg font-semibold text-texto">{c.nombre}</p>
                    <p className="mt-0.5 text-xs text-texto/55">
                      {tipoCodigoLabel(c.tipo)} · {jurisdiccionLabel(c.jurisdiccion)} ·{' '}
                      {c.totalArticulos} artículos · {c.totalSecciones} secciones ·{' '}
                      {c.fuenteNombre ?? 'sin fuente'} · Última reforma:{' '}
                      {fechaCorta(c.fechaUltimaReforma)}
                    </p>
                    <p className="text-xs text-texto/45">{c.versionVigente}</p>
                  </Link>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variante="secondary"
                      onClick={() =>
                        empezarEdacion(c.id, {
                          nombre: c.nombre,
                          tipo: c.tipo,
                          jurisdiccion: c.jurisdiccion,
                          descripcion: '',
                          versionVigente: c.versionVigente,
                          fechaUltimaReforma: '',
                          fuenteOficialId: c.fuenteOficialId ?? '',
                        })
                      }
                    >
                      Editar
                    </Button>
                    {enConfirmacion ? (
                      <>
                        <Button
                          className="bg-derogado hover:bg-derogado"
                          disabled={borrar.isPending}
                          onClick={() => eliminar(c.id)}
                        >
                          Confirmar borrado ({c.totalArticulos} art.)
                        </Button>
                        <Button variante="ghost" onClick={() => setConfirmandoId(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button variante="ghost" onClick={() => setConfirmandoId(c.id)}>
                        Borrar
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
