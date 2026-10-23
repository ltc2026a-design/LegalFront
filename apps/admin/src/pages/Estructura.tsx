// Zona 8 — EDITOR DE ESTRUCTURA: árbol de secciones + artículos (crear/editar/
// reordenar/borrar), switch de "apartado clave" y el panel de CARGA EN LOTE
// (pegar JSON o cargar archivo). Todo lo manual se publica al instante.
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useBatch,
  useBorrarArticulo,
  useBorrarSeccion,
  useCrearArticulo,
  useCrearSeccion,
  useEditarArticulo,
  useEditarSeccion,
  useEstructura,
  useOrdenSecciones,
} from '../lib/queries';
import { ApiError } from '../lib/api';
import { CLASE_CAMPO, TIPOS_SECCION, etiquetaSeccion } from '../lib/formato';
import type { ArticuloEditor, SeccionEditor } from '../lib/types';
import Button from '../components/Button';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';

// ---------- Helpers UI ----------

const btnMini =
  'cursor-pointer rounded-md px-2 py-1 font-sans text-xs font-semibold transition ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';

function Mini({
  onClick,
  children,
  tono = 'primario',
  disabled,
}: {
  onClick: () => void;
  children: string;
  tono?: 'primario' | 'peligro' | 'clave';
  disabled?: boolean;
}) {
  const clases =
    tono === 'peligro'
      ? 'text-derogado hover:bg-derogado/10'
      : tono === 'clave'
        ? 'text-primary-dark bg-acento/25 hover:bg-acento/40 ring-1 ring-inset ring-acento/50'
        : 'text-primary hover:bg-primary/10';
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${btnMini} ${clases}`}>
      {children}
    </button>
  );
}

function FormSeccion({
  codigoId,
  padreId,
  onCerrar,
}: {
  codigoId: string;
  padreId: string | null;
  onCerrar: () => void;
}) {
  const crear = useCrearSeccion();
  const [tipo, setTipo] = useState('titulo');
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await crear.mutateAsync({ codigoId, body: { tipo, numero, nombre, seccionPadreId: padreId } });
      onCerrar();
    } catch (err) {
      setError(err instanceof ApiError ? 'No se pudo crear la sección.' : 'Error inesperado.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="my-2 flex flex-wrap items-end gap-2 rounded-lg bg-surface p-3">
      <select className={`${CLASE_CAMPO} w-32`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
        {TIPOS_SECCION.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.etiqueta}
          </option>
        ))}
      </select>
      <input
        className={`${CLASE_CAMPO} w-24`}
        placeholder="Número"
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
      />
      <input
        className={`${CLASE_CAMPO} min-w-40 flex-1`}
        placeholder="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <Button type="submit" disabled={!numero.trim() || !nombre.trim() || crear.isPending}>
        Crear
      </Button>
      <Button variante="ghost" onClick={onCerrar}>
        Cancelar
      </Button>
      {error && <p className="w-full text-xs text-derogado">{error}</p>}
    </form>
  );
}

function FormArticulo({
  codigoId,
  seccionId,
  onCerrar,
}: {
  codigoId: string;
  seccionId: string | null;
  onCerrar: () => void;
}) {
  const crear = useCrearArticulo();
  const [numero, setNumero] = useState('');
  const [texto, setTexto] = useState('');
  const [clave, setClave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await crear.mutateAsync({
        codigoId,
        body: { numero, texto, seccionId, esApartadoClave: clave },
      });
      setTexto('');
      setNumero('');
      onCerrar();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'numero_duplicado'
          ? 'Ya existe un artículo con ese número en este código.'
          : 'No se pudo crear el artículo.',
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="my-2 flex flex-col gap-2 rounded-lg bg-surface p-3">
      <div className="flex items-end gap-2">
        <input
          className={`${CLASE_CAMPO} w-28`}
          placeholder="Art. (p. ej. 14 BIS)"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />
        <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-texto/70">
          <input type="checkbox" checked={clave} onChange={(e) => setClave(e.target.checked)} />
          Apartado clave
        </label>
      </div>
      <textarea
        className={CLASE_CAMPO}
        rows={3}
        placeholder="Texto del artículo (se publica de inmediato)"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={!numero.trim() || !texto.trim() || crear.isPending}>
          {crear.isPending ? 'Publicando…' : 'Publicar artículo'}
        </Button>
        <Button variante="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-xs text-derogado">{error}</p>}
    </form>
  );
}

// ---------- Fila de artículo ----------

function FilaArticulo({ art }: { art: ArticuloEditor }) {
  const editar = useEditarArticulo();
  const borrar = useBorrarArticulo();
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [numero, setNumero] = useState(art.numero);
  const [texto, setTexto] = useState(art.texto);
  const [error, setError] = useState<string | null>(null);

  async function toggleClave() {
    await editar.mutateAsync({ id: art.id, body: { esApartadoClave: !art.esApartadoClave } });
  }
  async function toggleVigente() {
    await editar.mutateAsync({ id: art.id, body: { vigente: !art.vigente } });
  }
  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await editar.mutateAsync({ id: art.id, body: { numero, texto } });
      setEditando(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'numero_duplicado'
          ? 'Número duplicado en este código.'
          : 'No se pudo guardar.',
      );
    }
  }

  return (
    <li className="rounded-lg px-2 py-1.5 hover:bg-primary/5">
      {editando ? (
        <form onSubmit={guardar} className="flex flex-col gap-2 bg-surface p-3">
          <input className={`${CLASE_CAMPO} w-36`} value={numero} onChange={(e) => setNumero(e.target.value)} />
          <textarea
            className={`${CLASE_CAMPO} font-serif`}
            rows={4}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={!numero.trim() || !texto.trim() || editar.isPending}>
              {editar.isPending ? 'Guardando…' : 'Guardar (publica y registra edición manual)'}
            </Button>
            <Button variante="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
          {error && <p className="text-xs text-derogado">{error}</p>}
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-sans text-sm font-semibold text-primary-dark">Art. {art.numero}</span>
            {art.esApartadoClave && (
              <span className="rounded-full bg-acento/20 px-2 py-0.5 text-xs font-semibold text-primary-dark">
                ★ Apartado clave
              </span>
            )}
            {!art.vigente && (
              <span className="rounded-full bg-derogado/10 px-2 py-0.5 text-xs font-semibold text-derogado">
                No vigente
              </span>
            )}
            <span className="ml-auto flex gap-1">
              <Mini onClick={toggleClave} tono="clave" disabled={editar.isPending}>
                {art.esApartadoClave ? 'Quitar clave' : 'Marcar clave'}
              </Mini>
              <Mini onClick={toggleVigente} disabled={editar.isPending}>
                {art.vigente ? 'Marcar no vigente' : 'Reactivar'}
              </Mini>
              <Mini
                onClick={() => {
                  setNumero(art.numero);
                  setTexto(art.texto);
                  setEditando(true);
                }}
              >
                Editar
              </Mini>
              {confirmar ? (
                <>
                  <Mini
                    tono="peligro"
                    onClick={() => borrar.mutateAsync(art.id).then(() => setConfirmar(false))}
                  >
                    Confirmar
                  </Mini>
                  <Mini onClick={() => setConfirmar(false)}>No</Mini>
                </>
              ) : (
                <Mini tono="peligro" onClick={() => setConfirmar(true)}>
                  Borrar
                </Mini>
              )}
            </span>
          </div>
          <p className="line-clamp-2 font-serif text-[13px] text-texto/60">{art.texto}</p>
        </>
      )}
    </li>
  );
}

// ---------- Nodo del árbol ----------

interface NodoProps {
  nodo: SeccionEditor;
  codigoId: string;
  nivel: number;
  hermanos: SeccionEditor[];
}

function NodoEditor({ nodo, codigoId, nivel, hermanos }: NodoProps) {
  const [abierto, setAbierto] = useState(nivel < 2);
  const [formSeccion, setFormSeccion] = useState(false);
  const [formArticulo, setFormArticulo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [campo, setCampo] = useState({ tipo: nodo.tipo, numero: nodo.numero, nombre: nodo.nombre });
  const editar = useEditarSeccion();
  const borrar = useBorrarSeccion();
  const ordenar = useOrdenSecciones();

  const indice = hermanos.findIndex((h) => h.id === nodo.id);

  async function mover(direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= hermanos.length) return;
    const nuevoOrden = [...hermanos];
    const tmp = nuevoOrden[indice];
    nuevoOrden[indice] = nuevoOrden[destino];
    nuevoOrden[destino] = tmp;
    await ordenar.mutateAsync({
      codigoId,
      items: nuevoOrden.map((h, i) => ({ id: h.id, orden: i })),
    });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    await editar.mutateAsync({ id: nodo.id, body: campo });
    setEditando(false);
  }

  const total = nodo.articulos.length;

  return (
    <li className="list-none">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1 py-1 hover:bg-primary/5">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className={`${btnMini} text-primary`}
        >
          {abierto ? '▾' : '▸'}
        </button>
        {editando ? (
          <form onSubmit={guardar} className="flex flex-wrap items-center gap-2">
            <select
              className={`${CLASE_CAMPO} w-28`}
              value={campo.tipo}
              onChange={(e) => setCampo({ ...campo, tipo: e.target.value })}
            >
              {TIPOS_SECCION.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
            <input
              className={`${CLASE_CAMPO} w-20`}
              value={campo.numero}
              onChange={(e) => setCampo({ ...campo, numero: e.target.value })}
            />
            <input
              className={`${CLASE_CAMPO} min-w-40 flex-1`}
              value={campo.nombre}
              onChange={(e) => setCampo({ ...campo, nombre: e.target.value })}
            />
            <Button type="submit" disabled={editar.isPending}>
              Guardar
            </Button>
            <Button variante="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <>
            <span className="font-sans text-sm font-semibold text-texto">
              {etiquetaSeccion(nodo.tipo, nodo.numero, nodo.nombre)}
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-texto/60 ring-1 ring-inset ring-primary/15">
              {total} art.
            </span>
            <span className="ml-auto flex flex-wrap gap-1">
              <Mini onClick={() => mover(-1)} disabled={ordenar.isPending || indice <= 0}>
                ↑
              </Mini>
              <Mini onClick={() => mover(1)} disabled={ordenar.isPending || indice >= hermanos.length - 1}>
                ↓
              </Mini>
              <Mini onClick={() => setFormArticulo((v) => !v)}>+ Artículo</Mini>
              <Mini onClick={() => setFormSeccion((v) => !v)}>+ Sub-sección</Mini>
              <Mini
                onClick={() => {
                  setCampo({ tipo: nodo.tipo, numero: nodo.numero, nombre: nodo.nombre });
                  setEditando(true);
                  setAbierto(true);
                }}
              >
                Renombrar
              </Mini>
              {confirmar ? (
                <>
                  <Mini tono="peligro" onClick={() => borrar.mutateAsync(nodo.id).then(() => setConfirmar(false))}>
                    Confirmar borrado
                  </Mini>
                  <Mini onClick={() => setConfirmar(false)}>No</Mini>
                </>
              ) : (
                <Mini tono="peligro" onClick={() => setConfirmar(true)}>
                  Borrar
                </Mini>
              )}
            </span>
          </>
        )}
      </div>

      {formArticulo && (
        <FormArticulo codigoId={codigoId} seccionId={nodo.id} onCerrar={() => setFormArticulo(false)} />
      )}
      {formSeccion && (
        <FormSeccion codigoId={codigoId} padreId={nodo.id} onCerrar={() => setFormSeccion(false)} />
      )}

      {abierto && (
        <ul className="ml-4 space-y-0.5 border-l border-primary/15 pl-2">
          {nodo.articulos.map((a) => (
            <FilaArticulo key={a.id} art={a} />
          ))}
          {nodo.hijos.map((h) => (
            <NodoEditor key={h.id} nodo={h} codigoId={codigoId} nivel={nivel + 1} hermanos={nodo.hijos} />
          ))}
          {nodo.articulos.length === 0 && nodo.hijos.length === 0 && (
            <li className="px-2 py-1 text-xs italic text-texto/40">Vacío — usa “+ Artículo” o “+ Sub-sección”.</li>
          )}
        </ul>
      )}
    </li>
  );
}

// ---------- Panel de carga en lote ----------

function PanelLote({ codigoId }: { codigoId: string }) {
  const batch = useBatch(codigoId);
  const [bruto, setBruto] = useState('');
  const [resultado, setResultado] = useState<null | { creados: number; omitidos: number; errores: { indice: number; numero: string | null; error: string }[] }>(null);

  const analisis = useMemo(() => {
    const vacio = bruto.trim() === '';
    if (vacio) return { valido: true, items: [] as unknown[], invalidos: [] as string[] };
    try {
      const json = JSON.parse(bruto) as unknown;
      const items = Array.isArray(json)
        ? json
        : json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items)
          ? ((json as { items: unknown[] }).items as unknown[])
          : null;
      if (!items) {
        return {
          valido: false,
          items: [],
          invalidos: ['Se esperaba un array [{numero, texto, rutaSecciones?}] o {items: […]}'],
        };
      }
      const invalidos: string[] = [];
      items.forEach((raw, i) => {
        const i2 = raw as Record<string, unknown>;
        const numero = typeof i2?.numero === 'string' ? i2.numero.trim() : '';
        const texto = typeof i2?.texto === 'string' ? i2.texto.trim() : '';
        const ruta = i2?.rutaSecciones === undefined || (Array.isArray(i2.rutaSecciones) && i2.rutaSecciones.every((k) => typeof k === 'string'));
        if (!numero || !texto || !ruta) {
          invalidos.push(`Fila ${i + 1}: ${!numero || !texto ? 'faltan numero/texto' : 'rutaSecciones inválida'}`);
        }
      });
      return { valido: true, items, invalidos };
    } catch {
      return { valido: false, items: [], invalidos: ['JSON inválido: corrige la sintaxis.'] };
    }
  }, [bruto]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setResultado(null);
    if (!analisis.valido || analisis.items.length === 0) return;
    const res = await batch.mutateAsync({ items: analisis.items });
    setResultado(res as typeof resultado);
  }

  return (
    <Card sinAnimacion className="p-5">
      <h2 className="font-serif text-lg font-semibold text-primary-dark">Carga en lote de artículos</h2>
      <p className="mt-1 text-sm text-texto/60">
        Pega un JSON <code className="rounded bg-surface px-1">[{'{'}"numero":"7","texto":"…","rutaSecciones":["titulo:i","capitulo:1"]{'}'}]</code>
        {' '}o carga un archivo. Las rutas de secciones inexistentes se crean solas (reutilizando el
        reconciliador de sincronización). Cada artículo se publica y audita como edición manual.
      </p>

      <form onSubmit={enviar} className="mt-3 flex flex-col gap-3">
        <textarea
          className={`${CLASE_CAMPO} min-h-40 font-mono text-xs`}
          placeholder='[
  { "numero": "1", "texto": "…", "rutaSecciones": ["titulo:i"] },
  { "numero": "2", "texto": "…" }
]'
          value={bruto}
          onChange={(e) => setBruto(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${btnMini} bg-white text-primary ring-1 ring-inset ring-primary/40 hover:bg-primary/10`}>
            Cargar archivo JSON…
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (!archivo) return;
                const lector = new FileReader();
                lector.onload = () => setBruto(String(lector.result ?? ''));
                lector.readAsText(archivo);
              }}
            />
          </label>
          <Button type="submit" disabled={!analisis.valido || analisis.items.length === 0 || batch.isPending}>
            {batch.isPending ? 'Cargando…' : `Publicar lote (${analisis.items.length})`}
          </Button>
          <span className="text-xs text-texto/55">
            {analisis.items.length} fila(s) leída(s)
            {analisis.invalidos.length > 0 && (
              <span className="ml-2 text-derogado">{analisis.invalidos.length} con problema</span>
            )}
          </span>
        </div>
        {analisis.invalidos.map((m) => (
          <p key={m} className="text-xs text-derogado">
            {m}
          </p>
        ))}
      </form>

      {resultado && (
        <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
          <p>
            <span className="font-semibold text-vigente">{resultado.creados} creados</span> ·{' '}
            <span className="text-texto/60">{resultado.omitidos} omitidos (número ya existía)</span>
            {resultado.errores.length > 0 && (
              <>
                {' '}
                · <span className="font-semibold text-derogado">{resultado.errores.length} errores</span>
              </>
            )}
          </p>
          {resultado.errores.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-derogado">
              {resultado.errores.map((e) => (
                <li key={e.indice}>
                  Fila {e.indice + 1} ({e.numero ?? 'sin número'}): {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Página ----------

export default function Estructura() {
  const { slug = '' } = useParams();
  const { data, isLoading, isError } = useEstructura(slug);
  const [formRaiz, setFormRaiz] = useState(false);
  const [formSinSeccion, setFormSinSeccion] = useState(false);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl space-y-3 px-4 py-6 sm:px-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </main>
    );
  }
  if (isError || !data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="rounded-lg bg-derogado/10 px-4 py-3 text-sm text-derogado">
          No se pudo cargar la estructura del código.
        </p>
        <Link to="/codigos" className="mt-3 inline-block text-sm font-semibold text-primary">
          ← Volver a códigos
        </Link>
      </main>
    );
  }

  const { codigo, secciones, sinSeccion } = data;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/codigos" className="text-xs font-semibold text-primary hover:text-primary-dark">
            ← Códigos y leyes
          </Link>
          <h1 className="font-serif text-2xl font-bold text-primary-dark">{codigo.nombre}</h1>
          <p className="mt-1 text-sm text-texto/60">
            {codigo.versionVigente} · {codigo.fuenteNombre ?? 'sin fuente oficial'} ·{' '}
            {secciones.length} secciones raíz · {sinSeccion.length} artículos sin sección
          </p>
        </div>
        <Button variante="secondary" onClick={() => setFormRaiz((v) => !v)}>
          + Sección raíz
        </Button>
      </div>

      <Card sinAnimacion className="mb-4 p-4">
        {formRaiz && <FormSeccion codigoId={codigo.id} padreId={null} onCerrar={() => setFormRaiz(false)} />}
        <h2 className="mb-2 font-serif text-lg font-semibold text-primary-dark">Árbol normativo</h2>
        <ul className="space-y-1">
          {secciones.map((s) => (
            <NodoEditor key={s.id} nodo={s} codigoId={codigo.id} nivel={0} hermanos={secciones} />
          ))}
          <li className="list-none mt-3 rounded-lg border border-dashed border-primary/25 p-2">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-sans text-sm font-semibold text-texto">Artículos (sin sección)</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-texto/60 ring-1 ring-inset ring-primary/15">
                {sinSeccion.length}
              </span>
              <span className="ml-auto">
                <Mini onClick={() => setFormSinSeccion((v) => !v)}>+ Artículo</Mini>
              </span>
            </div>
            {formSinSeccion && (
              <FormArticulo codigoId={codigo.id} seccionId={null} onCerrar={() => setFormSinSeccion(false)} />
            )}
            <ul className="mt-1 space-y-0.5">
              {sinSeccion.map((a) => (
                <FilaArticulo key={a.id} art={a} />
              ))}
            </ul>
          </li>
        </ul>
      </Card>

      <PanelLote codigoId={codigo.id} />
    </main>
  );
}
