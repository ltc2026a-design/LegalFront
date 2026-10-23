-- Fase 2 — cuentas de la app de consulta creadas por el dueno (CLI) + preferencias.
--
-- Solo sentencias aditivas: la columna generada `articulo.texto_ts` y su indice GIN
-- viven en la migracion 20261021140000_fts_unaccent (SQL puro que Prisma no modela),
-- así que NUNCA deben aparecer en un diff de esta tabla.

-- AlterTable
ALTER TABLE "usuario_app" ADD COLUMN     "login_email" TEXT,
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "ultimo_acceso_en" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_app_login_email_key" ON "usuario_app"("login_email");

-- CreateTable
CREATE TABLE "preferencias_app" (
    "id" TEXT NOT NULL,
    "usuario_app_id" TEXT NOT NULL,
    "tema" TEXT NOT NULL DEFAULT 'claro',
    "tamano_letra" INTEGER NOT NULL DEFAULT 100,
    "codigo_favorito" TEXT,
    "notificaciones" BOOLEAN NOT NULL DEFAULT true,
    "silencio_desde" TEXT,
    "silencio_hasta" TEXT,
    "guardar_historial" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "preferencias_app_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "preferencias_app_usuario_app_id_key" ON "preferencias_app"("usuario_app_id");

-- AddForeignKey
ALTER TABLE "preferencias_app" ADD CONSTRAINT "preferencias_app_usuario_app_id_fkey" FOREIGN KEY ("usuario_app_id") REFERENCES "usuario_app"("id") ON DELETE CASCADE ON UPDATE CASCADE;
