// Seed inicial de la Zona 2 (biblioteca legal basica de Quintana Roo + federal).
// Idempotente: todos los registros usan ids deterministas y `upsert`, asi se
// puede ejecutar varias veces sin duplicar datos.
//
// REGLA DURA DEL PROYECTO: la tabla `usuario_admin` se deja VACIA a proposito.
// Las cuentas de administrador del panel SOLO las crea el dueno del sistema
// por linea de comandos (no existe autorregistro; ver Requisitos). No anadir
// admins aqui.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Prisma } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[seed] Falta DATABASE_URL en el entorno (backend/.env).');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ---------- Fuentes oficiales (una por codigo) ----------

type FuenteSeed = { id: string; datos: Prisma.FuenteOficialUncheckedCreateInput };

const fuentes: FuenteSeed[] = [
  {
    id: 'fuente-diputados-cpeum',
    datos: {
      nombre: 'Cámara de Diputados — Biblioteca de Legislaciones (CPEUM)',
      jurisdiccion: 'federal',
      urlOrigen: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CPEUM.pdf',
      metodoIngesta: 'scraper',
      frecuenciaSincronizacion: 'diaria',
      estado: 'activa',
      conectorKey: 'diputados_federal',
    },
  },
  {
    id: 'fuente-diputados-cpf',
    datos: {
      nombre: 'Cámara de Diputados — Biblioteca de Legislaciones (CPF)',
      jurisdiccion: 'federal',
      urlOrigen: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CPF.pdf',
      metodoIngesta: 'scraper',
      frecuenciaSincronizacion: 'diaria',
      estado: 'activa',
      conectorKey: 'diputados_federal',
    },
  },
  {
    id: 'fuente-congreso-qroo-organica',
    datos: {
      nombre: 'Poder Legislativo de Quintana Roo — Leyes estatales',
      jurisdiccion: 'estatal_quintana_roo',
      urlOrigen: 'https://documentos.congresoqroo.gob.mx/leyes/',
      metodoIngesta: 'manual',
      frecuenciaSincronizacion: 'semanal',
      estado: 'activa',
    },
  },
  {
    id: 'fuente-congreso-qroo-civil',
    datos: {
      nombre: 'Poder Legislativo de Quintana Roo — Código Civil',
      jurisdiccion: 'estatal_quintana_roo',
      urlOrigen: 'https://documentos.congresoqroo.gob.mx/codigos/',
      metodoIngesta: 'manual',
      frecuenciaSincronizacion: 'semanal',
      estado: 'activa',
    },
  },
  {
    id: 'fuente-congreso-qroo-penal',
    datos: {
      nombre: 'Poder Legislativo de Quintana Roo — Código Penal',
      jurisdiccion: 'estatal_quintana_roo',
      urlOrigen: 'https://documentos.congresoqroo.gob.mx/codigos/',
      metodoIngesta: 'manual',
      frecuenciaSincronizacion: 'semanal',
      estado: 'activa',
    },
  },
  {
    id: 'fuente-diputados-cnpcf',
    datos: {
      nombre: 'Cámara de Diputados — Biblioteca de Legislaciones (CNPCF)',
      jurisdiccion: 'federal',
      urlOrigen: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPCF.pdf',
      metodoIngesta: 'scraper',
      frecuenciaSincronizacion: 'diaria',
      estado: 'activa',
      conectorKey: 'diputados_federal',
    },
  },
  {
    id: 'fuente-congreso-qroo-pja',
    datos: {
      nombre: 'Poder Legislativo de Quintana Roo — Código de Justicia Administrativa',
      jurisdiccion: 'estatal_quintana_roo',
      urlOrigen: 'https://documentos.congresoqroo.gob.mx/codigos/',
      metodoIngesta: 'manual',
      frecuenciaSincronizacion: 'semanal',
      estado: 'activa',
    },
  },
  {
    id: 'fuente-congreso-qroo-fiscal',
    datos: {
      nombre: 'Poder Legislativo de Quintana Roo — Código Fiscal del Estado',
      jurisdiccion: 'estatal_quintana_roo',
      urlOrigen: 'https://documentos.congresoqroo.gob.mx/codigos/',
      metodoIngesta: 'manual',
      frecuenciaSincronizacion: 'semanal',
      estado: 'activa',
    },
  },
  {
    id: 'fuente-chetumal-fiscal',
    datos: {
      nombre: 'Poder Legislativo de Quintana Roo — Código Fiscal Municipal',
      jurisdiccion: 'municipal',
      urlOrigen: 'https://documentos.congresoqroo.gob.mx/codigos/',
      metodoIngesta: 'manual',
      frecuenciaSincronizacion: 'semanal',
      estado: 'activa',
    },
  },
];

// ---------- Codigos (los 9 documentos de la biblioteca inicial) ----------

type CodigoSeed = { id: string; slug: string; datos: Omit<Prisma.CodigoUncheckedCreateInput, 'id' | 'slug'> };

const codigos: CodigoSeed[] = [
  {
    id: 'codigo-cpeum',
    slug: 'constitucion-politica-eeuu-mexicanos',
    datos: {
      fuenteOficialId: 'fuente-diputados-cpeum',
      nombre: 'Constitución Política de los Estados Unidos Mexicanos',
      tipo: 'constitucion',
      jurisdiccion: 'federal',
      descripcion:
        'Norma suprema del orden jurídico mexicano. Contiene los derechos humanos y sus garantías, la organización de la Federación y de los Estados, y el sistema constitucional de justicia.',
      versionVigente: 'Texto vigente — última reforma publicada en el DOF (2024)',
      fechaUltimaReforma: new Date('2024-12-24T00:00:00Z'),
    },
  },
  {
    id: 'codigo-cpf',
    slug: 'codigo-penal-federal',
    datos: {
      fuenteOficialId: 'fuente-diputados-cpf',
      nombre: 'Código Penal Federal',
      tipo: 'codigo_penal',
      jurisdiccion: 'federal',
      descripcion:
        'Regula los delitos del orden federal, las penas y medidas de seguridad aplicables, y las disposiciones generales del derecho penal sustantivo en México.',
      versionVigente: 'Texto vigente — última reforma publicada en el DOF (2024)',
      fechaUltimaReforma: new Date('2024-06-27T00:00:00Z'),
    },
  },
  {
    id: 'codigo-organica-qroo',
    slug: 'ley-organica-poder-legislativo-qroo',
    datos: {
      fuenteOficialId: 'fuente-congreso-qroo-organica',
      nombre: 'Ley Orgánica del Poder Legislativo del Estado de Quintana Roo',
      tipo: 'ley_organica',
      jurisdiccion: 'estatal_quintana_roo',
      descripcion:
        'Organiza el funcionamiento del Congreso del Estado de Quintana Roo: competencias, órganos de dirección, procesos legislativos y régimen interno.',
      versionVigente: 'Texto vigente con reforma POE 2026-05-12',
      fechaUltimaReforma: new Date('2026-05-12T00:00:00Z'),
    },
  },
  {
    id: 'codigo-civil-qroo',
    slug: 'codigo-civil-qroo',
    datos: {
      fuenteOficialId: 'fuente-congreso-qroo-civil',
      nombre: 'Código Civil para el Estado de Quintana Roo',
      tipo: 'codigo_civil',
      jurisdiccion: 'estatal_quintana_roo',
      descripcion:
        'Rige las relaciones civiles del orden común en Quintana Roo: personas, familia, sucesiones, bienes, propiedad y obligaciones y contratos.',
      versionVigente: 'Texto vigente con reforma POE 2026-07-23',
      fechaUltimaReforma: new Date('2026-07-23T00:00:00Z'),
    },
  },
  {
    id: 'codigo-penal-qroo',
    slug: 'codigo-penal-qroo',
    datos: {
      fuenteOficialId: 'fuente-congreso-qroo-penal',
      nombre: 'Código Penal para el Estado de Quintana Roo',
      tipo: 'codigo_penal',
      jurisdiccion: 'estatal_quintana_roo',
      descripcion:
        'Tipifica los delitos del orden común en Quintana Roo y establece las penas y medidas de seguridad aplicables.',
      versionVigente: 'Texto vigente con reforma POE 2026-04-10',
      fechaUltimaReforma: new Date('2026-04-10T00:00:00Z'),
    },
  },
  {
    id: 'codigo-cnpcf',
    slug: 'codigo-nacional-procedimientos-civiles-familiares',
    datos: {
      fuenteOficialId: 'fuente-diputados-cnpcf',
      nombre: 'Código Nacional de Procedimientos Civiles y Familiares',
      tipo: 'codigo_procedimientos',
      jurisdiccion: 'federal',
      descripcion:
        'Uniforma en todo el país los procedimientos judiciales y no jurisdiccionales en materia civil y familiar, conforme a la reforma constitucional de 2021.',
      versionVigente: 'Texto vigente — DOF 04/04/2023 y reformas posteriores',
      fechaUltimaReforma: new Date('2024-05-15T00:00:00Z'),
    },
  },
  {
    id: 'codigo-pja-qroo',
    slug: 'codigo-procedimientos-justicia-administrativa-qroo',
    datos: {
      fuenteOficialId: 'fuente-congreso-qroo-pja',
      nombre: 'Código de Justicia Administrativa del Estado de Quintana Roo',
      tipo: 'codigo_procedimientos',
      jurisdiccion: 'estatal_quintana_roo',
      descripcion:
        'Regula los procedimientos ante el Tribunal de Justicia Administrativa del Estado de Quintana Roo en materia de faltas administrativas y responsabilidad de servidores públicos.',
      versionVigente: 'Texto vigente con reforma POE 2023-07-13',
      fechaUltimaReforma: new Date('2023-07-13T00:00:00Z'),
    },
  },
  {
    id: 'codigo-fiscal-qroo',
    slug: 'codigo-fiscal-qroo',
    datos: {
      fuenteOficialId: 'fuente-congreso-qroo-fiscal',
      nombre: 'Código Fiscal del Estado de Quintana Roo',
      tipo: 'codigo_fiscal',
      jurisdiccion: 'estatal_quintana_roo',
      descripcion:
        'Disciplina los créditos fiscales, contribuciones y derechos del orden estatal, así como facultades de comprobación y medios de defensa ante la autoridad fiscal estatal.',
      versionVigente: 'Texto vigente con reforma POE 2024-07-24',
      fechaUltimaReforma: new Date('2024-07-24T00:00:00Z'),
    },
  },
  {
    id: 'codigo-fiscal-mun-qroo',
    slug: 'codigo-fiscal-municipal-qroo',
    datos: {
      fuenteOficialId: 'fuente-chetumal-fiscal',
      nombre: 'Código Fiscal Municipal del Estado de Quintana Roo',
      tipo: 'codigo_fiscal',
      jurisdiccion: 'municipal',
      descripcion:
        'Disposiciones fiscales de los municipios de Quintana Roo expedidas por el Congreso del Estado: contribuciones, productos, aprovechamientos, facultades de comprobación y medios de defensa ante las tesorerías municipales.',
      versionVigente: 'Texto vigente con reforma POE 2025-12-10',
      fechaUltimaReforma: new Date('2025-12-10T00:00:00Z'),
    },
  },
];

// ---------- Secciones y articulos de la CPEUM (jerarquia real) ----------

const seccionesCpeum = [
  {
    id: 'seccion-cpeum-titulo-primero',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionPadreId: null,
      tipo: 'titulo',
      numero: 'Primero',
      nombre: 'Título Primero — De las garantías y los derechos',
      orden: 1,
    },
  },
  {
    id: 'seccion-cpeum-cap-1-2',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionPadreId: 'seccion-cpeum-titulo-primero',
      tipo: 'capitulo',
      numero: 'I y II',
      nombre: 'Capítulos I y II: De los derechos humanos, sus garantías y de sus deberes',
      orden: 1,
    },
  },
  {
    id: 'seccion-cpeum-titulo-segundo',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionPadreId: null,
      tipo: 'titulo',
      numero: 'Segundo',
      nombre: 'Título Segundo — De la soberanía nacional y de la forma de gobierno',
      orden: 2,
    },
  },
  {
    id: 'seccion-cpeum-cap-unico-t2',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionPadreId: 'seccion-cpeum-titulo-segundo',
      tipo: 'capitulo',
      numero: 'Único',
      nombre: 'Capítulo Único: De la soberanía nacional',
      orden: 1,
    },
  },
] as const satisfies readonly { id: string; datos: Prisma.SeccionUncheckedCreateInput }[];

const articulosCpeum = [
  {
    id: 'articulo-cpeum-1',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionId: 'seccion-cpeum-cap-1-2',
      numero: '1',
      esApartadoClave: true, // todas las personas gozan de los derechos humanos; interpretacion pro persona
      vigente: true,
      orden: 1,
      texto: `En los Estados Unidos Mexicanos todas las personas gozarán de los derechos humanos reconocidos en esta Constitución y en los tratados internacionales de los que el Estado Mexicano sea parte, así como de las garantías para su protección. Su ejercicio no podrá ser restringido ni suspendido, salvo en los casos y bajo las condiciones que establezca esta Constitución.

Las normas relativas a los derechos humanos se interpretarán de conformidad con esta Constitución y con los tratados internacionales de la materia favoreciendo en todo tiempo a las personas la protección más amplia.

Todas las autoridades, en el ámbito de sus competencias, tienen la obligación de promover, respetar, proteger y garantizar los derechos humanos de conformidad con los principios de universalidad, interdependencia, indivisibilidad y progresividad. En consecuencia, el Estado deberá prevenir, investigar, sancionar y reparar las violaciones a los derechos humanos, en los términos que establezca la ley.`,
    },
  },
  {
    id: 'articulo-cpeum-3',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionId: 'seccion-cpeum-cap-1-2',
      numero: '3',
      esApartadoClave: false,
      vigente: true,
      orden: 3,
      fechaUltimaReforma: new Date('2019-09-15T00:00:00Z'),
      texto: `Toda persona tiene derecho a la educación. El Estado —Federación, Estados, Ciudad de México y Municipios— proveerá los servicios de educación inicial, preescolar, primaria, secundaria, media superior y normal, en todos sus niveles, desde la educación inicial hasta el nivel superior, y garantizará la gratuidad de los incluidos en esta base constitucional.

La educación que imparta el Estado tenderá a desarrollar armónicamente, de la manera más completa posible, todas las facultades del ser humano y fomentará en él, a la vez, el amor a la Patria, la conciencia de la solidaridad internacional y la independencia y la justicia.`,
    },
  },
  {
    id: 'articulo-cpeum-6',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionId: 'seccion-cpeum-cap-1-2',
      numero: '6',
      esApartadoClave: false,
      vigente: true,
      orden: 6,
      texto: `La manifestación de las ideas no será objeto de ninguna inquisición judicial o administrativa, sino en el caso de que ataque a la moral, la vida privada o los derechos de terceros, provoque algún delito, o perturbe el orden público; el derecho de réplica será ejercido en los términos dispuestos por la ley. El derecho a la información será garantizado al pueblo mexicano.

Toda persona tiene derecho al libre acceso a información plural y oportuna, así como a buscar, recibir y difundir información e ideas de toda índole por cualquier medio de expresión.`,
    },
  },
  {
    id: 'articulo-cpeum-14',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionId: 'seccion-cpeum-cap-1-2',
      numero: '14',
      esApartadoClave: false,
      vigente: true,
      orden: 14,
      texto: `A ninguna ley se dará efecto retroactivo en perjuicio de persona alguna.

Nadie podrá ser privado de la vida, de la libertad o de sus propiedades, posesiones o derechos, sino mediante juicio seguido ante los tribunales previamente establecidos, en el que se cumplan las formalidades esenciales del procedimiento y conforme a las Leyes expedidas con anterioridad al hecho.

En los juicios de orden civil, la sentencia debe ser conforme a la letra o a la interpretación jurídica de la ley, y a falta de ésta se fundará en los principios generales del derecho.`,
    },
  },
  {
    id: 'articulo-cpeum-16',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionId: 'seccion-cpeum-cap-1-2',
      numero: '16',
      esApartadoClave: false,
      vigente: true,
      orden: 16,
      texto: `Nadie puede ser molestado en su persona, familia, domicilio, papeles o posesiones, sino en virtud de mandamiento escrito de la autoridad competente, que funde y motive la causa legal del procedimiento. La autoridad administrativa podrá practicar visitas domiciliarias únicamente para cerciorarse de que se han cumplido los reglamentos sanitarios y de policía.

No podrá librarse orden de aprehensión sino por la autoridad judicial y sin que preceda denuncia o querella de un hecho que la ley señale como delito, sancionado cuando menos con pena privativa de la libertad y existan datos que acrediten que el sujeto que puede considerarse probable autor tuvo relación con el hecho que se le atribuye.`,
    },
  },
  {
    id: 'articulo-cpeum-40',
    datos: {
      codigoId: 'codigo-cpeum',
      seccionId: 'seccion-cpeum-cap-unico-t2',
      numero: '40',
      esApartadoClave: false,
      vigente: true,
      orden: 40,
      texto: `Es voluntad del pueblo mexicano constituirse en una República representativa, democrática, laica y federal, compuesta de Estados libres y soberanos en todo lo que concierne a su régimen interior; y de la Ciudad de México, todos ellos integrados en una federación establecida según los principios de esta ley fundamental.`,
    },
  },
] as const satisfies readonly { id: string; datos: Prisma.ArticuloUncheckedCreateInput }[];

// ---------- Ejecucion ----------

async function main() {
  for (const fuente of fuentes) {
    await prisma.fuenteOficial.upsert({
      where: { id: fuente.id },
      update: fuente.datos,
      create: { id: fuente.id, ...fuente.datos },
    });
  }

  for (const codigo of codigos) {
    await prisma.codigo.upsert({
      where: { id: codigo.id },
      update: codigo.datos,
      create: { id: codigo.id, slug: codigo.slug, ...codigo.datos },
    });
  }

  for (const seccion of seccionesCpeum) {
    await prisma.seccion.upsert({
      where: { id: seccion.id },
      update: seccion.datos,
      create: { id: seccion.id, ...seccion.datos },
    });
  }

  for (const articulo of articulosCpeum) {
    await prisma.articulo.upsert({
      where: { id: articulo.id },
      update: { ...articulo.datos, actualizadoEn: undefined },
      create: { id: articulo.id, ...articulo.datos },
    });
  }

  const [nFuentes, nCodigos, nSecciones, nArticulos] = await Promise.all([
    prisma.fuenteOficial.count(),
    prisma.codigo.count(),
    prisma.seccion.count(),
    prisma.articulo.count(),
  ]);
  console.log(
    `[seed] OK — fuentes_oficial: ${nFuentes}, codigos: ${nCodigos}, secciones: ${nSecciones}, articulos: ${nArticulos}`,
  );
}

main()
  .catch((error) => {
    console.error('[seed] fallo:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
