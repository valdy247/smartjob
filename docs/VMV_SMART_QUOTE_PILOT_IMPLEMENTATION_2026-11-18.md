# VMV Smart Quote — implementación piloto y validación

Fecha: 2026-11-18. Código: rama feat/vmv-smart-quote-mvp.
Especificación de origen: docs/VMV_SMART_QUOTE_SCOPE_2026-11-18.md.

## Estado verificado
- Next.js Preview compiló correctamente en Vercel; ruta privada /vista-app/smart-quote.
- La tarjeta Servicios → Crecimiento abre el módulo en la rama piloto.
- **La migración SQL no se aplicó a ningún proyecto Supabase**; antes de hacerlo, el editor mostrará un aviso de preparación pendiente.
- No se modificó producción ni la rama principal/compartida. No se generaron cargos, facturas, mensajes ni pagos.

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

## Fuera de este piloto
- Asistente generativo IA, interpretación automática de medidas/fotos, solicitudes de Instagram/Smart Call/Web Services.
- Portal público para aceptar/rechazar cotizaciones; lectura verificada.
- Enlaces Stripe/Square, depósitos reales, webhooks de cobro, facturación y conciliación.
- Recordatorios, emails, DM o mensajes automáticos.
- CRM unificado y métricas de pagos reales.
- Monedas distintas de USD o cálculo tributario complejo por jurisdicción.

## Pruebas pendientes
1. Elegir un proyecto Supabase de desarrollo o autorizar expresamente aplicar una migración revisada al proyecto usado por VMV. No se ejecutó automáticamente.
2. Aplicar supabase/sql/vmv_smart_quote_owner_pilot_20261118.sql mediante migración versionada.
3. Ejecutar supabase/tests/vmv_smart_quote_contract.sql para verificar RLS y permisos.
4. Ejecutar npm run smart-quote:test y npm run build.
5. Con un usuario de pruebas, seleccionar un negocio, crear dos servicios con precios diferentes, cotizar cantidades y cargos, guardar y aprobar.
6. Verificar que el propietario de otro negocio no pueda leer, editar ni aprobar información ajena.
7. Verificar montos, vencimiento, revisión, cancelación y eventos, y que copiar una propuesta no la marca como enviada.
8. Verificar que un producto desactivado no se pueda usar en cotizaciones nuevas y que una aprobación preserve el precio histórico.

## Regla de lanzamiento
Conservar rama aislada y NO anunciar el servicio como activo hasta completar las pruebas con base de datos y permisos. Para pagos reales hará falta una integración aislada, cuentas verificadas del vendedor, autorización explícita, idempotencia y webhooks válidos.
