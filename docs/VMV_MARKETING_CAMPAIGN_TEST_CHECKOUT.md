# VMV Marketing — Campañas: circuito de pago de PRUEBA

Actualizado: 18 de noviembre de 2026.
Rama: `feat/vmv-smart-call-control-center`.
Alcance: **exclusivamente Stripe TEST en Preview de Vercel**. No hay publicidad activa ni conexión Meta Ads.

## Código y BD preparados
- `Marketing → Campañas`: el planificador actual tiene CTA para iniciar una solicitud de `campaign_setup`.
- El equipo prepara una cotización desde solicitudes; el negocio la acepta en la revisión vigente.
- `POST /api/marketing/campaign-checkout`: cliente autenticado, sólo cotización aceptada y revisión vigente, importe tomado de BD y servicio `campaign_setup`; el presupuesto de anuncios JAMÁS va en este cobro.
- `POST /api/marketing/campaign-webhook`: firma independiente `VMV_MARKETING_STRIPE_WEBHOOK_SECRET`, `livemode=false`, evento y sesión Stripe de prueba, coincidencia exacta de usuario, importe, moneda, solicitud, revisión y aprobación.
- `vmv_marketing_campaign_test_payments`: recibo idempotente por ID de sesión/evento y solicitud+revisión. RLS de lectura para el propietario; escritura sólo servidor.
- Historial del cliente muestra «Servicio VMV pagado (PRUEBA)» tras confirmar el webhook, nunca por llegar a la URL de éxito.

## Estado comprobado, distinto de producción
- Nueva tabla aislada: migración aplicada exitosamente en Supabase.
- Compilación Next.js en rama: validada con Vercel (deploy terminado READY tras corregir TypeScript).
- Stripe conectado en el plugin: existe cuenta de PRUEBA.
- **Sin validación E2E**: a fecha de este documento no hay credenciales de Stripe TEST en esta rama de Vercel, ni webhook registrado y accesible en la URL de Preview. La clave Stripe de prueba en otra rama no se hereda automáticamente.
- Sin Meta OAuth, acceso a cuentas publicitarias ni creación de campañas (pausadas o activas). Ningún botón de pago se presenta si la marca pública está apagada.

## Variables de entorno SOLO para Preview de esta rama
1. `STRIPE_SECRET_KEY` — **sk_test_...** (sensitive); nunca sk_live.
2. `SMARTJOB_STRIPE_MODE=test`.
3. `VMV_MARKETING_CAMPAIGN_TEST_CHECKOUT=true` — habilita únicamente APIs de prueba en Vercel Preview, no producción.
4. `NEXT_PUBLIC_VMV_MARKETING_CAMPAIGN_TEST_CHECKOUT=true` — muestra botón de prueba al cliente, solo después de configurar Stripe/webhook.
5. `VMV_MARKETING_STRIPE_WEBHOOK_SECRET` — **whsec_...** propio del endpoint de este piloto.
6. Backend existente: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
7. `SMARTJOB_PUBLIC_APP_URL` opcional, debe apuntar al Preview de esta rama y coincidir con el origen de las URLs de retorno.

Configurar webhook Stripe TEST apuntando a `https://<preview-publico>/api/marketing/campaign-webhook`, eventos `checkout.session.completed` y `checkout.session.async_payment_succeeded`. Los webhooks NO atraviesan una URL de Preview protegida por Vercel sin una configuración de acceso adecuada; evitar exponer esta URL o una clave de bypass accidentalmente. La URL y el secreto deben ser de **esta** configuración, no de otro entorno.

## QA antes de anunciar «Listo»
1. Iniciar sesión con una cuenta de negocio de prueba y crear una solicitud de campaña.
2. Desde cuenta de operador configurada, fijar precio y nota; comprobar incremento de `quote_revision`.
3. Cliente acepta la versión exacta de la cotización; sólo entonces se habilita «Pagar servicio VMV (PRUEBA)».
4. Usar Checkout Stripe TEST con tarjeta de prueba. Comprobar que el pedido NO incluye el presupuesto publicitario.
5. Confirmar recepción de firma y evento en endpoint; comprobar un solo recibo; recargar y ver «Pagado (PRUEBA)».
6. Reenviar el webhook: sin duplicado. Probar firma incorrecta, `livemode=true`, cambios de cotización y cliente no autorizado: rechazos.
7. Probar checkout cancelado, pago fallido, webhook retrasado y varios navegadores/dispositivos.
8. Confirmar que ninguna prueba habilita creación de anuncios, llamadas reales a Meta, gastos publicitarios o accesos a cuentas ajenas.

## Puertas aún cerradas
- **Meta Ads:** OAuth oficial, revisión de permisos, selección de cuenta autorizada y pruebas de creación PAUSADA. Por seguridad, la publicación requiere aprobación específica de anuncio/cuenta/presupuesto independiente de la aceptación de la tarifa de VMV.
- **Cobro en producción:** tax, condiciones/refunds, precios, métodos de pago, reconciliación y contingencias tras cobros duplicados o webhook retrasado. Se revisan y prueban antes de activar livemode.
- **Cobramos al cliente solo la tarifa VMV.** El gasto publicitario lo factura Meta/Google directamente a la cuenta publicitaria del negocio.

La aplicación no debe afirmar que una campaña está publicada solo porque el cliente aceptó la cotización o pagó un servicio de prueba.
