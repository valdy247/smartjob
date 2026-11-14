# VMV Business · AI Agents × Web Services · Catálogo e inventario compartidos

**Rama compartida:** `feat/vmv-smart-call-control-center`. **Propietario de esta implementación:** AI Agents. 
**No modificar:** Smart Call, traductor, rutas Twilio, editor Web Studio ni facturación de VMV.

## Hallazgo comprobado

Web Studio persiste tarjetas visuales en `smartjob_web_intake_products.items` (owner_id, JSONB), con `id`, `title`, `description`, `price` (texto opcional) e `image`. Es contenido de marketing, sin inventario ni checkout.

La fuente de comercio aprobada de AI Agents es `vmv_ai_catalog_items` (owner_id, business_id, SKU, precio en centavos, stock_mode, available_qty, approved, active), con reservas temporales `vmv_ai_inventory_holds` y pedidos transaccionales.

Una etiqueta «Desde $25» NO es un precio de compra fijo. Nunca copiarla como precio autorizable. No convertir los productos físicos a inventario ilimitado automáticamente.

## Implementado

1. `vmv_ai_owner_import_web_card(businessId,webProductId)`, SECURITY INVOKER + RLS, importa fichas guardadas por el mismo propietario; solo precios USD fijos numéricos. Vincula el ID con `vmv_ai_catalog_items.web_source_id`.
2. Todo lo importado entra `approved=false, active=false, stock_mode=manual`; no hay ventas automáticas. Reimportar la misma ficha es idempotente y no sobrescribe precios aprobados ni existencias. El propietario revisa los datos y aprueba manualmente.
3. `AI Agents → Productos y pedidos → Catálogo → Productos de Web Studio` muestra fichas disponibles y permite importar; no requiere editar archivos de Web Services.
4. `GET /api/vmv/ai-agents/catalog?businessId=<UUID>` es **solo para el dueño autenticado** (Supabase Bearer). Entrega `products` del catálogo activo/aprobado, con `priceCents`, `availableQuantity`, `availability`, `webSourceId`, `sellableInTest`. No es una API pública para compradores ni un endpoint de checkout. Incluye `Cache-Control: private, no-store`.
5. `lib/vmv-ai-agents/catalog-snapshot.ts` calcula existencias descontando holds vigentes; `voice-commerce.ts` usa esta MISMA fuente, dejando el precio y el inventario revalidados por la RPC transaccional al preparar un pedido de prueba.
6. En AI Agents, la selección de producto para cotizar se deshabilita si la lectura verificada del servidor falla o indica que no se puede vender.

## Pruebas realizadas

- Siete pruebas de Node para inventario rastreado, apartados, 0 unidades, productos manuales/ilimitados, variantes no soportadas, precios válidos y source ID: **PASS 7/7**.
- Postgres, transacción **ROLLBACK**: importación a $25.50, reimportación idempotente, rechazo de «Desde $25», estado no aprobado/inactivo/manual: **PASS**.
- Postgres, transacción **ROLLBACK**: un usuario diferente no puede importar productos al negocio de otro: **PASS**.
- TypeScript aislado de AI Agents (`CommerceStudio`, `commerceStore`, `catalog-snapshot`, `voice-commerce`, endpoint autenticado): **PASS**.
- El compilador global encontró un error en `lib/web-builder-ai-site.ts` (otro módulo). No editar ese archivo desde AI Agents. Volver a verificar el HEAD actualizado.
- No se procesaron cobros, se publicaron sitios ni se modificaron productos comerciales reales.

## Acciones pendientes para Web Services / Director

**Es necesaria coordinación con el responsable de Web Services antes de tocar su editor o su sitio publicado.**

1. En el sitio publicado, reemplazar cualquier uso de `SiteProduct.price` como precio de compra por datos **publicables derivados del catálogo autorizado**. El endpoint autenticado NO debe ser expuesto a clientes sin una capa pública específica de sitio asociado a negocio, dominio verificado y límite de consulta.
2. Definir `business_id` para cada sitio y el modelo de autorización del visitante. No exponer el propietario ni la clave de servicio de Supabase.
3. Conectar inventario y carrito web a las **mismas RPCs transaccionales** (y extendidas para LIVE cuando la pasarela de pagos del negocio esté verificada). Nunca decrementar stock desde el navegador ni crear dos saldos.
4. Para actualizaciones posteriores en Web Studio, mostrar diferencias y exigir re-aprobación de cambios de precio o producto. Esta implementación deliberadamente **no sincroniza silenciosamente** cambios de marketing hacia el catálogo autorizado.
5. Definir variantes, impuestos, envíos, devoluciones, stock de artículos físicos y políticas de disponibilidad antes de habilitar checkout público.

## Estado de cobros y lanzamiento

`vmv_ai_merchant_payments` no registra una cuenta comercial verificada para el piloto. El checkout actual es TEST-only y requiere una cuenta Stripe Connect del negocio **separada** de la cuenta de facturación de VMV. No prometer una venta pagada ni crear un checkout en vivo hasta la verificación.

Esta entrega habilita un puente **real y seguro** de importación y un contrato de inventario compartido para el futuro Web Services; no afirma que el sitio publicado ya muestre el stock en vivo, ni que el checkout de producción esté terminado.
