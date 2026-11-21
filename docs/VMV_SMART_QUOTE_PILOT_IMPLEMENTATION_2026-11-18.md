# VMV Smart Quote — implementación piloto y validación

Fecha: 2026-11-18. Código: rama compartida feat/vmv-smart-call-control-center (integrado desde feat/vmv-smart-quote-mvp).
Especificación de origen: docs/VMV_SMART_QUOTE_SCOPE_2026-11-18.md.

## Estado verificado
- Next.js Preview compiló correctamente en Vercel; ruta privada /vista-app/smart-quote.
- La tarjeta Servicios → Crecimiento abre el módulo en la rama piloto.
- **Actualización 18 nov.: migración aplicada** en el proyecto Supabase usado por VMV Business (compartido con otras aplicaciones), mediante la migración versionada vmv_smart_quote_owner_quote_workflow_20261118. Se notificó a PostgREST para recargar el esquema.
- **Verificado por SQL transaccional con ROLLBACK:** catálogo creado/editado como propietario, presupuesto con subtotal/descuento/tax/entrega, aprobación, estado de envío manual, bitácora, bloqueo de duplicación de envío, aislamiento entre dos propietarios y conservación del precio cotizado tras modificar el catálogo. No persisten datos de QA.
- La función de imprimir/guardar en PDF genera una plantilla dentro del navegador; para guardar PDF se usa la opción «Guardar como PDF» del diálogo de impresión.
- No se activaron cobros, facturas, mensajes ni pagos; no se ha ejecutado una prueba de navegador con la sesión real de Mayuli.

## Funcionalidades implementadas
1. Autenticación Supabase del propietario y selector de negocios existentes de vmv_marketing_businesses.
2. Catálogo privado por negocio: servicio, unidad, descripción, precio establecido por propietario y activo/pausado.
3. Borrador de cotización con conceptos de catálogo, cantidades y datos de contacto. Sin inventar precios mediante IA.
4. Subtotal, descuento autorizado, entrega, tasa de impuestos configurada por vendedor y depósito propuesto en USD. El total final se recalcula en PostgreSQL sin confiar en los importes calculados en el navegador.
5. Vencimiento de 0 a 365 días, notas, historial y revisiones. Solo borradores editables.
6. Aprobación explícita del dueño. Al aprobar, los importes quedan bloqueados en esta versión.
7. Copia manual al portapapeles. El dueño marca Ya la envié solo después de enviarla por su canal. Este estado no prueba recepción, aceptación ni pago.
8. Cancelación y bitácora de creación, edición, aprobación, envío declarado y cancelación.
9. RLS en catálogo/cotizaciones/eventos. Mutaciones de cotizaciones mediante RPC con verificación de sesión, titularidad de negocio y precio de catálogo.
10. Diseño responsive español/inglés y validaciones de datos.
11. Plantilla profesional imprimible y exportable a PDF desde el navegador para cotizaciones aprobadas.

## Fuera de este piloto
- Asistente generativo IA, interpretación automática de medidas/fotos, solicitudes de Instagram/Smart Call/Web Services.
- Portal público para aceptar/rechazar cotizaciones; lectura verificada.
- Enlaces Stripe/Square, depósitos reales, webhooks de cobro, facturación y conciliación.
- Recordatorios, emails, DM o mensajes automáticos.
- CRM unificado y métricas de pagos reales.
- Monedas distintas de USD o cálculo tributario complejo por jurisdicción.

## Validaciones completadas y pruebas pendientes
- Completo: migración aplicada sin reemplazar tablas existentes; RLS y RPC verificados con el contrato SQL.
- Completo: prueba SQL de precio, aprobación, envío manual, permisos multiempresa, inmutabilidad del precio y protección contra edición tras la aprobación, todo dentro de transacciones revertidas.
- Completo: Vercel ejecuta npm run smart-quote:test durante npm run build.
- Pendiente: prueba manual con una sesión real de VMV Business en el navegador, con catálogo nuevo, cotización guardada, impresión y PDF.
1. Verificar la sesión de usuario real y acceso a la ruta de Smart Quote.
2. Confirmar que en el negocio Mayuli's Bakery se puede crear un artículo y guardarlo sin errores.
3. Con un usuario de pruebas, crear dos servicios con precios diferentes, cotizar cantidades y cargos, guardar, aprobar e imprimir.
4. En la interfaz, verificar que el propietario de otro negocio no pueda leer, editar ni aprobar información ajena.
5. Verificar montos, vencimiento, revisión, cancelación y eventos, y que copiar una propuesta no la marca como enviada.
6. Verificar que un producto desactivado no se pueda usar en cotizaciones nuevas y que una aprobación preserve el precio histórico.

## Regla de lanzamiento
Mantener Smart Quote en Preview compartido y NO anunciarlo como servicio completo hasta verificar la interfaz con usuario real y las funcionalidades externas pendientes. Para pagos reales hará falta una integración aislada, cuentas verificadas del vendedor, autorización explícita, idempotencia y webhooks válidos.
