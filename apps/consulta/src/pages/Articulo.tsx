// Zona 4 — Detalle de articulo: breadcrumb, texto completo en serif, estado, ultima reforma,
// fuente oficial y boton de favorito.
// Zona 5 — La estrella ya NO es local: se pinta con el estado de GET /api/favoritos
// (persistido por device_id) y se alterna con useToggleFavorito (actualizacion
// optimista con rollback si el servidor falla).
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ArticuloCard from '../components/ArticuloCard';
import Button from '../components/Button';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import PromptPush from '../components/PromptPush';
import ResumenPanel, { SelectorLectura, type ModoLectura } from '../components/ResumenPanel';
import { ApiError } from '../lib/api';
import { useArticulo } from '../hooks/consulta';
import { etiquetaSeccion, fmtFecha, recortar } from '../lib/formato';
import { debeOfrecerPush } from '../lib/push';
import { registrarVisita } from '../lib/historial';
import { buscarFavorito, useFavoritos, useToggleFavorito } from '../lib/favoritos';

const CLAVE_MODO = 'legal.modo-lectura.v1';

export default function Articulo() {
  const { slug = '', numero = '' } = useParams();
  const { data, isPending, isError, error } = useArticulo(slug, numero);

  // Fase 5 — al leer un articulo se apunta en el historial local ("continuar donde ibas").
  useEffect(() => {
    const a = data?.articulo;
    if (!a) return;
    registrarVisita({
      tipo: 'articulo',
      clave: `${data.codigo.slug}::${a.numero}`,
      slug: data.codigo.slug,
      numero: a.numero,
      etiqueta: `Art. ${a.numero}`,
      sub: data.codigo.nombre,
    });
  }, [data]);

  // Sin sesion iniciada es el device_id del telefono; con cuenta, el de la cuenta.
  const { data: dataFavoritos } = useFavoritos();
  const toggle = useToggleFavorito();

  // Zona 9 — el aviso de push SOLO aparece tras marcar el primer favorito con
  // exito (nunca al abrir la app) y solo si procede (permiso 'default', no suscrito).
  const [ofrecerPush, setOfrecerPush] = useState(false);

  // Mejora — feedback breve del boton "Copiar"/"Compartir" del articulo.
  const [aviso, setAviso] = useState<string | null>(null);

  // Fase 6 — como se lee el articulo (completo o resumido). Se recuerda en el
  // telefono: si la persona suele leer en resumen, no quiere re-pulsarlo cada vez.
  const [modo, setModo] = useState<ModoLectura>(() => {
    try {
      return localStorage.getItem(CLAVE_MODO) === 'resumen' ? 'resumen' : 'completo';
    } catch {
      return 'completo';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_MODO, modo);
    } catch {
      /* modo privado: la eleccion dura solo esta visita */
    }
  }, [modo]);

  // Estado real del favorito: consulte la lista del dispositivo por articulo.
  const favorito = buscarFavorito(dataFavoritos?.favoritos, data?.articulo.id);

  const manejarToggle = (nuevo: boolean) => {
    if (!data) return;
    toggle.mutate(
      {
        articuloId: data.articulo.id,
        favoritoId: nuevo ? null : (favorito?.id ?? null),
        detalle: nuevo
          ? {
              codigoSlug: data.codigo.slug,
              codigoNombre: data.codigo.nombre,
              numero: data.articulo.numero,
              esApartadoClave: data.articulo.esApartadoClave,
              vigente: data.articulo.vigente,
              extracto: recortar(data.articulo.texto),
            }
          : undefined,
      },
      {
        // Estrella YA encendida y guardada en el servidor => ofrecer avisos (1 vez).
        onSuccess: () => {
          if (nuevo && debeOfrecerPush()) setOfrecerPush(true);
        },
      },
    );
  };

  if (isPending) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 font-sans sm:px-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-1/2" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-3/4' : 'w-full'}`} />
          ))}
        </div>
      </main>
    );
  }

  const noEncontrado = error instanceof ApiError && error.esNotFound;
  if (isError || !data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 font-sans sm:px-6">
        <Card sinAnimacion className="space-y-3 p-6 text-center">
          <h1 className="font-serif text-2xl font-semibold text-texto">
            {noEncontrado ? 'Artículo no encontrado' : 'No se pudo cargar el artículo'}
          </h1>
          <p className="text-sm text-texto/60">
            {noEncontrado
              ? 'Este artículo no existe dentro del código seleccionado.'
              : 'Comprueba que el servicio de consulta esté disponible.'}
          </p>
          <Link
            to={slug ? `/codigo/${slug}` : '/'}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:text-primary-dark sm:min-h-0"
          >
            ← Volver
          </Link>
        </Card>
      </main>
    );
  }

  const { codigo, articulo, fuenteOficial } = data;
  const reforma = fmtFecha(articulo.fechaUltimaReforma);
  const estado = articulo.vigente ? 'Vigente' : 'Derogado';

  // Mejora — cita formateada del articulo (para pegarla en un escrito) y su enlace.
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const cita = `${codigo.nombre}, artículo ${articulo.numero}${reforma ? ` (última reforma: ${reforma})` : ''}: «${recortar(articulo.texto)}»`;
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  function marcar(msg: string): void {
    setAviso(msg);
    setTimeout(() => setAviso(null), 2500);
  }

  async function copiar(texto: string): Promise<void> {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      // Fallback: contextos no seguros (Capacitor/file://) o clipboard bloqueado.
      try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      } catch {
        ok = false;
      }
    }
    marcar(ok ? 'Cita y enlace copiados.' : 'No se pudo copiar.');
  }

  async function compartir(): Promise<void> {
    try {
      await navigator.share({ title: `Art. ${articulo.numero} — ${codigo.nombre}`, text: cita, url });
    } catch {
      /* la persona cancel el dialogo nativo: no se hace nada */
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-8 font-sans sm:px-6">
      <nav aria-label="Ruta de navegación">
        <Link
          to={`/codigo/${codigo.slug}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:text-primary-dark sm:min-h-0"
        >
          ← {codigo.nombre}
        </Link>
      </nav>

      {/* Migajas: codigo > secciones > articulo. */}
      <nav aria-label="Migajas">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-texto/50">
          <li>
            <Link to="/" className="hover:text-primary">
              Biblioteca
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to={`/codigo/${codigo.slug}`} className="hover:text-primary">
              {codigo.nombre}
            </Link>
          </li>
          {articulo.breadcrumb.map((b, i) => (
            <li key={`${b.tipo}-${b.numero}-${i}`} className="contents">
              <span aria-hidden="true">/</span>
              <span>{etiquetaSeccion(b.tipo, b.numero, b.nombre)}</span>
            </li>
          ))}
        </ol>
      </nav>

      {/* Fase 6 — elegir entre leer todo o leer el resumen explicado. */}
      <SelectorLectura modo={modo} onModo={setModo} />

      {/* Tarjeta del numero + estrella. En "Resumen" el texto integro se quita de aqui
          y lo sustituye el panel de sectores. */}
      <ArticuloCard
        numero={articulo.numero}
        texto={articulo.texto}
        esApartadoClave={articulo.esApartadoClave}
        estado={estado}
        favorito={!!favorito}
        onToggleFavorito={manejarToggle}
        ocultarTexto={modo === 'resumen'}
      />

      {/* Fase 6 — el mismo texto en dos formatos: integro o explicado por sectores. */}
      {modo === 'resumen' && <ResumenPanel texto={articulo.texto} />}

      {toggle.isError && (
        <p role="alert" className="-mt-2 text-xs font-medium text-derogado">
          No se pudo guardar el favorito sin conexión; la estrella volvió a su estado real.
        </p>
      )}

      {/* Mejora — llevarse el artículo: cita + enlace al portapapeles o al chat nativo. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variante="secondary"
          onClick={() => void copiar(`${cita}\n${url}`)}
          className="min-h-11 sm:min-h-0"
        >
          <IconoCopiar />
          Copiar cita
        </Button>
        {puedeCompartir && (
          <Button variante="secondary" onClick={() => void compartir()} className="min-h-11 sm:min-h-0">
            <IconoCompartir />
            Compartir
          </Button>
        )}
        {aviso && (
          <span role="status" className="animate-aparecer text-xs font-medium text-vigente">
            {aviso}
          </span>
        )}
      </div>

      <Card sinAnimacion className="space-y-3 p-5 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-texto/50">Última reforma</p>
            <p className="font-medium text-texto">{reforma ?? 'Sin registro'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-texto/50">Estado</p>
            <p className="font-medium text-texto">{estado}</p>
          </div>
        </div>
        {fuenteOficial && (
          <div>
            <p className="text-xs uppercase tracking-wide text-texto/50">Fuente oficial</p>
            <a
              href={fuenteOficial.urlOrigen}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:text-primary-dark hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0"
            >
              {fuenteOficial.nombre}
            </a>
          </div>
        )}
      </Card>

      {/* Zona 9 — mini-aviso de push (solo tras el primer favorito). */}
      <PromptPush abierto={ofrecerPush} onCerrar={() => setOfrecerPush(false)} />
    </main>
  );
}

function IconoCopiar() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function IconoCompartir() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8l7.6-4.3M8.2 13.2l7.6 4.3" />
    </svg>
  );
}
