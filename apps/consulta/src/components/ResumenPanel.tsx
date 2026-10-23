// Fase 6 — Panel "Resumen y explicado" de un articulo.
//
// La pagina de lectura ofrece dos formas de ver el mismo texto: "Ver completo" (el
// articulo integro) y "Resumen" (aqui: idea general + explicacion por sectores).
// El analisis lo hace lib/resumenes.ts de forma determinista y local: no necesita red
// ni IA, asi que el resumen funciona offline y nunca inventa contenido.
import { useMemo, useState } from 'react';
import Card from './Card';
import { analizarArticulo, ETIQUETA_TEMA, type Sector, type Tema } from '../lib/resumenes';

export type ModoLectura = 'completo' | 'resumen';

interface Props {
  /** Texto oficial del articulo: se analiza y se explica por sectores. */
  texto: string;
}

// Chip del tema: cada clase es literal completa para que Tailwind la vea en el build.
const CHIP_TEMA: Record<Tema, string> = {
  obligacion: 'bg-primary/12 text-primary-dark ring-primary/25',
  prohibicion: 'bg-derogado/15 text-derogado ring-derogado/30',
  derecho: 'bg-vigente/15 text-vigente ring-vigente/35',
  excepcion: 'bg-acento/15 text-primary-dark ring-acento/35',
  procedimiento: 'bg-primary/10 text-primary-dark ring-primary/20',
  plazo: 'bg-acento/12 text-primary-dark ring-acento/30',
  definicion: 'bg-surface text-texto/70 ring-primary/15',
  autoridad: 'bg-primary/10 text-primary-dark ring-primary/25',
  sancion: 'bg-derogado/15 text-derogado ring-derogado/30',
  generico: 'bg-surface text-texto/60 ring-primary/12',
};

/** Sangria segun la profundidad: fraccion > inciso > apartado. */
const SANGRIA = ['sm:pl-0', 'sm:pl-3', 'sm:pl-6', 'sm:pl-9'];

/** Por encima de esto el sector arranca plegado para no saturar la pantalla. */
const UMBRAL_RECORTADO = 340;

function ChipTema({ tema }: { tema: Tema }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CHIP_TEMA[tema]}`}
    >
      {ETIQUETA_TEMA[tema]}
    </span>
  );
}

function SectorCard({ sector, indice }: { sector: Sector; indice: number }) {
  const largo = sector.cuerpo.length;
  const [abierto, setAbierto] = useState(largo <= UMBRAL_RECORTADO);
  const cuerpo = abierto || largo <= UMBRAL_RECORTADO ? sector.cuerpo : `${sector.cuerpo.slice(0, UMBRAL_RECORTADO).trimEnd()}…`;

  return (
    <li className={SANGRIA[Math.min(sector.profundidad, SANGRIA.length - 1)]}>
      <Card retraso={Math.min(indice * 45, 260)} className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-serif text-[15px] leading-snug font-semibold text-texto">
            {sector.etiqueta}
          </h4>
          <ChipTema tema={sector.tema} />
        </div>

        <p className="text-sm leading-relaxed text-primary-dark">{sector.explicacion}</p>

        <p className="texto-legal font-serif text-texto/85">{cuerpo}</p>

        {largo > UMBRAL_RECORTADO && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:text-primary-dark sm:min-h-0"
          >
            {abierto ? 'Cerrar' : 'Leer este sector completo'}
          </button>
        )}
      </Card>
    </li>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="rounded-lg bg-surface/80 px-2 py-2 text-center ring-1 ring-primary/10 ring-inset">
      <p className="font-serif text-lg leading-none font-semibold text-primary">{valor}</p>
      <p className="pt-1 text-[11px] leading-tight text-texto/55">{etiqueta}</p>
    </div>
  );
}

/**
 * Selector "Ver completo / Resumen". La pagina lo pinta arriba del articulo porque
 * ella es la que decide si muestra el texto integro o este panel.
 */
export function SelectorLectura({ modo, onModo }: { modo: ModoLectura; onModo: (m: ModoLectura) => void }) {
  const completo = modo === 'completo';
  const base =
    'toque aprieta inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors duration-200';

  return (
    <div
      role="group"
      aria-label="Elegir cómo leer el artículo"
      className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1 ring-1 ring-primary/15 ring-inset"
    >
      <button
        type="button"
        aria-pressed={completo}
        onClick={() => onModo('completo')}
        className={`${base} ${
          completo ? 'bg-primary text-sobre-primario shadow-sm' : 'text-texto/65 hover:text-primary'
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        Ver completo
      </button>
      <button
        type="button"
        aria-pressed={!completo}
        onClick={() => onModo('resumen')}
        className={`${base} ${
          !completo ? 'bg-primary text-sobre-primario shadow-sm' : 'text-texto/65 hover:text-primary'
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l2.1 4.7L19 10l-4.9 2.3L12 17l-2.1-4.7L5 10l4.9-2.3L12 3z" />
          <path d="M18.4 16.6l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8.8-1.8z" />
        </svg>
        Resumen
      </button>
    </div>
  );
}

export default function ResumenPanel({ texto }: Props) {
  const resumen = useMemo(() => analizarArticulo(texto), [texto]);
  const sectores = resumen.sectores.filter((s) => s.tipo !== 'intro');

  return (
    <section aria-label="Resumen del artículo" className="animate-aparecer space-y-4">
      <Card sinAnimacion className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-texto/50">
            De qué habla
          </h3>
          <ChipTema tema={resumen.tema} />
        </div>
        <p className="texto-legal font-serif text-texto/90">{resumen.idea}</p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Dato
            valor={String(resumen.totalFracciones || sectores.length)}
            etiqueta={resumen.totalFracciones ? 'fracciones' : 'partes'}
          />
          <Dato valor={String(resumen.totalIncisos)} etiqueta="incisos" />
          <Dato valor={String(resumen.palabras)} etiqueta="palabras" />
        </div>
      </Card>

      {sectores.length > 0 ? (
        <>
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-texto/50">
            {resumen.totalFracciones > 0 ? 'Explicado por sectores' : 'Explicado por puntos'}
          </h3>
          <ul className="space-y-3">
            {sectores.map((s, i) => (
              <SectorCard key={`${s.etiqueta}-${i}`} sector={s} indice={i} />
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-lg bg-surface/80 px-4 py-3 text-sm leading-relaxed text-texto/65 ring-1 ring-primary/10 ring-inset">
          Este artículo es corto y dice una sola cosa: lo de arriba es todo su contenido. No
          tiene fracciones que desglosar.
        </p>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-texto/45">
        El resumen reordena y explica el texto oficial sin cambiarlo. Si vas a citar o pelear
        un detalle, usa la versión completa.
      </p>
    </section>
  );
}
