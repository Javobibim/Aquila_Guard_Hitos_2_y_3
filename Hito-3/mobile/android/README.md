# Aquila Guard Android · avisos y directorio de teléfonos

La beta 0.3.25 compiló el 21 de noviembre de 2026. Pasaron 17 pruebas de detección y 28 de protección, y lint release terminó con cero errores y cuatro advertencias. La instalación y el funcionamiento real siguen pendientes de ensayo en Galaxy. Selecciona texto en otra app y usa **Compartir → Aquila Guard** si la aplicación de origen ofrece esa opción. Pulsa **Revisar sin abrir** para comprobarlo localmente o **Limpiar revisión** para descartar el borrador. Verifica con un texto ficticio, la app cerrada y la app ya abierta.

Aquila Guard permite revisar manualmente el dominio de un enlace y, con autorización, observar consultas DNS de Chrome, Brave y Samsung Internet en Android 10 o posterior. La revisión manual sigue disponible desde Android 8. Para pruebas en Galaxy se usa la variante release de la beta, que omite el acceso a notificaciones de otras apps. La instalación con Play Protect activo, la activación de la VPN y las alertas emergentes requieren comprobación en el dispositivo.

## Primer inicio

1. Abre Aquila Guard y toca **Activar avisos**.
2. Si Android te lo pide, permite las notificaciones y acepta la conexión VPN local.
3. Espera a que aparezca **Avisos activos**. Abre Chrome, Brave o Samsung Internet y visita una página. Puedes detener la vigilancia desde la app o la notificación del servicio.

Aquila Guard comprueba el DNS de la red antes de crear la VPN mediante una consulta al dominio fijo de la web del proyecto. Después verifica que Android reciba una respuesta DNS que atravesó el túnel y comprueba HTTPS con una petición HEAD a la misma web. Las comprobaciones usan el dominio fijo del proyecto. Las consultas del navegador aprovechan la caché DNS de Android.

El modo de diagnóstico y las notificaciones simuladas están en **Ver detalles y pruebas**. Usa **Sonido de los avisos** para silenciar las alertas. Si está encendido, puedes elegir uno de los cinco tonos de riesgo alto. **Vibración corta** se configura por separado. Está apagada al instalar y, cuando se activa, solicita un pulso de 160 ms en dispositivos compatibles. **Probar alerta de riesgo alto** utiliza el mismo canal que un aviso de dominio reportado y muestra que es una simulación. Si la activación se interrumpe, **Copiar diagnóstico** incluye la versión, el estado, el tiempo de la prueba previa y los contadores de consultas y respuestas, sin guardar los sitios visitados.

Para comprobar el primer inicio en una Tab S8, usa una instalación nueva y deja el tamaño de texto del sistema en grande. Verifica que se puedan leer los permisos, pulsar **Activar avisos** y llegar al navegador sin abrir los detalles. Repite con TalkBack y comprueba que anuncie el estado y los botones.

## Prueba de sonido y vibración en el navegador

1. Activa la vigilancia y abre **Ver detalles y pruebas**. Elige el sonido de riesgo alto y activa **Vibración corta**.
2. Toca **Probar con example.org**. El botón habilita durante 30 segundos una única notificación de prueba y abre la página de ejemplo en el navegador compatible.
3. Si la VPN observa esa consulta DNS, aparece **Prueba simulada · Riesgo alto** con la configuración de sonido y vibración elegida. Si el navegador usa una entrada en caché, Aquila Guard realiza una consulta de prueba por la VPN. Si la VPN no observa esa consulta, la app muestra el resultado al volver. También puedes usar **Probar con example.net**.

La prueba utiliza dominios reservados por IANA. Solo activa una simulación al pulsar el botón y no registra un hallazgo de phishing. [Dominios de ejemplo de IANA](https://www.iana.org/help/example-domains)

## Revisar un correo o mensaje

En **Revisión manual → Correo o mensaje**, pega el texto y pulsa **Revisar sin abrir**. Se buscan combinaciones como solicitudes de claves con urgencia y se revisan hasta 30 dominios visibles en 50.000 caracteres. El historial, si está activado, solo conserva los dominios con hallazgos. Si el correo muestra un botón en lugar de la dirección, copia la dirección del botón y pégala en **Enlace**. Para revisar cabeceras y enlaces ocultos en el HTML, usa **Analizar correo** en la web con el archivo original `.eml`. Las cabeceras aportadas se tratan como indicios y carecen de verificación criptográfica.

## Consultar y reportar teléfonos desde Android

1. Publica primero la web y las reglas de Firebase. En la APK 0.3.24, abre **Inicio → Directorio privado de teléfonos → Consultar o reportar un teléfono**.
2. Inicia sesión en la ventana integrada con tu cuenta verificada de Aquila Guard. Puedes usar el mismo correo que en el PC. La sesión de esta ventana es independiente de la del navegador.
3. Prueba **Cargar número ficticio → Consultar reportes compartidos**. Repite en otro dispositivo con otra cuenta verificada para comprobar la coincidencia compartida.
4. Para enviar un aviso, ingresa el número con código internacional y usa **Reportar una llamada o SMS sospechoso**. El envío queda pendiente de revisión. Consulta y reporte se ejecutan en el sitio oficial integrado y requieren conexión. Se envía la huella del número. Puedes volver a los avisos locales con **Volver**.

## Avisos de SMS y Gmail en compilaciones internas de desarrollo

Este apartado describe la variante `debug` para el equipo. La APK 0.3.25 beta incluida en la entrega se compila como `release` y omite este acceso. En la beta, usa **Compartir → Aquila Guard** o pega el texto para revisarlo. La VPN de avisos DNS se configura por separado.

1. Abre **Inicio → Avisos de SMS y correo**. Lee qué acceso se solicita y enciende **Mensajes** o **Gmail**.
2. Pulsa **Abrir acceso a notificaciones**, selecciona **Aquila Guard** y autoriza el acceso. Vuelve a la app. Si aparece **Permitir avisos de Aquila Guard**, toca ese botón.
3. Desde un número de prueba, envía al Galaxy un SMS con `Prueba de Aquila Guard. Verifica tu cuenta en https://bancoestado.cl.acceso.example/verificar`. Para Gmail, envía otro mensaje con esa frase en el asunto o al principio del cuerpo. Deja Aquila Guard en segundo plano y espera las notificaciones originales. Se espera un aviso de precaución si la vista previa incluye la dirección. El dominio es ficticio y la prueba no requiere abrirlo.
4. Comprueba que un mensaje normal como `Nos vemos a las ocho` quede sin alerta. Apaga una fuente y repite su prueba. Puedes revocar el acceso desde Ajustes.

Se admiten las notificaciones nuevas de Google Mensajes, Samsung Mensajes y Gmail. La VPN es independiente. La APK de prueba pide el acceso general de Android a las notificaciones, pero aplica filtros por aplicación y por los interruptores antes de leer el texto. El análisis sucede en memoria. El aviso usa motivos genéricos, sin mostrar ni guardar el remitente o el cuerpo, y no sincroniza nada con Firebase. Android puede ocultar el texto sensible, por ejemplo los códigos de un solo uso. Quedan fuera los correos silenciosos que no publican una notificación, las vistas previas truncadas, las cabeceras, los botones HTML y los adjuntos. La variante de lanzamiento omite el servicio de escucha y conserva la revisión manual.

### Datos de reputación

La APK incluye la instantánea primaria de PhishDestroy con 236.016 nombres, tomada el 7 de noviembre de 2026 UTC. El JSON guarda formato, fuente, fecha, huella del feed y una lista de dominios normalizados. Un nombre exacto reportado eleva el aviso a riesgo alto. El parecido a una marca y las señales del texto producen precaución. La Public Suffix List ayuda a separar el dominio registrable de sus subdominios. La app no visita las direcciones ni envía mensajes a un servicio de reputación. [Formato de PhishDestroy](https://phishdestroy.io/dataset)

PhishTank publica registros por URL completa, con verificación, estado y fecha. Es una fuente complementaria que no se incorpora a esta APK. En servicios compartidos es importante conservar la ruta verificada para evitar atribuirle el reporte a todo el dominio. [Formato de PhishTank](https://www.phishtank.org/developer_info.php)

## Niveles y privacidad

| Resultado | Respuesta |
|---|---|
| Riesgo alto | El dominio coincide con un reporte de la copia local. Se notifica en un canal de prioridad alta. |
| Riesgo moderado | El dominio presenta una señal de suplantación de marca. Se notifica en el canal de precaución con prioridad para un aviso emergente. |
| Recordatorio de acceso | Si el DNS visible corresponde a un proveedor conocido o a un subdominio de acceso, se emite un recordatorio informativo sin tono ni vibración. Se puede desactivar desde la app. |
| Sin coincidencias | Ningún aviso. La ausencia de coincidencias no certifica que el sitio sea seguro. |

El modo automático revisa el nombre consultado, incluso si la consulta la originó un recurso de una página. Las consultas se resuelven con el DNS de Android para la red en uso. El análisis se realiza localmente y Aquila Guard carece de servidor para recibir navegación. El historial está apagado inicialmente. Si se activa, registra solo el dominio, nivel y fecha de los hallazgos, con retención de 7 o 30 días. Las alertas del mismo dominio y nivel se agrupan durante cinco segundos para evitar avisos repetidos por las consultas de una misma carga. Una nueva consulta puede volver a alertar después de esa pausa. En pantalla bloqueada se oculta su contenido.

El túnel dirige únicamente un servidor DNS virtual IPv4. El mismo servidor tramita registros A y AAAA. El tráfico IPv6 ordinario conserva la salida por la red subyacente. El análisis se limita a las consultas visibles de Chrome, Brave y Samsung Internet. El DNS seguro configurado en el navegador, la caché y conexiones directas pueden impedir que se observe un dominio. Si Android renueva el DNS automático en la misma conexión, la app sigue usando el resolutor de esa red. Retira la ruta si cambia la conexión física, se pierde internet o el resolutor, aparece un proveedor de DNS privado personalizado, falla el transporte o el resolutor rechaza tres consultas consecutivas. Si la vigilancia de avisos se interrumpe, informa el motivo en una notificación separada. DNS por TCP hacia la interfaz virtual y DNS UDP fragmentado quedan fuera del alcance de esta beta. Si aparecen, la ruta VPN se retira.

El recordatorio se basa en el nombre consultado, que también puede aparecer en una precarga o al renovar una sesión. Aquila Guard no lee formularios, rutas HTTPS, credenciales ni el resultado del acceso. Los hallazgos de phishing tienen prioridad sobre este recordatorio. No se guardan recordatorios en el historial de Aquila Guard y se agrupan durante cinco segundos por dominio. El último recordatorio queda hasta dos minutos en el panel de notificaciones. Puedes cerrarlo con **Entendido** o deteniendo la vigilancia. Para una prueba controlada con los avisos activos, abre `https://login.prueba-aquila-01.example/` desde un navegador compatible. El dominio es ficticio y se espera que la página no cargue. Para repetir la prueba con una consulta nueva, cambia `01` por otro número.

## Compilar y abrir

1. En Android Studio, abre esta carpeta. Selecciona JDK 17 y SDK 36. Usa la configuración `app` para ejecutar.
2. Para validar desde PowerShell en el entorno de herramientas portables del equipo, ejecuta `./Compilar_Windows.ps1`. Si ya tienes todas las dependencias en caché, puedes añadir `-Offline`.
3. En cualquier entorno con el Gradle Wrapper y SDK configurados, ejecuta `./gradlew.bat :detection:test :protection:testReleaseUnitTest :app:assembleRelease :app:lintRelease`. La salida `app/build/outputs/apk/release/app-release-unsigned.apk` requiere firma. Verifica la versión y el certificado del APK antes de instalarlo en el Galaxy. La variante debug queda para desarrollo interno.

## Prueba en el S23

1. Conecta y autoriza el S23 por USB. Usa `Verificar_S23.ps1` para comprobar la conexión y `Instalar_S23.cmd` para instalar el APK compilado. Puedes desactivar la depuración USB después.
2. Antes de tocar la VPN, abre en Chrome y Brave `https://example.com/` y `https://www.iana.org/` para tener una referencia de navegación legítima.
3. En Aquila Guard, abre **Ver detalles y pruebas** y toca **Solo comprobar conexión**. Lee y acepta la autorización de VPN que muestra Android. Si tienes otra VPN activa, detenla voluntariamente antes de la prueba.
4. Espera **Prueba de conexión completada** y luego abre una página HTTPS legítima que no esté en caché. Si las páginas dejan de cargar, detén la vigilancia desde la app, la notificación o **Ajustes → Conexiones → Más ajustes de conexión → VPN** y verifica que vuelva la navegación. La VPN se retira si la prueba automática falla o tarda más de siete segundos tras crear el túnel. Copia el diagnóstico después de que termine.
5. Solo si el paso anterior pasa, toca **Detener prueba** y luego **Activar avisos**. Acepta las notificaciones. Abre en Chrome o Brave `https://s23-prueba-01.bancoestado.cl.acceso.example/`. El dominio es ficticio y el navegador puede mostrar un error de resolución. Si la consulta llega al túnel y este devuelve la respuesta DNS, se espera **Precaución · Posible suplantación**. Para repetir, usa un prefijo nuevo como `s23-prueba-02`.
6. Repite con una página legítima y comprueba que no haya un aviso. Para comprobar el nivel alto sin visitar un sitio reportado, usa la revisión manual con una URL de la lista de casos del equipo. La notificación de nivel alto en navegación necesita una prueba controlada adicional.
7. Detén la vigilancia. Abre otra página legítima y verifica que internet siga funcionando. En una segunda ronda, prueba el cambio entre Wi‑Fi y datos. La versión actual detiene el túnel ante ese cambio y deja el reinicio en manos del usuario.

Los contadores muestran cuántas respuestas utilizables se devolvieron y cuántos avisos se enviaron a Android en la sesión. Quedan visibles tras detener la VPN y se reinician al empezar otra sesión. Si se detecta un riesgo con su canal de notificación desactivado, la app muestra el hallazgo y permite abrir los ajustes de notificaciones.

La prueba física se considera aprobada al confirmar navegación legítima con la VPN encendida y apagada, un aviso real de prueba, ausencia de aviso para un dominio legítimo y retirada de la VPN al cambiar de red. Las pruebas unitarias cubren ambos niveles, respuestas DNS erróneas, tiempos de espera y fallos de escritura. Estas pruebas usan datos sintéticos y no certifican el comportamiento del S23.

## Si un aviso llega a la bandeja y no aparece en pantalla

En un Galaxy, abre **Ajustes → Notificaciones → Ajustes avanzados** y activa **Administrar categorías de notificación para cada aplicación**, si aparece. Luego abre **Aplicaciones → Aquila Guard → Notificaciones → Categorías de notificación**. Para la categoría que estés probando, selecciona **Alerta** y activa **Mostrar como emergente**. Comprueba también si **No molestar** está silenciando el aviso. Los nombres pueden variar según One UI. La notificación **Aquila Guard · DNS** informa el estado del servicio. Los avisos de riesgo y la prueba simulada usan categorías separadas. [Ajustes de notificaciones de Samsung](https://www.samsung.com/uk/support/mobile-devices/what-to-do-if-notifications-are-not-showing-or-there-is-no-sound-on-your-samsung-galaxy-device/)

## Permisos

Android pide permiso de VPN mediante `VpnService.prepare()`. El servicio está protegido por `BIND_VPN_SERVICE` y usa los permisos de servicio en primer plano. `INTERNET` y `ACCESS_NETWORK_STATE` permiten usar el resolutor de la red seleccionada y detectar cambios. `POST_NOTIFICATIONS` se pide al iniciar avisos o probar una alerta simulada en Android 13 o posterior. [VpnService](https://developer.android.com/develop/connectivity/vpn) · [DnsResolver](https://developer.android.com/reference/android/net/DnsResolver)

El [diseño VPN](VPN_DISENO.md) conserva las pruebas pendientes para ampliar el alcance y preparar una posible publicación.
