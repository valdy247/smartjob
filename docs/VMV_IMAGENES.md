# VMV CALL — imágenes aprobadas

## Imagen 1 — Llamadas traducidas (elegida por el usuario)

- **Archivo exacto:** `public/vmv/imagen-1.webp`
- **Dónde:** primera tarjeta de Inicio, ilustración a ancho completo; único CTA: **Llamadas traducidas**.
- **Contenido:** una mujer y un profesional de construcción conversando por teléfono, burbujas de español e inglés y flechas verdes de traducción.
- **Exportación:** WebP RGBA con fondo transparente, 1200 × 675 px, aproximadamente 159 KB.
- **Comportamiento:** la web busca ese archivo automáticamente y usa el placeholder Imagen 1 mientras no exista. La app iPhone solicitará la misma ruta al servidor web y mostrará el placeholder si no se puede cargar.
- **Interacción:** el botón abre la pestaña Llamadas. La ilustración es decorativa, no activa desvíos ni llamadas salientes.

## Imagen 2 — Traductor IA (pendiente)

- **Archivo exacto:** `public/vmv/imagen-2.webp`
- **Dónde:** segunda tarjeta de Inicio.
- **Concepto previsto:** dos burbujas de conversación limpias, una verde menta con símbolo de traducción y otra blanca con onda de voz.
- **Formato sugerido:** WebP transparente, aprox. 1000 × 900 px; tamaño ideal inferior a 250 KB.
- **Estado:** placeholder Imagen 2 hasta que se apruebe.

## Publicar Imagen 1

1. Descargar el WebP optimizado `imagen-1.webp` proporcionado en la conversación.
2. Abrir el directorio `public/vmv` de la rama `feat/live-v2-production-foundations` en GitHub.
3. Seleccionar **Add file → Upload files**, subir **imagen-1.webp** y realizar commit directamente en esa rama.
4. Vercel publicará la imagen mediante su deploy de Preview de esa rama. No hay que modificar `components/VMVImageSlot.tsx`, que ya apunta a `/vmv/imagen-1.webp`.
5. Para iOS: el código nativo la carga desde el servidor VMV Call, sin guardar otra copia del WebP en `apps/ios/assets`.

La marca, el logo y los iconos de pestañas están dibujados en código, sin imágenes adicionales.
