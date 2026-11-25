# Contrato REST v1 de Aquila Guard

Base local `http://127.0.0.1:3000/api/v1`. Autorización Bearer con la clave local. Enviar JSON sin comprimir y usar datos ficticios.

| Método | Ruta | Estado de éxito | Datos de entrada |
|---|---|---|---|
| POST | /analisis | 201 nuevo, 200 reintento | `{"tipo":"enlace","contenido":"https://example.com"}`. Cabecera opcional `Idempotency-Key` con UUID. |
| GET | /analisis?limit=50&offset=0 | 200 | Paginación opcional. |
| GET | /analisis/{id} | 200 | UUID. |
| PATCH | /analisis/{id} | 200 | `{"nota":"Comprobado en la demo"}`. |
| DELETE | /analisis/{id} | 204 | UUID. |
| POST | /alertas | 201 | `{"analisis_id":"c275e01b-2aa6-4e99-b01f-a06032325df5"}`. |
| GET | /alertas?limit=50&offset=0 | 200 | Paginación opcional. |
| GET | /alertas/{id} | 200 | UUID. |
| PATCH | /alertas/{id} | 200 | `{"revisada":true,"nota":"Leída"}`. Basta uno de los campos. |
| DELETE | /alertas/{id} | 204 | UUID. |

Crear devuelve `Location`. Un análisis devuelve `data` con ID, tipo, resumen, título, razones, indicador de señales, recomendación, versión del motor, nota y fecha. El resumen de un enlace contiene el dominio. El resumen de correo, mensaje o teléfono identifica el tipo. Las listas devuelven `data`, `limit` y `offset`. DELETE 204 tiene cuerpo vacío. `version_reglas` corresponde al motor cargado. `/api/v1` identifica la versión de rutas y operaciones.

La misma clave y el mismo contenido normalizado recuperan el análisis previamente creado. Una clave reutilizada para un contenido distinto devuelve 409. Si ese análisis se borró, el reintento devuelve 410. Los clientes que omiten la clave solicitan una creación independiente. El panel conserva la clave al reintentar una operación cuyo resultado quedó incierto. El servidor persiste una huella HMAC, la clave y el ID.

| Código | Caso |
|---|---|
| 400 | JSON inválido. |
| 401 | Clave ausente o incorrecta. |
| 404 | Ruta o registro inexistente. |
| 409 | Una alerta ya existe para ese análisis o la clave de reintento ya se usó para otro contenido. |
| 410 | El análisis de la operación ya se eliminó. |
| 413 | Cuerpo mayor a 256 KiB. |
| 415 | Codificación comprimida rechazada. |
| 422 | Entrada, parámetros o UUID inválidos. |
| 429 | Se alcanzaron 60 solicitudes autenticadas por minuto u ocho simultáneas. Consultar `Retry-After`. |
| 500 | Error interno. |

Límites de texto: enlace 8192 caracteres, correo 50000, mensaje 10000 y teléfono hasta 32 caracteres con 7–15 dígitos. Las notas admiten 300 caracteres. Las listas admiten `limit` de 1 a 100 y `offset` de 0 a 100000. `GET /health` responde 200 o 503.

Ruta → controlador y validación → servicio y motor → repositorio → SQL. Las migraciones `001`, `002` y `003` preparan el modelo y quitan la columna de texto original. Las alertas conservan su FK única y borrado en cascada.
