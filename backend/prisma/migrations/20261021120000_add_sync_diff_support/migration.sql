-- Zona 6 - soporte de sincronizacion y motor de diff.
--
-- Justificacion (deberia haber estado en la Zona 2, pero la detectamos aqui):
-- el historial_cambio_articulo original obligaba a que articulo_id fuera NO
-- NULL, por lo que era IMPOSIBLE registrar un articulo NUEVO detectado por
-- sincronizacion (todavia no existe en la tabla articulo). Para poder
-- representar los tres tipos de cambio se:
--   - hace articulo_id opcional (para tipoCambio = nuevo),
--   - anaden codigo_id + numero (anclan el articulo nuevo al codigo),
--   - anade el enum tipo_cambio (nuevo/modificado/derogado), default modificado
--     para conservar el significado de las filas existentes.
-- Ademas fuente_oficial gana conector_key, el id estable que selecciona la
-- clase de conector a ejecutar.
--
-- NOTA: esta migracion NO toca la columna generada articulo.texto_ts (tsvector,
-- excepcion documentada en la migracion inicial). Se genero con
-- prisma migrate diff --from-schema <origen> --to-schema <nuevo> para evitar
-- el DROP de esa columna que migrate dev habria propuesto.

-- CreateEnum
CREATE TYPE "tipo_cambio" AS ENUM ('nuevo', 'modificado', 'derogado');

-- AlterTable
ALTER TABLE "fuente_oficial" ADD COLUMN     "conector_key" TEXT;

-- AlterTable
ALTER TABLE "historial_cambio_articulo" ADD COLUMN     "codigo_id" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "tipo_cambio" "tipo_cambio" NOT NULL DEFAULT 'modificado',
ALTER COLUMN "articulo_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "historial_cambio_articulo_codigo_id_idx" ON "historial_cambio_articulo"("codigo_id");

-- AddForeignKey
ALTER TABLE "historial_cambio_articulo" ADD CONSTRAINT "historial_cambio_articulo_codigo_id_fkey" FOREIGN KEY ("codigo_id") REFERENCES "codigo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
