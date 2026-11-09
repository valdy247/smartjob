# VMV Call — las dos imágenes del Inicio

El Inicio tiene **dos tarjetas ilustradas**. Ambas comparten la misma composición: imagen transparente a todo el ancho, degradado menta suave y un solo botón centrado. No agregaremos títulos ni párrafos encima de las ilustraciones.

| Imagen | Archivo exacto | Tarjeta | Botón |
|---|---|---|---|
| **Imagen 1** | `public/vmv/imagen-1.webp` | Dos personas en una llamada telefónica en diferentes idiomas | **Llamadas traducidas** → pestaña Llamadas |
| **Imagen 2** | `public/vmv/imagen-2.webp` | Un empleador y un trabajador se dan la mano mientras conversan; el trabajador sostiene el teléfono | **Traducción en persona** → pestaña Traductor |

## Exportaciones aceptadas

- **Imagen 1:** WebP RGBA, fondo transparente, 1200 × 675 px, 158 990 bytes (≈159 KB).
- **Imagen 2:** WebP RGBA, fondo transparente, 1200 × 676 px, 102 588 bytes (≈103 KB).
- Tamaño total: ≈262 KB. No utilizar versiones PNG pesadas en el proyecto.
- La identidad visual, botones e iconos se dibujan con código; no se requieren más imágenes.

## Cómo incorporarlas a Git

Abrir [`public/vmv` en la rama de pruebas](https://github.com/valdy247/smartjob/tree/feat/live-v2-production-foundations/public/vmv). Elegir **Add file → Upload files**, subir los dos archivos WebP optimizados con esos nombres exactos y confirmar **Commit changes**. Los archivos deberán estar en el directorio `public/vmv/`, no en `apps/ios`.

El componente `components/VMVImageSlot.tsx` ya utiliza las rutas `/vmv/imagen-1.webp` y `/vmv/imagen-2.webp`. **Mientras no estén subidas a GitHub, se verán los holders numerados**. Al publicar los WebP se mostrarán sin cambiar el código.

La versión nativa iPhone carga las ilustraciones desde el servidor web configurado y dispone de los mismos holders si la imagen no se puede descargar. El rediseño no modifica el puente de llamadas ni sus tarifas.

## Criterio de producto

- La tarjeta 1 abre la recepción y configuración de llamadas existentes; no implica que se haya habilitado marcar llamadas salientes desde la web.
- La tarjeta 2 abre Traductor. El modo de voz está implementado en web; la interfaz nativa tiene traducción de texto mientras se termina el micrófono nativo.
- Las tarjetas son accesibles, con texto alternativo y un solo destino por botón.
