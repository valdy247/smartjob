# VMV Business — fotos originales de productos con inventario conectado

Rama: `feat/vmv-inventory-owner-product-images`
Base: `feat/vmv-ai-visual-personalization`
Estado: preview compilada; migración SQL pendiente de aplicar con autorización de despliegue.
No fusionar con producción sin revisión.

## Reglas implementadas

1. **Fuente única:** los productos de venta autorizados están en `vmv_ai_catalog_items`. Web Studio no crea ni cambia sus imágenes mediante IA.
2. **Foto por producto:** `AI Agents → Productos y pedidos → Catálogo` permite subir JPG, PNG o WebP original (hasta 5 MB). Se verifica la firma del archivo y se envían los bytes originales; no hay generación, recorte, compresión ni filtros.
3. **Almacenamiento protegido:** bucket `vmv-catalog-images`, ruta `{owner_uuid}/{business_uuid}/{image_uuid}.{ext}`, público solo para lectura por URL. La política de INSERT permite únicamente al dueño autenticado en el negocio correspondiente. No se crean políticas de UPDATE ni DELETE para este bucket.
4. **Referencia aprobada:** `vmv_ai_catalog_items.image_path` contiene la ruta, no una URL arbitraria. Trigger `vmv_ai_catalog_owner_image_guard` exige una acción del dueño autenticado cuando cambia ese campo; valida el dueño, negocio, formato de ruta y la existencia del objeto. Los agentes solo consultan el catálogo y no reciben ninguna operación para modificarlo.
5. **Conexión por sitio:** `smartjob_builder_sites.inventory_business_id` indica el catálogo vinculado. El guard comprueba la propiedad tanto del sitio como del negocio. Web Studio muestra selector en escritorio y móvil. Una nueva web con inventario seleccionado puede vincularlo al crearse.
6. **Web pública:** `/web/[slug]` lee server-side productos aprobados y activos del catálogo del dueño del sitio, utilizando una clave de servidor sin exponerla al visitante. Los datos de estos productos sustituyen la **primera sección OfferingGrid** y se actualizan al recargar la web sin republicar. Si no existe OfferingGrid, se crea una sección visual de productos para esa respuesta.
7. **Imagen exactamente como se subió:** el navegador la muestra desde el archivo original mediante `object-fit: contain`, sin recortar ni filtrar. El estilo visual de la web puede cambiar el contenedor, pero nunca los bytes del archivo.
8. **Precios:** se renderiza únicamente el precio USD aprobado en centavos, no texto comercial generado; no habilita checkout de producción ni ventas sin verificación.

## Ruta de activación (pendiente)
1. Revisar y aplicar `supabase/sql/vmv_ai_inventory_owner_photos_web_link.sql` en el proyecto Supabase correcto.
2. Verificar políticas/trigger, bucket, columnas y seguridad de RLS con dos cuentas.
3. Desplegar la rama probada tras revisión; no fusionar con `main` ni modificar producción sin autorización.
4. Entrar en AI Agents / Inventario, subir la foto a un producto, guardar y aprobarlo.
5. Conectar el inventario al sitio desde Web Studio; abrir su URL pública y comprobar que la foto aparece intacta.
6. Cambiar la foto en inventario (sustitución manual explícita); verificar que la publicada cambia sin republicar.
7. Comprobar que un usuario de otro negocio, un agente, un servicio de IA y una URL de imagen ajena NO pueden reasignar la foto o el vínculo.

## QA adicional
- Producto sin foto: placeholder estable, sin inventar una imagen.
- Producto inactivo o sin aprobación: no aparece en el catálogo público.
- Sin inventario conectado: web antigua intacta.
- Sin productos en inventario: la sección conectada permanece vacía, no se muestran datos obsoletos.
- Sitio sin sección de productos: se muestra sección de productos aprobados.
- Cambiar de negocio o revocar vínculo: actualiza la web, sin mezclar catálogos.
- Verificar en iPhone: uploader, tarjetas de productos, selector y vista publicada.
- Verificar error de carga, archivos >5 MB y formatos SVG/HTML (rechazados).
- Verificar que una creación fallida del vínculo no crea múltiples sitios al reintentar.

**Límite:** no existe aún un endpoint público para checkout/stock vendido ni una herramienta IA con permiso de escribir imágenes; ambas decisiones son independientes.
