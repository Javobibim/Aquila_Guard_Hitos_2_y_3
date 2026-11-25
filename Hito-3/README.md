# Aquila Guard

Aquila Guard ayuda a revisar enlaces y mensajes sospechosos y explica las señales antes de que la persona decida cómo actuar.

Proyecto de Arquitectura de Desarrollo Móvil y Web, INGT1003, sección 001, Universidad Mayor.

## Empieza aquí

- **Quiero revisar un enlace o mensaje.** Abre la [web](https://aquila-guard-a3ddd.web.app/#revisar). Deja seleccionado **Enlace**, pulsa **Cargar ejemplo de este tipo** y luego **Revisar ahora**. Puedes hacer esta primera prueba directamente en el navegador.
- **Quiero avisos mientras navego en PC.** Usa la extensión. En la [guía de instalación](https://aquila-guard-a3ddd.web.app/instalar.html) abre el enlace de la tienda y, una vez instalada, pulsa **Activar mis avisos** en Aquila Guard. Usa **Probar aviso de dirección** en la misma guía para ver un aviso de prueba. La extensión es opcional para la web y para la evaluación de los hitos.

## Equipo

| Integrante | Usuario de GitHub |
|---|---|
| Diego Lopez | Pendiente de completar por el equipo |
| Javier Rodriguez | Javobibim |
| Milovan Solis | Pendiente de completar por el equipo |

## Entregables

- [Informe final](docs/02_Hito_3/Informe_Final_Hito_3.pdf)
- [Manual de uso e instalación](docs/02_Hito_3/Manual_Uso_Instalacion.pdf)
- [Arquitectura final](docs/02_Hito_3/Arquitectura_final.svg)
- [Evidencia de pruebas del panel](docs/02_Hito_3/Pruebas_Panel_API.json)

## Video del Hito 3

**Video final del Hito 3:** [Aquila.mp4](Aquila.mp4)

El video se encuentra disponible directamente en este repositorio.

## Probar el producto

El [portal público](https://aquila-guard-a3ddd.web.app/) permite revisar contenido pegado. La cuenta es opcional y usa Firebase para guardar los resúmenes que el usuario decida conservar. El historial académico de la API local se guarda en SQL y tiene un almacenamiento independiente.

El portal y la extensión manual del paquete se prepararon en la versión 0.6.14. El 22 de noviembre se envió la extensión 0.6.15 a revisión. La beta Android 0.3.25 se verificó en una Tab S8. Puede avisar en segundo plano cuando la VPN observa un dominio. Los SMS y correos se revisan al compartir o pegar el texto. En iPhone y iPad la revisión manual está disponible desde la web. Consulta la [guía de Android](mobile/android/README.md).

## Propuesta de lanzamiento

El piloto arrancaría sin cobros y con financiamiento de Milovan Solis. Se proponen cinco meses gratuitos para antiguos participantes de la beta y tres meses desde el registro para nuevos. Después, Esencial seguiría gratis. Los precios piloto propuestos son CLP 1.990 al mes para Personal y CLP 3.990 para Familiar. El informe final detalla el costo previsto y los beneficios por validar.

## Levantar el panel académico

Requisitos. Node.js 24.12 o posterior, npm y una carpeta local con permiso de escritura. Extrae el ZIP completo o clona el repositorio. Desde la raíz:

```sh
cd backend-hito2
npm ci
npm run build
node start-local.mjs
```

Deja la consola abierta. En Windows el lanzador intenta abrir el navegador conectado. Si no abre, entra a `http://127.0.0.1:3000` y usa la clave local `API_KEY` generada en `backend-hito2/.env`. Los datos de la demo quedan en `backend-hito2/.data/aquila`. Mantén este servicio en el equipo local.


### Hito 3 · Repite lo que muestra el video

1. En el panel, abrir «Revisar» y pulsar «Cargar ejemplo con señales».
2. Pulsar «Revisar y guardar». Leer el resultado y seleccionar «Continuar a Alertas».
3. En la ficha nueva, pulsar «Marcar ejemplo … como revisado». Recargar la página y comprobar que esa misma ficha sigue mostrando «Revisada».

## Construir y comprobar

Desde la raíz, `npm ci`, `npm test` y `npm run build` construyen y prueban el portal y la extensión. En `backend-hito2`, `npm run check`, `npm test` y `npm run build` comprueban el servicio. Las salidas web se generan en `dist/`. El diagrama y las decisiones están en el [informe final](docs/02_Hito_3/Informe_Final_Hito_3.pdf).

Consulta las [licencias de las fuentes de reputación y dominios](data/) y la declaración de IA y tratamiento de datos del informe final. La configuración pública de Firebase identifica el proyecto. La clave de la demo y los datos generados se mantienen fuera de Git.
