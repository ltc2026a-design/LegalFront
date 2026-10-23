-- Zona 12 — busqueda de texto completo INDEPENDIENTE DE LOS ACENTOS.
--
-- El config `spanish` de Postgres no trata igual "información" (del texto guardado)
-- que "informacion" (lo que escribe la gente en el buscador o en el chat): el
-- tsvector guarda el stem 'inform' y la consulta produce el lexema 'informacion',
-- asi que la busqueda sin tilde no encontraba nada. Se crea una configuracion
-- propia que pasa `unaccent` ANTES del stemmer español, de modo que ambos lados
-- quedan simetricos.
--
-- La columna `texto_ts` es GENERATED: Postgres no permite cambiar su expresion con
-- ALTER COLUMN, asi que se recrea (el indice GIN se suelta y se vuelve a crear).

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION public.spanish_unaccent (COPY = spanish);

ALTER TEXT SEARCH CONFIGURATION public.spanish_unaccent
    ALTER MAPPING FOR asciiword, asciihword, hword_asciipart,
                    word, hword, hword_part
        WITH unaccent, spanish_stem;

DROP INDEX IF EXISTS "articulo_texto_ts_gin_idx";

ALTER TABLE "articulo" DROP COLUMN "texto_ts";

ALTER TABLE "articulo" ADD COLUMN "texto_ts" tsvector
    GENERATED ALWAYS AS (to_tsvector('public.spanish_unaccent', "texto")) STORED;

CREATE INDEX "articulo_texto_ts_gin_idx" ON "articulo" USING GIN ("texto_ts");
