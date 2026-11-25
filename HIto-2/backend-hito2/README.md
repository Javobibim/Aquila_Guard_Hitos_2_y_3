# Servicio local del Hito 2

En Windows, abre Iniciar_Servidor.cmd y deja la ventana abierta. Luego abre Demostrar_API.cmd para ejecutar la demo por pasos. Los lanzadores usan el runtime portátil, el de Codex o un Node disponible en el equipo. Si partes de una copia sin dependencias, ejecuta npm ci y npm run build desde esta carpeta.

La API escucha en loopback y usa una clave generada en el archivo local .env. El servidor crea la base persistente en .data/aquila. La migración 003 elimina la columna de texto original de los análisis y conserva los registros, sus notas y sus alertas. Usa datos ficticios.

El contrato y la colección Postman están en docs. Las pruebas del backend usan el parser HTTP con un flujo en memoria por defecto. Con AQUILA_HTTP_TCP=1, las pruebas de integración usan un puerto de loopback real. El historial Firebase es un recorrido separado del panel académico.
