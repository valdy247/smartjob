# VMV Smart Call — saldos separados y recargas

## Estado confirmado (2026-11-11)

Hay dos servicios distintos, pero el sistema actual **NO tiene dos bolsas de minutos consumibles**:

1. Llamadas sin traducción (direct_call): con una suscripción de producción válida, el backend las autoriza sin descontar la bolsa de traducción. No tiene cuota, contador de minutos restantes ni paquete de recarga propios. El piloto privado Preview tiene una protección excepcional: solo da acceso cuando aún hay saldo de prueba de traducción.
2. Llamadas con traducción (translated_call): las reservas, consumos, transferencias y recargas usan la bolsa actual de smartjob_billing_accounts (included_minutes, used_minutes, reserved_minutes, rollover_minutes, topup_minutes).

No usar la columna used_minutes para aparentar el consumo de llamadas directas. Tampoco sumar las duraciones de llamadas normales al saldo de traducción ni inventar un segundo saldo.

## Implementado en esta rama

- Smart Call > Minutos: dos tarjetas separadas.
- Directas: autorización según el backend, cantidad de llamadas en 30 días; sin balance ficticio. No se muestra pago para un producto inexistente.
- Traducidas: saldo exacto según API del piloto, incluidos, consumidos, vigencia y desglose opcional.
- La recarga existente de minutos **de traducción** usa catálogo y Stripe TEST del piloto, y solo aparece habilitada si el servidor confirma elegibilidad y precio configurado. Se obtiene una sesión de Checkout desde un proxy server-side con Supabase bearer autorizado. No se puede enviar un servicio o plan arbitrario; el servidor piloto vuelve a verificar el plan, cuenta, cliente Stripe, precio e integridad del webhook.
- UI nativa iOS: secciones separadas sin iniciar compras externas ni modificar enrutamiento. No hay compras reales de producción.
- Los pagos Stripe TEST no significan activación de llamadas comerciales ni cargos reales.

## Pendiente para las recargas independientes de llamadas normales

Antes de ofrecer un botón funcional de recarga de llamadas directas hacen falta decisiones de producto y cambios atómicos de facturación:

- Definir minutos incluidos **por plan** para llamadas normales y precios/cantidades **por paquete**.
- Crear contadores separados de directos: incluidos, consumidos, reservados y recargados, con renovaciones y topes.
- Reservar y liquidar minutos en transacciones SQL por call_mode=direct sin tocar los registros de translated; recuperación idempotente de sesiones expiradas.
- Cobrar paquetes distintos con identificadores/precios Stripe separados, metadatos de servicio firmados/verificados y webhooks idempotentes.
- Probar llamadas simultáneas, agotamiento de cada saldo, recargas, suscripciones y restricciones del piloto; los cambios de telefonía se publicarían primero en la API correcta.
- Revisar reglas de pagos aplicables a créditos consumidos dentro de iOS antes de incorporar Checkout en la app nativa.

No hay autorizaciones de precio para inventar cantidades monetarias; se mantiene pendiente y sin cobrar a usuarios. No alterar el piloto activo.
