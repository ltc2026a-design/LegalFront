// Zona 8 — "Fuentes oficiales": tabla con estado (activa verde / en_pausa ambar
// / con_error rojo), alta/edicion, Pausar/Reactivar y FORZAR SINCRONIZACION
// (delega en el orquestador Zona 6: deja pendientes, nunca publica; un fallo de
// red termina en con_error sin tumbar el sistema).
import { useState, type FormEvent } from 'react';
import { useFuentes, usePausaFuente, useCrearFuente, useEditarFuente, useSyncFuente } from '../lib/queries';
import type { FuenteItem, SincronizarResponse } from '../lib/types';
import {
  CLASE_CAMPO,
  CONECTOR_KEYS,
  JURISDICCIONES,
  METODOS_INGESTA,
  fechaCorta,
  jurisdiccionLabel,
  metodoLabel,
} from '../lib/formato';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';

interface FormFuente {
  nombre: string;
  jurisdiccion: string;
  urlOrigen: string;
  metodoIngesta: string;
  conectorKey: string;
  frecuenciaSincronizacion: string;
}

const FORM_VACIO: FormFuente = {
  nombre: '',
  jurisdiccion: 'federal',
  urlOrigen: '',
  metodoIngesta: 'scraper',
  conectorKey: '',
  frecuenciaSincronizacion: 'diaria',
};

function BadgeEstado({ estado }: { estado: string }) {
  if (estado === 'activa') return <Badge estado="Vigente">Activa</Badge>;
  if (estado === 'en_pausa') return <Badge estado="En revisión">En pausa</Badge>;
  return <Badge estado="Derogado">Con error</Badge>;
}

function CamposFuente({
  valor,
  set,
}: {
  valor: FormFuente;
  set: (f: FormFuente) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-semibold text-texto/60">Nombre</span>
        <input className={CLASE_CAMPO} value={valor.nombre} onChange={(e) => set({ ...valor, nombre: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-semibold text-texto/60">URL de origen</span>
        <input className={CLASE_CAMPO} value={valor.urlOrigen} onChange={(e) => set({ ...valor, urlOrigen: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto/60">Jurisdicción</span>
        <select className={CLASE_CAMPO} value={valor.jurisdiccion} onChange={(e) => set({ ...valor, jurisdiccion: e.target.value })}>
          {JURISDICCIONES.map((j) => (
            <option key={j.valor} value={j.valor}>
              {j.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto/60">Método de ingesta</span>
        <select className={CLASE_CAMPO} value={valor.metodoIngesta} onChange={(e) => set({ ...valor, metodoIngesta: e.target.value })}>
          {METODOS_INGESTA.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto/60">Conector</span>
        <select className={CLASE_CAMPO} value={valor.conectorKey} onChange={(e) => set({ ...valor, conectorKey: e.target.value })}>
          {CONECTOR_KEYS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto/60">Frecuencia</span>
        <input className={CLASE_CAMPO} value={valor.frecuenciaSincronizacion} onChange={(e) => set({ ...valor, frecuenciaSincronizacion: e.target.value })} />
      </label>
    </div>
  );
}

export default function Fuentes() {
  const { data, isLoading, isError } = useFuentes();
  const crear = useCrearFuente();
  const editar = useEditarFuente();
  const pausa = usePausaFuente();
  const sincronizar = useSyncFuente();

  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [nuevo, setNuevo] = useState<FormFuente>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<FormFuente>(FORM_VACIO);
  const [resultados, setResultados] = useState<Record<string, SincronizarResponse>>({});
  const [error, setError] = useState<string | null>(null);

  async function alta(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await crear.mutateAsync({
        ...nuevo,
        conectorKey: nuevo.conectorKey || null,
      });
      setNuevo(FORM_VACIO);
      setMostrarAlta(false);
    } catch {
      setError('No se pudo crear la fuente (revisa los campos obligatorios).');
    }
  }

  async function guardarEdicion(id: string) {
    setError(null);
    try {
      await editar.mutateAsync({ id, body: { ...editando, conectorKey: editando.conectorKey || null } });
      setEditandoId(null);
    } catch {
      setError('No se pudo guardar la fuente.');
    }
  }

  function fuenteAFormulario(f: FuenteItem): FormFuente {
    return {
      nombre: f.nombre,
      jurisdiccion: f.jurisdiccion,
      urlOrigen: f.urlOrigen,
      metodoIngesta: f.metodoIngesta,
      conectorKey: f.conectorKey ?? '',
      frecuenciaSincronizacion: f.frecuenciaSincronizacion,
    };
  }

  async function forzarSync(f: FuenteItem) {
    setError(null);
    try {
      const res = await sincronizar.mutateAsync(f.id);
      setResultados((prev) => ({ ...prev, [f.id]: res }));
    } catch {
      setError(`La sincronización de “${f.nombre}” no pudo ejecutarse.`);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-primary-dark">Fuentes oficiales</h1>
          <p className="mt-1 text-sm text-texto/60">
            Orígenes de sincronización. “Forzar sincronización” detecta cambios y los deja
            pendientes de revisión; nunca publica sin aprobación.
          </p>
        </div>
        <Button onClick={() => setMostrarAlta((v) => !v)}>{mostrarAlta ? 'Cerrar' : '+ Nueva fuente'}</Button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-derogado/10 px-4 py-2 text-sm text-derogado">
          {error}
        </p>
      )}

      {mostrarAlta && (
        <Card sinAnimacion className="mb-5 p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold text-primary-dark">Nueva fuente</h2>
          <form onSubmit={alta} className="flex flex-col gap-3">
            <CamposFuente valor={nuevo} set={setNuevo} />
            <div>
              <Button type="submit" disabled={!nuevo.nombre.trim() || !nuevo.urlOrigen.trim() || crear.isPending}>
                {crear.isPending ? 'Guardando…' : 'Crear fuente'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}
      {isError && (
        <p className="rounded-lg bg-derogado/10 px-4 py-3 text-sm text-derogado">
          No se pudieron cargar las fuentes. Verifica tu sesión.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {data?.fuentes.map((f) => {
          const res = resultados[f.id];
          const enEdicion = editandoId === f.id;
          return (
            <Card key={f.id} sinAnimacion className="p-4">
              {enEdicion ? (
                <div className="flex flex-col gap-3">
                  <CamposFuente valor={editando} set={setEditando} />
                  <div className="flex gap-2">
                    <Button disabled={editar.isPending} onClick={() => guardarEdicion(f.id)}>
                      {editar.isPending ? 'Guardando…' : 'Guardar'}
                    </Button>
                    <Button variante="ghost" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-serif text-lg font-semibold text-texto">{f.nombre}</p>
                        <BadgeEstado estado={f.estado} />
                      </div>
                      <p className="mt-0.5 break-all text-xs text-texto/55">
                        {jurisdiccionLabel(f.jurisdiccion)} · {metodoLabel(f.metodoIngesta)} ·{' '}
                        {f.conectorKey ? `conector: ${f.conectorKey}` : 'sin conector'} ·{' '}
                        {f.frecuenciaSincronizacion} · {f.totalCodigos} código(s) · Última sinc.:{' '}
                        {fechaCorta(f.ultimaSincronizacionEn)}
                      </p>
                      <p className="truncate text-xs text-texto/45">{f.urlOrigen}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variante="secondary"
                        disabled={!f.conectorKey || sincronizar.isPending}
                        title={f.conectorKey ? 'Ejecutar sincronización ahora' : 'Esta fuente no tiene conector'}
                        onClick={() => forzarSync(f)}
                      >
                        {sincronizar.isPending ? 'Sincronizando…' : 'Forzar sincronización'}
                      </Button>
                      <Button
                        variante="secondary"
                        disabled={pausa.isPending}
                        onClick={() => pausa.mutateAsync({ id: f.id, activa: f.estado !== 'activa' })}
                      >
                        {f.estado === 'activa' ? 'Pausar' : 'Reactivar'}
                      </Button>
                      <Button
                        variante="ghost"
                        onClick={() => {
                          setEditandoId(f.id);
                          setEditando(fuenteAFormulario(f));
                        }}
                      >
                        Editar
                      </Button>
                    </div>
                  </div>

                  {res && (
                    <div
                      className={
                        'mt-3 rounded-lg px-3 py-2 text-sm ' +
                        (res.ok ? 'bg-vigente/10 text-vigente' : 'bg-revision/10 text-revision')
                      }
                    >
                      <p className="font-semibold">
                        {res.sincronizacion.estado === 'con_cambios_pendientes'
                          ? `${res.sincronizacion.cambiosDetectados} cambio(s) detectados → pendientes de revisión`
                          : res.sincronizacion.estado === 'exitosa'
                            ? 'Sincronización exitosa: sin cambios'
                            : `Sincronización fallida${res.sincronizacion.error ? `: ${res.sincronizacion.error}` : ''}`}
                      </p>
                      {res.tarea?.log && <p className="mt-1 line-clamp-3 text-xs opacity-80">{res.tarea.log}</p>}
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
