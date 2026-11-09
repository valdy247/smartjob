# VMV Call — primer acceso y protección de costos

## Identidad visual
La pantalla de carga comparte `components/Brand.tsx` con el encabezado, acceso y registro: el icono de cinco barras/ondas y el texto **VMV CALL** en mayúsculas. La app nativa usa cinco barras con el mismo nombre y paleta.

## Registro
En `components/SignupWizard.tsx` el usuario puede elegir:
- **Conservar mi número:** su teléfono actual sigue siendo el contacto y, posteriormente, se revisa el desvío con su operador. No se porta el número.
- **Solicitar número nuevo:** solo se guarda la preferencia; no se compra ni asigna una línea automáticamente.

La elección se guarda en `smartjob_profiles.line_choice`, no en facturación. La verificación SMS **previa al pago está deshabilitada** para evitar cargos Twilio a registros anónimos. Se completará cuando la cuenta tenga un plan real verificado y exista un flujo de verificación aprobado.

## Primer acceso
Tras el login, si `plan_prompt_seen = false`, aparece `ActivationFlow` antes del Home:
1. Elegir Starter / Pro / Premium según catálogo del servidor, o **Omitir por ahora**.
2. Al elegir plan, tres pantallas: número, idiomas/asistente/operador, revisión y aceptación.
3. Solo se guardan preferencias no billables. Nunca se llama Twilio ni se activa un desvío desde el wizard.
4. Si se omite, Home y Ajustes siguen accesibles, pero llamadas y funciones AI de pago permanecen bloqueadas.
5. Desde **Ajustes → Plan y pagos**, elegir un plan reinicia el wizard.

iPhone tiene `NativeActivation`, un wizard equivalente. Necesita un instalador firmado con las credenciales de Apple de Expo.

## Seguridad — fail closed
- `lib/vmv-entitlements.ts` comprueba en servidor un **pago Stripe LIVE**; exige `stripe_mode = live` en la fila de billing, suscripción actual con periodo válido y customer/subscription ID.
- **Stripe TEST no cuenta**, aunque el recibo de prueba diga `active`. Los registros históricos de prueba están marcados `stripe_mode=test`.
- `SMARTJOB_PAID_SERVICES_ENABLED` debe estar habilitado explícitamente junto a Stripe Live y su secreto, además de existir una fila LIVE realmente confirmada. Actualmente NO está activa la facturación real ni el cobro a consumidores.
- Se comprueba el pago antes de reservar un puente, llamar a Twilio, emitir tokens Voice, realizar pruebas VoIP, enviar SMS de verificación o invocar IA de pago; la traducción del relay también valida el puente pagado y minutos reservados.
- Se eliminan los pilotos telefónicos antiguos sin usuario al que imputar minutos.
- Peticiones de números solo pueden crearse con `POST /api/line/request` tras autenticación y plan real; solo estado `pending` para revisión manual y **sin compra de número**.
- La base de datos niega directamente INSERT, UPDATE y DELETE de `smartjob_provisioning_requests` a usuarios de web/iPhone.
- Cuando sea necesario activar Stripe Live, se debe implementar y probar además un webhook LIVE firmado que marque `stripe_mode='live'` y valide eventos/identidades, impuestos y App Store. No desbloquear servicios cambiando solo flags.
- Las llamadas entrantes a un número Twilio ya adquirido y su renta pueden generar cargos de Twilio **aunque el backend termine la llamada**; requieren límites y alertas de gasto en la cuenta Twilio y revisión de webhooks/operador. La lógica de app puede bloquear los servicios que inicia, no eliminar costes básicos del proveedor.

## QA antes de producción
- Confirmar splash, logo y nombre idénticos.
- Usuario nuevo: omitir plan → recepción desactivada → Ajustes → elegir plan → wizard.
- Elegir plan en modo TEST → recepción sigue desactivada.
- Confirmar ruta de SMS y llamadas 402/403 para cuentas sin pago real; no marcar test como pago real.
- Confirmar bloqueo de RLS para inserción directa de solicitudes.
- Probar con cuentas reales SOLO después de instalar billing LIVE y configurar presupuesto/alertas Twilio.
- Validar pantalla en Safari iPhone y la nueva compilación nativa 0.4.1 (6).
