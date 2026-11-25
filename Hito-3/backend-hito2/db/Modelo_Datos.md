# Modelo de datos de la API local

- `analisis` conserva ID, tipo, resumen, resultado, razones, versión del motor, nota y fecha. PATCH cambia la nota.
- `alertas` conserva ID, ID del análisis, estado de lectura, nota y fecha. Hay hasta una alerta por análisis. La FK única aplica borrado en cascada.
- `analisis_reintentos` conserva la clave UUID, una huella HMAC y el ID del análisis. La entrada se guarda en la misma operación que el análisis. Persiste tras borrar el análisis para rechazar reintentos tardíos.

Las migraciones `001_schema.sql`, `002_expand_content.sql` y `003_private_summaries.sql` se aplican al iniciar. La tercera elimina la columna de contenido original de bases antiguas y conserva sus IDs, notas y alertas. Si hay una copia de respaldo anterior, esa copia puede seguir conteniendo el texto histórico. La web pública y la extensión tienen su propio historial en Firestore.
