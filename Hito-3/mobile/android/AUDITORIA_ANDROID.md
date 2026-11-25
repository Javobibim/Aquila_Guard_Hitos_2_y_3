# Auditoría técnica de Aquila Guard Android

**Fecha:** 5 de noviembre de 2026  
**Versiones revisadas:** 0.3.2 y 0.3.3  
**Alcance:** análisis manual, interpretación DNS, transporte VPN, notificaciones, historial y APK de pruebas.

## Primera pasada y correcciones

| Prioridad | Hallazgo reproducido en 0.3.2 | Resultado en 0.3.3 |
|---|---|---|
| Alta para disponibilidad | Un enlace sin esquema que incluía otro enlace en su consulta podía provocar una excepción sin manejar al pulsar Revisar. | El esquema se reconoce al inicio de la entrada. El caso vuelve a identificar el dominio exterior. |
| Media | Una dirección `mailto:` podía aceptarse y mostrar el dominio del correo como si fuera un enlace web. | Se rechazan direcciones no web ambiguas. Se mantienen los enlaces web explícitos y los dominios con puerto. |
| Media | Una consulta válida a la raíz DNS podía detener la vigilancia. | La consulta y la respuesta se reenvían. La raíz carece de un nombre de dominio evaluable y no genera una alerta de phishing. |
| Media | Una respuesta que anunciaba registros fuera del contenido del paquete podía escribirse al túnel. | Se comprueban los límites de cada registro y la dirección de los punteros de compresión antes de escribir. Una respuesta válida con registros comprimidos se conserva. |
| Media | Un error extendido EDNS podía parecer una respuesta utilizable al revisar solo el código del encabezado. | Se combina el código del encabezado con el del registro OPT. El error válido se entrega al navegador y queda fuera de los hallazgos. |

El control de correlación verifica identificador, operación, nombre y tipo de la consulta. La comprobación de los registros se limita a su estructura. [Formato DNS y compresión](https://www.rfc-editor.org/rfc/rfc1035) · [Errores extendidos EDNS](https://www.rfc-editor.org/rfc/rfc6891.html)

## Segunda pasada

- Reejecución de la batería en JVM con el código corregido. Pasaron 26 de 29 pruebas, incluidas las regresiones de los cinco hallazgos. Tres pruebas del reenviador de laboratorio agotaron su tiempo de espera al intercambiar UDP en loopback. Un control independiente de UDP local tampoco recibió respuesta en este entorno. La app utiliza el resolutor de Android en el túnel de producción.
- Revisión estática de privacidad y permisos. El servicio requiere autorización del sistema, limita las aplicaciones a Chrome y Brave y dirige rutas de host hacia los dos DNS virtuales. Las notificaciones ocultan el dominio en pantalla bloqueada. El historial es optativo y el toque de un aviso abre Aquila Guard. [Guía de VpnService](https://developer.android.com/develop/connectivity/vpn)
- Recompilación del APK de desarrollo, verificación de firma y del servicio VPN en el manifiesto. Android Lint terminó sin errores. Mantiene tres avisos de actualización de dependencias y herramientas.

## Cierre para la prueba física

La revisión local acredita el detector y la lógica de transporte probada. Para dar por validada la vigilancia hacen falta una sesión en el S23 con navegación HTTPS antes, durante y después del túnel, y una notificación ante un dominio ficticio que llegue por DNS. También hay que verificar qué ocurre con el DNS privado, al cambiar entre Wi‑Fi y datos y al retirar el permiso de VPN. El DNS cifrado del navegador y la caché pueden dejar visitas fuera de cobertura. Esta versión cubre DNS sobre UDP hacia la interfaz virtual.

Ver [guía de prueba en el S23](README.md).
