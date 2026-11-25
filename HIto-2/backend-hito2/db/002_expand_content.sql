-- Compatibilidad con bases anteriores a la migración de privacidad.
DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'analisis' AND column_name = 'contenido'
 ) THEN
  ALTER TABLE analisis ALTER COLUMN contenido TYPE varchar(50000);
 END IF;
END $$;
