-- CreateEnum
CREATE TYPE "rol_admin" AS ENUM ('administrador', 'editor_legal');

-- CreateEnum
CREATE TYPE "jurisdiccion" AS ENUM ('federal', 'estatal_quintana_roo', 'municipal');

-- CreateEnum
CREATE TYPE "metodo_ingesta" AS ENUM ('scraper', 'api', 'manual');

-- CreateEnum
CREATE TYPE "estado_fuente" AS ENUM ('activa', 'en_pausa', 'con_error');

-- CreateEnum
CREATE TYPE "tipo_codigo" AS ENUM ('constitucion', 'codigo_penal', 'codigo_civil', 'codigo_fiscal', 'codigo_procedimientos', 'ley_organica', 'otro');

-- CreateEnum
CREATE TYPE "tipo_seccion" AS ENUM ('libro', 'titulo', 'capitulo', 'seccion');

-- CreateEnum
CREATE TYPE "estado_cambio" AS ENUM ('pendiente_revision', 'aprobado', 'rechazado');

-- CreateEnum
CREATE TYPE "origen_cambio" AS ENUM ('sincronizacion_automatica', 'edicion_manual');

-- CreateEnum
CREATE TYPE "estado_tarea" AS ENUM ('exitosa', 'fallida', 'con_cambios_pendientes');

-- CreateEnum
CREATE TYPE "plataforma" AS ENUM ('web', 'android', 'ios', 'desktop');

-- CreateTable
CREATE TABLE "usuario_admin" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "rol_admin" NOT NULL DEFAULT 'editor_legal',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuente_oficial" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "jurisdiccion" "jurisdiccion" NOT NULL,
    "url_origen" TEXT NOT NULL,
    "metodo_ingesta" "metodo_ingesta" NOT NULL,
    "frecuencia_sincronizacion" TEXT NOT NULL,
    "ultima_sincronizacion_en" TIMESTAMP(3),
    "estado" "estado_fuente" NOT NULL DEFAULT 'activa',

    CONSTRAINT "fuente_oficial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigo" (
    "id" TEXT NOT NULL,
    "fuente_oficial_id" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" "tipo_codigo" NOT NULL,
    "jurisdiccion" "jurisdiccion" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "version_vigente" TEXT NOT NULL,
    "fecha_ultima_reforma" TIMESTAMP(3),
    "slug" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "codigo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seccion" (
    "id" TEXT NOT NULL,
    "codigo_id" TEXT NOT NULL,
    "seccion_padre_id" TEXT,
    "tipo" "tipo_seccion" NOT NULL,
    "numero" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "seccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articulo" (
    "id" TEXT NOT NULL,
    "codigo_id" TEXT NOT NULL,
    "seccion_id" TEXT,
    "numero" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "es_apartado_clave" BOOLEAN NOT NULL DEFAULT false,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "fecha_ultima_reforma" TIMESTAMP(3),
    "orden" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_cambio_articulo" (
    "id" TEXT NOT NULL,
    "articulo_id" TEXT NOT NULL,
    "texto_anterior" TEXT,
    "texto_nuevo" TEXT NOT NULL,
    "fecha_deteccion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_aprobacion" TIMESTAMP(3),
    "estado" "estado_cambio" NOT NULL DEFAULT 'pendiente_revision',
    "origen" "origen_cambio" NOT NULL,
    "aprobado_por_id" TEXT,

    CONSTRAINT "historial_cambio_articulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarea_sincronizacion" (
    "id" TEXT NOT NULL,
    "fuente_oficial_id" TEXT NOT NULL,
    "iniciado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_en" TIMESTAMP(3),
    "estado" "estado_tarea" NOT NULL,
    "cambios_detectados" INTEGER NOT NULL DEFAULT 0,
    "log" TEXT NOT NULL,

    CONSTRAINT "tarea_sincronizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_app" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "nombre" TEXT,
    "email" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_app_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorito" (
    "id" TEXT NOT NULL,
    "usuario_app_id" TEXT NOT NULL,
    "articulo_id" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_cambio" (
    "id" TEXT NOT NULL,
    "articulo_id" TEXT,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "enviada_en" TIMESTAMP(3),
    "enviada_a_todos" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notificacion_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivo_push" (
    "id" TEXT NOT NULL,
    "usuario_app_id" TEXT,
    "token_push" TEXT NOT NULL,
    "plataforma" "plataforma" NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivo_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_admin_email_key" ON "usuario_admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "codigo_slug_key" ON "codigo"("slug");

-- CreateIndex
CREATE INDEX "seccion_codigo_id_idx" ON "seccion"("codigo_id");

-- CreateIndex
CREATE INDEX "seccion_seccion_padre_id_idx" ON "seccion"("seccion_padre_id");

-- CreateIndex
CREATE INDEX "articulo_codigo_id_idx" ON "articulo"("codigo_id");

-- CreateIndex
CREATE INDEX "articulo_seccion_id_idx" ON "articulo"("seccion_id");

-- CreateIndex
CREATE INDEX "historial_cambio_articulo_articulo_id_idx" ON "historial_cambio_articulo"("articulo_id");

-- CreateIndex
CREATE INDEX "historial_cambio_articulo_aprobado_por_id_idx" ON "historial_cambio_articulo"("aprobado_por_id");

-- CreateIndex
CREATE INDEX "tarea_sincronizacion_fuente_oficial_id_idx" ON "tarea_sincronizacion"("fuente_oficial_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_app_device_id_key" ON "usuario_app"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorito_usuario_app_id_articulo_id_key" ON "favorito"("usuario_app_id", "articulo_id");

-- CreateIndex
CREATE INDEX "notificacion_cambio_articulo_id_idx" ON "notificacion_cambio"("articulo_id");

-- CreateIndex
CREATE INDEX "dispositivo_push_usuario_app_id_idx" ON "dispositivo_push"("usuario_app_id");

-- AddForeignKey
ALTER TABLE "codigo" ADD CONSTRAINT "codigo_fuente_oficial_id_fkey" FOREIGN KEY ("fuente_oficial_id") REFERENCES "fuente_oficial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seccion" ADD CONSTRAINT "seccion_codigo_id_fkey" FOREIGN KEY ("codigo_id") REFERENCES "codigo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seccion" ADD CONSTRAINT "seccion_seccion_padre_id_fkey" FOREIGN KEY ("seccion_padre_id") REFERENCES "seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulo" ADD CONSTRAINT "articulo_codigo_id_fkey" FOREIGN KEY ("codigo_id") REFERENCES "codigo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulo" ADD CONSTRAINT "articulo_seccion_id_fkey" FOREIGN KEY ("seccion_id") REFERENCES "seccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_cambio_articulo" ADD CONSTRAINT "historial_cambio_articulo_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_cambio_articulo" ADD CONSTRAINT "historial_cambio_articulo_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuario_admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_sincronizacion" ADD CONSTRAINT "tarea_sincronizacion_fuente_oficial_id_fkey" FOREIGN KEY ("fuente_oficial_id") REFERENCES "fuente_oficial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorito" ADD CONSTRAINT "favorito_usuario_app_id_fkey" FOREIGN KEY ("usuario_app_id") REFERENCES "usuario_app"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorito" ADD CONSTRAINT "favorito_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_cambio" ADD CONSTRAINT "notificacion_cambio_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositivo_push" ADD CONSTRAINT "dispositivo_push_usuario_app_id_fkey" FOREIGN KEY ("usuario_app_id") REFERENCES "usuario_app"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FullTextSearch (Zona 2): columna generada + indice GIN para busqueda de texto
-- completo en espanol sobre los articulos. Prisma 7 no puede modelar columnas
-- GENERATED en schema.prisma, por eso NO aparece en el modelo Articulo
-- (excepcion documentada en el comentario del schema).
ALTER TABLE "articulo" ADD COLUMN "texto_ts" tsvector
    GENERATED ALWAYS AS (to_tsvector('spanish', "texto")) STORED;

-- CreateIndex
CREATE INDEX "articulo_texto_ts_gin_idx" ON "articulo" USING GIN ("texto_ts");
