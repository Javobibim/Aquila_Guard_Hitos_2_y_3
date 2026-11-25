BEGIN;
CREATE TABLE IF NOT EXISTS analisis (
 id uuid PRIMARY KEY,
 tipo varchar(12) NOT NULL CHECK(tipo IN ('enlace','correo','mensaje','telefono')),
 contenido varchar(50000) NOT NULL,
 titulo text NOT NULL,
 razones jsonb NOT NULL,
 con_senales boolean NOT NULL,
 recomendacion text NOT NULL,
 version_reglas text NOT NULL,
 nota varchar(300) NOT NULL DEFAULT '',
 creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS alertas (
 id uuid PRIMARY KEY,
 analisis_id uuid NOT NULL UNIQUE REFERENCES analisis(id) ON DELETE CASCADE,
 revisada boolean NOT NULL DEFAULT false,
 nota varchar(300) NOT NULL DEFAULT '',
 creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analisis_fecha ON analisis(creado_en DESC);
COMMIT;
