BEGIN;
ALTER TABLE analisis ADD COLUMN IF NOT EXISTS resumen varchar(253) NOT NULL DEFAULT 'Revisión guardada';
ALTER TABLE analisis DROP COLUMN IF EXISTS contenido;

-- La clave permanece tras borrar el análisis para impedir que un reintento lo recree.
CREATE TABLE IF NOT EXISTS analisis_reintentos (
 clave uuid PRIMARY KEY,
 huella char(64) NOT NULL,
 analisis_id uuid NOT NULL
);
COMMIT;
