# VMV CALL — catálogo de imágenes

La aplicación usa **dos imágenes**, ambas en la pantalla Inicio, para mantener el diseño ligero.

| ID visible en la app | Archivo definitivo en Git | Dónde va | Qué debe contener |
| --- | --- | --- | --- |
| Imagen 1 | `public/vmv/imagen-1.webp` | Tarjeta principal «Llamadas en tiempo real», sector derecho | Un iPhone moderno inclinado, pantalla de llamada VMV CALL en turquesa sobre azul marino, ondas de audio y pequeños indicadores español/inglés; sugerencia de globo luminoso, sin párrafos ni texto minúsculo |
| Imagen 2 | `public/vmv/imagen-2.webp` | Tarjeta «Traductor IA», sector derecho | Dos globos 3D de conversación, uno turquesa con símbolo de traducción y otro blanco translúcido con onda de voz; sensación de IA amable, elegante y ligera |

## Reglas para generarlas

- **Formato final:** WebP transparente (RGBA/sRGB), para que el degradado de las tarjetas sea parte del diseño CSS.
- **Imagen 1:** archivo generado a **1200 × 800 px** (WebP RGBA transparente, ~118 KB); sujeto centrado y contenido dentro del 90 % del lienzo; peso ideal **menos de 350 KB**.
- **Imagen 2:** lienzo recomendado **1000 × 900 px**; sujeto centrado, aire alrededor; peso ideal **menos de 250 KB**.
- **Sin fondos blancos, sin marcas de agua, sin sombras cortadas, sin texto legible adicional**. La marca VMV Call se dibuja con código y no requiere tercera imagen.
- Mantener el contraste en pantallas pequeñas: ondas y burbujas grandes, detalles sin saturación.
- Compresión de WebP con calidad 78–86; no subir originales gigantes como PNG cuando estén listos.

## Reemplazo rápido

1. Guardar cada imagen en la ruta indicada dentro de `public/vmv/`.
2. En `components/VMVImageSlot.tsx`, cambiar solo `src:null`:
   - `imagen-1`: `src:"/vmv/imagen-1.webp"`
   - `imagen-2`: `src:"/vmv/imagen-2.webp"`
3. Hacer commit en GitHub. Vercel usará los nuevos archivos en el próximo deploy.
4. Para la versión nativa, el mismo catálogo se replica en las tarjetas de `apps/ios/App.tsx`. Los dos holders seguirán visibles hasta que se conecten las imágenes finales. No cambiar nombres ni agregar más slots sin necesidad.

Los placeholders no hacen peticiones a archivos inexistentes. No hay imágenes definitivas generadas todavía.
