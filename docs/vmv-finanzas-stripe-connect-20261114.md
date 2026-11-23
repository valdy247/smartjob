# VMV Finanzas — Stripe Connect (piloto 2026-11-14)

Implementación en la rama feat/vmv-smart-call-control-center. Solo Preview y Stripe test. No hay cobros reales.

## Qué está listo

- Cuenta → Finanzas abre /vista-app/finanzas, usando el negocio central actual (sin duplicar negocios ni agentes).
- Backend autenticado /api/vmv/finanzas/status consulta y verifica en Stripe el estado del comercio, cantidades disponibles/pendientes y depósitos de la cuenta conectada.
- Backend /api/vmv/finanzas/connect crea, bajo clic explícito y con idempotencia por negocio, una cuenta Express test y un enlace de onboarding alojado en Stripe para verificación y banco. Permite regresar y continuar la verificación.
- La identidad se comprueba mediante JWT de Supabase, propietario del negocio y metadatos de Stripe. El identificador acct_ se guarda en vmv_ai_merchant_payments del workspace técnico de ese negocio.
- La tabla de pagos solo admite lectura del propietario; actualizaciones de validación se hacen en el servidor. Ready requiere card_payments, transfers, charges_enabled, payouts_enabled y details_submitted comprobados contra Stripe.
- No se usan ni exponen credenciales de facturación de VMV. No se crea saldo propio ni billetera de VMV. Los pagos directos a la cuenta de Stripe del negocio y sus payouts están conceptualmente separados.
- El Checkout comercial actual y webhook continúan en TEST; no cambian líneas telefónicas, Smart Call ni producción.

## Activación técnica pendiente

En Vercel del proyecto smartjob, para la rama feat/vmv-smart-call-control-center (Preview únicamente):

- VMV_AI_COMMERCE_TEST_ENABLED=true — ya configurado en Preview.
- VMV_AI_COMMERCE_STRIPE_SECRET_KEY — falta una clave sk_test_... de la plataforma Stripe Connect habilitada para crear cuentas; nunca usar la de producción ni incluirla en el repositorio.
- VMV_AI_COMMERCE_STRIPE_WEBHOOK_SECRET — registrar un webhook del proveedor para eventos de pago de las cuentas conectadas y guardar su whsec_... antes de probar cobros.
- VMV_AI_TEST_BASE_URL — existente; confirmar origen HTTPS estable y autorizado para retorno de Stripe.
- VMV_AI_COMMERCE_TEST_ENABLED no se debe configurar en producción.

Al completar credenciales, volver a desplegar Preview y ejecutar las pruebas con cuentas y datos Stripe de prueba. El flujo de la UI queda deshabilitado cuando faltan credenciales.

## Aceptación antes de mover dinero

1. El dueño autentica, entra en Finanzas, pulsa Conectar Stripe; Stripe aloja el onboarding. Reintentar no duplica cuenta.
2. Completa la verificación con datos test; regresar no basta: se comprueba estado real en Stripe.
3. Dueño de otro negocio no puede acceder a la cuenta ni ver saldos o depósitos ajenos.
4. Pedido de prueba con precio e inventario verificados → aceptación explícita → Checkout test de cuenta conectada → webhook firmado → pago conciliado y sin duplicación.
5. Probar expiraciones de inventario, rechazos de tarjeta, refund/dispute, contracargos y cuenta suspendida.
6. Chat web público y llamadas: falta flujo de compra seguro para compradores externos, autenticación/identificación apropiada, protección antiabuso y entrega de enlace de pago.
7. Antes de producción: revisar merchant-of-record, comisiones, pérdidas/reembolsos/disputas de Express, legislación/taxes y la opción OAuth de Standard para negocios con cuentas Stripe existentes.

**Importante:** el objetivo de los fondos es que entren a la cuenta Stripe conectada del propio negocio y se depositen a su banco. No asumir que Stripe Express elimina todas las responsabilidades financieras del operador de la plataforma.
