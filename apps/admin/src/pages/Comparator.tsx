// Zona 7 — comparador de un cambio: side-by-side con diff por palabra (WordDiff),
// contexto del articulo/codigo, redaccion segun tipoCambio y acciones Aprobar /
// Rechazar. Al resolver, vuelve a la bandeja con una confirmacion en linea.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDetalle, useResolver } from '../lib/queries';
import { ApiError } from '../lib/api';
import { fechaCorta } from '../lib/formato';
import CambioBadge from '../components/CambioBadge';
import Button from '../components/Button';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import WordDiff from '../components/WordDiff';
import type { TipoCambio } from '../lib/types';

function wording(tipo: TipoCambio, codigo: string, ruta: string[]): string {
  const seccion = ruta.length > 0 ? ruta.join(' › ') : 'sin sección (adjunto al código)';
  switch (tipo) {
    case 'nuevo':
      return `Se publicará este artículo nuevo en ${codigo}, en la sección: ${seccion}.`;
    case 'modificado':
      return `Se reemplazará el texto vigente del artículo en ${codigo} por el texto nuevo.`;
    case 'derogado':
      return 'Se marcará como derogado — el artículo dejará de estar vigente en la app de consulta.';
  }
}

export default function Comparator() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useDetalle(id);
  const resolver = useResolver();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-texto/70">No se pudo cargar el cambio (quizá ya fue revisado).</p>
        <Link to="/" className="mt-3 inline-block font-semibold text-primary hover:text-primary-dark">
          ← Volver a la bandeja
        </Link>
      </main>
    );
  }

  const codigoNombre = data.codigo?.nombre ?? data.codigo?.slug ?? '—';
  const esDerogado = data.tipoCambio === 'derogado';
  const textoBase = data.textoAnterior ?? (esDerogado ? data.textoNuevo : null);

  function manejar(accion: 'aprobar' | 'rechazar') {
    resolver.mutate(
      { id: data!.id, accion },
      {
        onSuccess: () => {
          const msg =
            accion === 'aprobar'
              ? 'Cambio aprobado y publicado en la consulta pública.'
              : 'Cambio rechazado. El artículo no se modificó.';
          navigate('/', { replace: true, state: { confirmacion: msg } });
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'ya_revisado') {
            navigate('/', {
              replace: true,
              state: { confirmacion: 'Este cambio ya había sido revisado.' },
            });
          }
        },
      },
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Link
        to="/"
        className="mb-3 inline-block text-sm font-semibold text-primary hover:text-primary-dark"
      >
        ← Bandeja de pendientes
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CambioBadge tipo={data.tipoCambio} />
        <h1 className="font-serif text-2xl font-bold text-primary-dark">
          {codigoNombre} · Art. {data.numero ?? '—'}
        </h1>
      </div>

      <Card className="mb-4 p-4">
        <p className="text-sm text-texto/75">{wording(data.tipoCambio, codigoNombre, data.seccionRuta)}</p>
        {data.seccionRuta.length > 0 && (
          <p className="mt-1 text-xs text-texto/50">Ubicación: {data.seccionRuta.join(' › ')}</p>
        )}
        <p className="mt-1 text-xs text-texto/50">Detectado: {fechaCorta(data.fechaDeteccion)}</p>
      </Card>

      <WordDiff anterior={textoBase} nuevo={data.textoNuevo} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variante="primary"
          disabled={resolver.isPending}
          onClick={() => manejar('aprobar')}
        >
          {resolver.isPending ? 'Procesando…' : 'Aprobar'}
        </Button>
        <Button
          variante="ghost"
          disabled={resolver.isPending}
          onClick={() => manejar('rechazar')}
          className="text-derogado hover:bg-derogado/10"
        >
          Rechazar
        </Button>
        {resolver.isError && (
          <span role="alert" className="text-sm text-derogado">
            No se pudo resolver el cambio. Vuelve a la bandeja e inténtalo de nuevo.
          </span>
        )}
      </div>
    </main>
  );
}
