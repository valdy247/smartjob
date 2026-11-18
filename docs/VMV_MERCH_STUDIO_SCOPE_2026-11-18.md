# VMV Business — Merch Studio (Marketing)

Fecha: 18 de noviembre de 2026
Estado: **Próximamente**. Solo tarjeta de presentación y alcance documentado; **servicio no implementado**.
Ubicación aprobada: **Marketing → Más herramientas para tu negocio**, junto a Video Translate y Tarjeta de presentación. **No crear tarjeta duplicada en Servicios.**
Rama de trabajo: `feat/vmv-smart-call-control-center`.

## Objetivo

Permitir a pequeños negocios encargar **pulóveres / camisetas personalizados**, inicialmente con **logotipo y un código QR**, desde VMV Marketing. La impresión y el envío a domicilio estarían a cargo de un proveedor externo de impresión bajo demanda; VMV organizaría el diseño, la vista previa, la solicitud y el seguimiento cuando se implemente.

## Flujo de producto futuro (no disponible)

1. El usuario selecciona Merch Studio desde Marketing.
2. Escoge prenda, modelo, color, talla y cantidad; el catálogo y disponibilidad provendrán del proveedor autorizado.
3. Sube el logotipo e indica destino del QR: sitio web, catálogo, landing de ofertas u otra URL permitida.
4. VMV valida la URL y genera **un diseño de QR imprimible y escaneable** con tamaño, contraste, zona de silencio y resolución adecuados. El enlace podría ser **dinámico** mediante redirección propia de VMV, siempre que el cliente lo habilite y se implementen políticas seguras de redirección.
5. Muestra una simulación de camiseta con logotipo y QR, y permite correcciones antes del pedido.
6. Solicita una cotización **real** al proveedor, distinguiendo producción, envío, impuestos, comisiones, margen y tiempos estimados por destino y características del producto.
7. El cliente revisa el diseño, acepta condiciones, paga mediante la pasarela autorizada y **solo entonces**, con consentimiento y disponibilidad confirmada, se crea la orden de impresión a través de la API.
8. VMV registra idempotentemente el pedido y muestra estados reales: creado, aceptado por impresor, en producción, enviado, entregado, fallido o cancelado, según los eventos expuestos por el proveedor.
9. Soporte para incidencias, cambios antes de producción (cuando sean posibles), reimpresiones y política de devoluciones del proveedor.

## Integraciones candidatas por investigar y validar

- **Printful API** — catálogo, arte de impresión, vistas previas, pedidos y seguimiento: https://developers.printful.com/docs/
- **Printify API** — catálogo, proveedores de impresión, pedidos y estados: https://developers.printify.com/
- **Gelato API** — impresión y logística global; confirmar funciones comerciales y disponibilidad regional: https://dashboard.gelato.com/docs/
- **Stripe** u otro proveedor de pagos autorizado: cobro confirmado con webhook, antifraude y políticas de reembolso.
- **VMV Web Services**: enlaces a la web y catálogos del negocio; **Marketing** mantiene la experiencia y métricas de QR.

Los proveedores, precios, territorios y permisos de API deben **revalidarse antes de contratar o desarrollar**. Una API disponible no garantiza personalización o entrega en cualquier producto, país o volumen.

## Prueba de viabilidad indispensable

- Pedir **una muestra física** antes de lanzar: confirmar que el QR se lee en la prenda real, incluso con arrugas, distintos teléfonos y condiciones de luz.
- Verificar color, contraste, ubicación, DPI, márgenes de impresión y durabilidad tras lavado.
- Validar renders/vistas previas versus producto entregado.
- Medir costo total real (producto, impresión, envío, impuestos, pagos, reposiciones y atención al cliente) y márgenes con órdenes de prueba.
- Verificar quién asume obligaciones de atención, políticas comerciales y devoluciones.

## Seguridad y restricciones

- Evitar URL maliciosas, redirecciones abiertas, QR que apunten a sitios no autorizados y logotipos sin derechos de uso.
- No publicar precios o tiempos garantizados sin cotización verificada por proveedor.
- El comprador debe aprobar diseño final, talla/cantidad, destino, costo total y términos antes del cobro/pedido.
- No almacenar tarjetas de pago; claves de proveedores solo en backend y aisladas por negocio.
- Respetar privacidad de direcciones y datos de envío, retención, controles de acceso y protección contra pedidos duplicados.
- No dar a entender que Printful, Printify, Gelato o Stripe ya están conectados.

## Alcance actual y fase de lanzamiento

**Se añadió solo la tarjeta «VMV Merch Studio — Próximamente» en Marketing.**
No hay editor de camisetas, generador de QR, imágenes de prueba, integración con impresores, pagos, base de datos de pedidos, logística, webhooks ni despliegue a producción. La implementación queda diferida mientras VMV reúne las últimas capacidades previstas y se prepara para la fase de pulido y lanzamiento.
