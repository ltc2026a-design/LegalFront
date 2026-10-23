// Zona 1 — Pagina de vista previa del sistema de diseno (ruta /design-preview).
// Muestra todos los componentes en sus variantes/estados, la paleta y ambas fuentes.
// Solo presentacional: el unico estado es la demo interactiva de favoritos.
import { useState } from 'react';
import type { ReactNode } from 'react';
import Button from '../components/Button';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Skeleton from '../components/Skeleton';
import ArticuloCard from '../components/ArticuloCard';
import ResumenPanel, { SelectorLectura, type ModoLectura } from '../components/ResumenPanel';

const PALETA: { token: string; clase: string; hex: string }[] = [
  { token: '--color-background', clase: 'bg-background', hex: '#FBF8F5' },
  { token: '--color-surface', clase: 'bg-surface', hex: '#F4ECE3' },
  { token: '--color-tarjeta', clase: 'bg-tarjeta', hex: '#FFFFFF' },
  { token: '--color-primary', clase: 'bg-primary', hex: '#8B5E3C' },
  { token: '--color-primary-dark', clase: 'bg-primary-dark', hex: '#5C4033' },
  { token: '--color-acento', clase: 'bg-acento', hex: '#D9A066' },
  { token: '--color-texto', clase: 'bg-texto', hex: '#2B211A' },
  { token: '--color-texto-suave', clase: 'bg-texto-suave', hex: '#6D5C4E' },
  { token: '--color-texto-tenue', clase: 'bg-texto-tenue', hex: '#9C8B7C' },
  { token: '--color-linea', clase: 'bg-linea', hex: '#E8DDD2' },
  { token: '--color-vigente', clase: 'bg-vigente', hex: '#2E7D32' },
  { token: '--color-derogado', clase: 'bg-derogado', hex: '#B45309' },
  { token: '--color-skeleton', clase: 'bg-skeleton', hex: '#EDE5DE' },
];

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-primary/15 pb-1 font-sans text-lg font-semibold text-primary-dark">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const ARTICLES = [
  {
    numero: 'Artículo 14',
    texto:
      'Ninguna ley se dará efecto retroactivo en perjuicio de persona alguna. Ninguna persona ' +
      'podrá ser privada de su vida, de su libertad, de su propiedad, posesión o derechos, sino ' +
      'en virtud de sentencia dictada por los tribunales...',
    esApartadoClave: true,
    estado: 'Vigente' as const,
  },
  {
    numero: 'Artículo 123',
    texto:
      'Toda persona tiene derecho al trabajo digno y socialmente útil; se promoverán la creación ' +
      'de empleos y la organización social para el trabajo, conforme a la ley.',
    esApartadoClave: false,
    estado: 'Vigente' as const,
  },
  {
    numero: 'Artículo 44 (derogado)',
    texto:
      'Disposición sustituida por reforma publicada en el Diario Oficial; se conserva como ' +
      'referencia histórica de la legislación federal.',
    esApartadoClave: false,
    estado: 'Derogado' as const,
  },
];

// Texto con estructura real (fracciones + incisos) para probar el desglose del resumen.
const MUESTRA_LEGAL =
  'ARTÍCULO 132. Para los efectos de esta Ley, se entenderán por:\n' +
  'I. Trabajo no digno: aquél que se realiza en condiciones que atentan contra la vida, la salud o la seguridad;\n' +
  'II. Trabajo socialmente útil: aquél que permite a la persona trabajadora contribuir al bienestar general;\n' +
  'III. Los patrones deberán:\n' +
  'a) Proveer a los trabajadores de los materiales adecuados;\n' +
  'b) Capacitar a las personas trabajadoras conforme a las necesidades de la empresa.\n' +
  'IV. Queda prohibido exigir a las personas trabajadoras prestaciones distintas de las pactadas.';

export default function DesignPreview() {
  const [favoritos, setFavoritos] = useState<Record<string, boolean>>({ 'Artículo 14': true });
  const [modo, setModo] = useState<ModoLectura>('resumen');

  const alternar = (clave: string, valor: boolean) =>
    setFavoritos((prev) => ({ ...prev, [clave]: valor }));

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-10 font-sans text-texto">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl font-bold text-primary-dark">
          Sistema de Consulta Legal
        </h1>
        <p className="text-sm text-texto/70">
          Vista previa del sistema de diseño (Zona 1) — paleta blanco y café, tipografías y
          componentes.
        </p>
      </header>

      <Seccion titulo="Paleta de color">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {PALETA.map((c) => (
            <div key={c.token} className="space-y-1">
              <div className={`h-14 rounded-lg border border-primary/10 ${c.clase}`} />
              <p className="text-xs font-medium">{c.token}</p>
              <p className="text-xs text-texto/60">{c.hex}</p>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Tipografía">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-primary">Serif · Source Serif 4</p>
            <p className="font-serif text-[17px] leading-relaxed text-texto">
              Ninguna ley se dará efecto retroactivo en perjuicio de persona alguna. Este párrafo
              muestra el cuerpo de texto legal en la fuente serif dedicada a la lectura prolongada.
            </p>
          </Card>
          <Card className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-primary">Sans · Inter</p>
            <p className="text-[15px] leading-relaxed text-texto">
              Fuente sans-serif para la interfaz: navegación, botones, etiquetas y controles. Se usa
              en toda la aplicación fuera del texto legal.
            </p>
          </Card>
        </div>
      </Seccion>

      <Seccion titulo="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variante="secondary">Secondary</Button>
          <Button variante="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Seccion>

      <Seccion titulo="Insignias (Badges)">
        <div className="flex flex-wrap items-center gap-3">
          <Badge estado="Vigente" />
          <Badge estado="Derogado" />
          <Badge estado="En revisión" />
        </div>
      </Seccion>

      <Seccion titulo="Skeleton (carga)">
        <Card sinAnimacion className="space-y-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      </Seccion>

      <Seccion titulo="Resumen por sectores (Fase 6)">
        <div className="space-y-4">
          <SelectorLectura modo={modo} onModo={setModo} />
          {modo === 'completo' ? (
            <p className="texto-legal rounded-xl border border-primary/15 bg-tarjeta p-5 font-serif text-texto/90 shadow-sm">
              {MUESTRA_LEGAL}
            </p>
          ) : (
            <ResumenPanel texto={MUESTRA_LEGAL} />
          )}
        </div>
      </Seccion>

      <Seccion titulo="ArtículoCard + demo de favoritos">
        <div className="space-y-4">
          {ARTICLES.map((a) => (
            <ArticuloCard
              key={a.numero}
              numero={a.numero}
              texto={a.texto}
              esApartadoClave={a.esApartadoClave}
              estado={a.estado}
              favorito={!!favoritos[a.numero]}
              onToggleFavorito={(v) => alternar(a.numero, v)}
            />
          ))}
        </div>
        <p className="text-sm text-texto/70">
          Favoritos actuales:{' '}
          <span className="font-medium text-primary">
            {Object.entries(favoritos)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(', ') || 'ninguno'}
          </span>
        </p>
      </Seccion>
    </main>
  );
}
