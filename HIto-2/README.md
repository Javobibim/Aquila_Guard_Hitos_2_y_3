# Aquila Guard · Hito 2

Servicio que revisa contenido sospechoso y guarda un resumen con su alerta para poder consultarlos después. Universidad Mayor, INGT1003, sección 001.

| Integrante | Usuario de GitHub |
|---|---|
| Diego Lopez | Completar con su cuenta |
| Javier Rodriguez | Javobibim |
| Milovan Solis | Completar con su cuenta |

## Entregables

- [Informe técnico](docs/01_Hito_2/Informe_Tecnico_Hito_2.pdf)
- [Contrato REST](docs/01_Hito_2/Contrato_API.md) y [colección Postman](Aquila_Guard.postman_collection.json)
- [Modelo de datos](db/Modelo_Datos.md), [diagrama](db/Modelo_Datos.svg) y [scripts de creación](db/)
- [Servicio por capas](backend-hito2/server/) y [configuración de ejemplo](.env.example)

## Ejecutar la API

Usa Node.js 24.12 o posterior y npm. Desde la raíz del repositorio:

```sh
cd backend-hito2
npm ci
npm run build
node start-local.mjs
```

El lanzador genera la clave local y prepara la base SQL en el primer arranque. Conserva esa consola abierta. En otra terminal, desde backend-hito2, ejecuta `node run-demo.mjs --paso` y pulsa Enter para cada petición. La colección Postman también se puede importar para probar la API con la clave generada en `backend-hito2/.env`. Usa los ejemplos ficticios.

Desde backend-hito2, `npm run check` verifica los tipos y `npm test` ejecuta las pruebas del servicio. Mantén las credenciales y los datos locales fuera de Git.
