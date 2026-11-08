# VMV Call — estado de implementación y liberación segura

**Rama:** `feat/live-v2-production-foundations`. No fusionar con `main` sin validar la telefonía. La ruta de recepción iOS real, puente Render y traducción EN/ES siguen siendo el piloto operativo.

## Funcionalidades implementadas
- Catálogo propuesto en `lib/vmv-billing.ts`: Starter $9.99/20 min, Pro $19.99/45 min, Premium $49.99/130 min. Precios todavía NO creados en Stripe.
- Recargas propuestas por plan: Starter 20 min/$7.80; Pro 30 min/$9.60; Premium 60 min/$16.20.
- Stripe Checkout para suscripciones y recargas (solo test, deshabilitado hasta configurar credenciales y políticas fiscales).
- Stripe Billing Portal para gestionar suscripciones, vía URL privada en servidor.
- Webhook de Stripe verificado por firma y tiempo, con sincronización transaccional y deduplicación en Supabase.
- Saldo de minutos y contabilidad atómica por llamada: reservar, limitar duración, liquidar y recuperar reservas abandonadas.
- Acumulación Premium: máximo 65 minutos al renovarse si queda saldo mensual; no acumulación en Starter/Pro.
- Voces preaprobadas ElevenLabs en Twilio ConversationRelay y saludos de máximo 180 caracteres para Pro/Premium. No se ofrece clonación.
- Vista web de planes, consumo, recargas y preferencias; resumen read-only en iOS (requiere nuevo build EAS).
- Health del puente revela capacidad y permite rechazar nuevas llamadas rápidamente cuando no hay espacio.

## Base de datos
Las migraciones ya fueron aplicadas al proyecto Supabase compartido (únicamente objetos Smart Job):
1. `smartjob_billing_preferences_quota_foundation`
2. `smartjob_stripe_idempotent_subscription_sync`
3. `smartjob_fix_stripe_event_insert_count`
4. `smartjob_idempotent_topup_ledger`
5. `smartjob_prevent_topup_without_billing_period`
6. `smartjob_recover_orphaned_call_reservations`

Tablas: `smartjob_billing_accounts`, `smartjob_billing_events`, `smartjob_call_preferences`, `smartjob_minute_ledger`; campos adicionales de cobro en `smartjob_call_sessions`. RLS obliga a los usuarios a leer solamente su cuenta; todas las mutaciones de cobros y saldo dependen de `SUPABASE_SECRET_KEY` en el servidor. Las funciones de reserva y conciliación solo permiten ejecución `service_role`.

## Configuración pendiente en Vercel Preview (rama de funcionalidades)
Todas las claves son **solo servidor**; jamás usar `NEXT_PUBLIC_` en secretos.
- `SMARTJOB_STRIPE_MODE=test`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `STRIPE_PRICE_STARTER=price_...`
- `STRIPE_PRICE_PRO=price_...`
- `STRIPE_PRICE_PREMIUM=price_...`
- `STRIPE_TOPUP_STARTER=price_...`
- `STRIPE_TOPUP_PRO=price_...`
- `STRIPE_TOPUP_PREMIUM=price_...`
- `SMARTJOB_PUBLIC_APP_URL=https://<dominio-preview-autorizado>`
- `SMARTJOB_TAX_MODE=automatic` o `not_collected`: decidir explícitamente conforme a obligaciones fiscales. No presupone exención fiscal.
- `SMARTJOB_BILLING_ENFORCEMENT_ENABLED=false` (o ausente) hasta completar pruebas y cobros reales. **No habilitar para la cuenta piloto sin una suscripción/grant probado.**

Registrar `/api/billing/webhook` en Stripe **test** con eventos:
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`.

**Bloqueadores conocidos:** la cuenta Stripe enlazada está en sandbox, no tiene productos ni precios, y Stripe Tax indica `status=pending` con `head_office` pendiente. Hace falta definir el tratamiento fiscal antes de crear productos/precios. La conexión del plugin Stripe no instala automáticamente `STRIPE_SECRET_KEY` en Vercel.

## Pruebas ejecutadas
- Funciones RLS: clientes no pueden otorgarse minutos ni modificar saldos/preferencias premium.
- Evento de suscripción válido y duplicado en transacción rollback: 20 minutos una sola vez.
- Recarga de prueba y evento duplicado: 20 minutos acreditados una sola vez; rollback.
- Reserva de 10 minutos, liquidación de llamada de 125 s: 3 minutos consumidos, reserva 0, repetición sin doble cargo; rollback.
- Renovación Premium con 30 minutos no usados: 30 minutos acumulados y usados reiniciados; rollback.
- Compilación Next.js Preview revisada a través de estado de Vercel.
- No se ha demostrado todavía el E2E de Stripe Checkout/Webhook en Vercel con cuentas de pago reales.

## Pruebas necesarias antes de cobrar
1. Crear productos y precios de Stripe en sandbox después de la decisión fiscal.
2. Probar Checkout, webhook, suscripción, cambio de plan, cancelación, renovación, pago fallido, reintentos, impuestos, recargas y no duplicación.
3. Medir varias llamadas reales usando Twilio Call SIDs y reconciliar con duración facturada de **ambos** tramos y ConversationRelay/voz. Los CallDuration=0 se ignoran y no deben causar facturación errónea.
4. Activar limitación de minutos **solo después** de validar la conciliación. Verificar que la llamada termina realmente al alcanzar el saldo y que las reservas se liberan ante fallo.
5. Probar las voces opcionales en EN/ES; si Twilio rechaza una voz/modelo, dejar la estándar.
6. Realizar nuevas compilaciones iOS/TestFlight desde EAS y revisar las normas de Apple para compras/servicios VoIP.
7. Dimensionar Twilio (CPS, llamadas simultáneas), Render (WebSockets/CPU), Vercel (requests) y traducción (tokens/límites). La capacidad actual del puente sigue limitada a un máximo configurado de 30 y por defecto 1; **no soporta 100 simultáneas sin rediseño y pruebas**.
8. Preparar Android receptor (FCM + SDK), por separado de clientes Android que ya pueden llamar por PSTN.
9. Confirmar titularidad y marcas para VMV Call y dominio antes de renombrar la ficha pública de App Store.

## Reglas de operación
- No activar ni desactivar desvíos Verizon mediante el backend. Evitar redirigir Twilio de vuelta al mismo número de Verizon.
- No dar minutos gratis al activar un perfil: los saldos proceden de eventos Stripe firmados o ajustes administrativos auditados.
- No activar créditos/cobros en producción hasta verificar cumplimiento fiscal y uso de Apple.
- No guardar audio/transcripciones salvo consentimiento, necesidad operativa y políticas de privacidad apropiadas.
