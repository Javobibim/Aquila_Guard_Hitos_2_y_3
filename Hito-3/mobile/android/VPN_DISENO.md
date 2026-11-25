# Aquila Guard Android · diseño de la protección de red

La versión 0.3.0 implementa una ruta experimental para DNS UDP en Chrome y Brave. Usa `DnsResolver.rawQuery` sobre la red subyacente de Android en lugar de integrar una biblioteca externa. El alcance implementado y la prueba de campo se detallan en [README.md](README.md). Las alternativas de transporte general y la matriz completa siguen siendo diseño y validación pendiente.

## Flujo propuesto

Al integrar el servicio, convertir `protection` en biblioteca Android y mantener el parser, el reenvío y las pruebas de paquetes independientes de las clases de Android. `app` enviará acciones de inicio y parada y mostrará estados; `protection` publicará eventos de dominio observado para `detection`, y solo los hallazgos podrán llegar a `notifications` y `data`.

1. Presentar qué datos observará la protección y permitir encenderla voluntariamente. Llamar a `VpnService.prepare()` cada vez y esperar el resultado del sistema si Android pide consentimiento. Solo iniciar desde una acción visible del usuario en la primera beta.
2. Declarar el servicio protegido por `android.permission.BIND_VPN_SERVICE`, transición a primer plano y una notificación persistente con **Detener**. Comprobar el tipo FGS y sus permisos contra el SDK objetivo. Android documenta `systemExempted` para VPN que cumplen sus condiciones. Publicar el estado a partir del proceso y del túnel, con estados `Detenido`, `Conectando`, `Observación limitada` y `Sin conexión`. [Guía VpnService](https://developer.android.com/develop/connectivity/vpn) · [Tipos de servicio](https://developer.android.com/develop/background-work/services/fgs/service-types)
3. Empezar con DNS de ruta acotada. Configurar servidores DNS virtuales y rutas host por cada familia que se maneje. Probar primero el transporte de ida y vuelta con el filtrado desactivado. Se necesita manejar el descriptor TUN y las respuestas IP/UDP/TCP, gestionar límites y MTU, y usar sockets upstream protegidos con `protect()` antes de conectar. `DnsWire` y `DnsForwarder` solo cubren mensajes DNS de aplicación, con UDP/TCP de prueba. El reenvío en claro del prototipo no se usará para sustituir DNS cifrado.
4. Para DNS visible, enviar al detector el nombre normalizado y descartar el mensaje tras el procesamiento. La primera activación funcional avisará sin bloquear. El DNS cifrado elegido por el navegador o Android, las respuestas en caché y las conexiones directas pueden ocultar el dominio. Conservar su conectividad, no forzar una degradación a DNS sin cifrar y no inferir una URL desde IP o caché. Con cobertura insuficiente, informar que parte de la navegación queda fuera del análisis.
5. Cerrar el descriptor y los sockets al detener, revocar el permiso, fallar la verificación del transporte o cambiar la red subyacente. Serializar el ciclo de vida para evitar dos túneles y limpiar el estado en `onRevoke()`. Si se pierde el transporte, retirar la ruta de prueba y restaurar la red normal. Con consentimiento para historial, guardar solo hallazgos y deduplicar avisos por dominio en una ventana acotada.

## Dependencia candidata

**AdGuard DnsLibs** es la candidata para el procesamiento DNS y los resolutores cifrados. Su núcleo C++ incluye un adaptador Android y soporta DoT, DoH, DoQ y DNSCrypt. Su código declara Apache-2.0. El historial del proyecto muestra cambios recientes en las API Android y los tiempos de espera. Antes de adoptarla, fijar una revisión, inventariar licencias transitivas, verificar firmas o hashes, compilar para `arm64-v8a` y probar tamaño, memoria, latencia y control de sockets. La biblioteca procesa DNS y la integración Android debe encargarse del descriptor TUN y de la conectividad IP. [Repositorio y licencia](https://github.com/AdguardTeam/DnsLibs) · [Historial de cambios](https://github.com/AdguardTeam/DnsLibs/blob/master/CHANGELOG.md)

Si el alcance cambia a transporte IP general, evaluar en un experimento separado **tun2socks v2.7.0** con su pila gVisor. Esa versión declara MIT y tiene soporte IPv6; el binario oficial documenta plataformas de escritorio y la adaptación Android requeriría integrar y probar los descriptores, la salida de tráfico, las ABI y las licencias de dependencias. No se incluye ninguna de estas bibliotecas en el APK de la primera entrega. [Código y características](https://github.com/xjasonlyu/tun2socks) · [Versión y mantenimiento](https://github.com/xjasonlyu/tun2socks/releases/tag/v2.7.0)

## Pruebas de conectividad antes de activar detección

Primero mide una línea base con la VPN apagada. En el emulador o en un Android de prueba, abre una página HTTPS legítima en Chrome y Brave. Repite con la VPN de transporte experimental, con el filtrado y los avisos desactivados, y repite tras detener el servicio. Registra tiempos de resolución, fallos y recuperación. Usa un resolutor de prueba bajo control del equipo con respuestas A, AAAA y NXDOMAIN y usa nombres sintéticos. Los casos que requieren red móvil o cambios de red se validan en equipo físico de pruebas.

| Caso | Condición para avanzar |
|---|---|
| IPv4, IPv6 y red dual | Respuestas A y AAAA correctas cuando están disponibles, HTTPS operativo y sin regresión de la familia que no se enruta |
| NXDOMAIN, truncamiento y expiración | NXDOMAIN preservado, fallback TCP verificado, sin bucles ni respuestas inventadas al vencer el plazo |
| DNS privado en Android y DNS seguro del navegador | Mantienen su comportamiento original. La app indica limitaciones de cobertura donde corresponda. |
| Wi‑Fi a datos, modo avión y recuperación | Sin bloqueo persistente. La UI refleja el estado real y la navegación vuelve después de restaurar conexión. |
| Rechazo de consentimiento, **Detener**, revocación y otro proveedor VPN | Sin rutas ni servicio residuales. Android recupera su navegación y el estado deja de mostrar actividad. |
| 30 minutos de reposo y ráfagas controladas | Registrar CPU, memoria y datos con y sin la prueba. Sin sondeo activo continuo ni almacenamiento de consultas sin hallazgos. |

Los tests `:protection:testDebugUnitTest` comprueban el formato IP y UDP en ambas familias y el intercambio de mensajes DNS en loopback del prototipo de reenvío. La matriz TUN requiere un Android con el servicio ejecutándose. Una vez superada, añadir un dominio sintético a la lista de prueba y comprobar que un aviso explica el hallazgo sin romper la navegación. Mantener la salida de red verificada por separado de la exactitud del detector.

## Distribución

Revisar antes de enviar a Google Play la declaración de `VpnService`, el tipo FGS, la divulgación destacada y el consentimiento aplicable, la política de privacidad y Seguridad de los datos. Si existe un endpoint de túnel, Google exige cifrar el tráfico hasta él. Un resolutor remoto para DNS cifrado recibe las consultas que se le envían. Documentar el destino, la finalidad, el tratamiento y las alternativas antes de activarlo. La elegibilidad y aprobación dependen de la implementación que se presente. [Política de VpnService en Google Play](https://support.google.com/googleplay/android-developer/answer/12564964?hl=es)
