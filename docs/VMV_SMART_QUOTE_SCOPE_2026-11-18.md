# VMV Business — Smart Quote

Fecha: 2026-11-18

> **Actualización de implementación:** existe un piloto en la rama `feat/vmv-smart-quote-mvp`, con catálogo, presupuestos y aprobación manual. La migración no se ha aplicado ni se han habilitado pagos o integraciones externas. Consulta `docs/VMV_SMART_QUOTE_PILOT_IMPLEMENTATION_2026-11-18.md`. Las secciones de estado y exclusiones siguientes describen el alcance histórico original.
Estado: **Próximamente — concepto documentado, NO implementado**
Rama: `feat/vmv-smart-call-control-center`
Tarjeta visible en: **Servicios → Crecimiento** (`smart-quote`), **deshabilitada** sin formularios, cobros ni integración activa.

## Objetivo del servicio

Ayudar a pequeños negocios a convertir consultas de clientes en **cotizaciones aprobadas, depósitos cobrados y oportunidades rastreables**. El producto no es solo un creador de PDFs; es una ruta asistida desde consulta hasta cobro real, con intervención del propietario cuando proceda.

## Experiencia futura del cliente

1. Una persona consulta un precio por web, Instagram Connect, Smart Call u otro canal conectado y autorizado.
2. VMV reúne los datos necesarios según el tipo de negocio: servicio, medidas, cantidad, fecha, ubicación, imágenes o comentarios.
3. Un asistente genera **un borrador de cotización** a partir del catálogo y las reglas comerciales que el dueño configuró: precios, impuestos, tarifas de entrega, duración, descuentos, vigencia y depósito.
4. El negocio revisa, modifica o aprueba el presupuesto. **No se envía una oferta vinculante ni se cobra automáticamente sin la autorización correspondiente.**
5. VMV comparte un documento/resumen claro con el cliente y, si se aprobó el cobro, un **enlace de pago seguro** creado por el proveedor de pagos.
6. El estado se registra únicamente a partir de eventos verificables: enviada, abierta (si se puede verificar), aceptada, rechazada, vencida y pagada (mediante confirmación del proveedor).
7. Con consentimiento y respeto a las reglas del canal, VMV puede proponer recordatorios sobre cotizaciones pendientes.
8. La oportunidad se refleja en CRM para medir conversión, volumen de cotizaciones y cobros verificados.

## Alcance orientativo del MVP (fase posterior)

- Un editor de catálogo de servicios y reglas de precio por negocio.
- Asistente que solicita datos faltantes y genera un **borrador**; detección de información insuficiente y opción de cotizar manualmente.
- Revisar / editar / aprobar / enviar cotizaciones por un usuario autorizado.
- Plantilla profesional de cotización; idioma español/inglés, moneda, vencimiento y conceptos de impuestos cuando estén configurados.
- Historial y estado con registros de cambios, pertenencia multiempresa y permisos de usuario.
- Enlaces de cobro con proveedor oficial y eventos webhook verificables, evitando guardar datos completos de tarjeta.
- Integración progresiva y opcional con agentes y canales, sin exigir contratar todos los módulos.
- Registro de eventos e indicadores, sin declarar pagos ni ventas por simples respuestas de IA.
- Correcciones, reintentos y prevención de cotizaciones, cobros o notificaciones duplicados.

## APIs candidatas por verificar durante la implementación

- **Stripe**: Payment Links / Checkout, facturas e indicadores de pago confirmados mediante webhooks. Revisar tarifas y disponibilidad por país.
  - https://docs.stripe.com/payment-links/api
  - https://docs.stripe.com/webhooks
- **Square**: Orders, Invoices y Customers; revisar plan, región y permisos.
  - https://developer.squareup.com/reference/square/invoices-api
  - https://developer.squareup.com/reference/square/orders-api
- **Integraciones opcionales**: Instagram Connect (mensajes autorizados), Smart Call (consulta tras llamada), Web Services (formularios web), AI Agents (asistente de cotización), CRM & Leads (estados).

## Reglas de seguridad y comerciales

- No adivinar precios, existencias, condiciones ni disponibilidad: si faltan datos, pedirlos o escalar a una persona.
- Toda factura/cotización debe identificar negocio, moneda, ítems, total, impuestos o cargos aplicables, vencimiento, condiciones de depósito y políticas configuradas por el vendedor.
- No iniciar transacciones, emitir facturas finales, ofrecer descuentos ni enviar recordatorios sin autorizaciones adecuadas.
- El usuario conecta su propio proveedor de cobro con OAuth o flujo oficial; VMV no recibe contraseñas ni almacena datos bancarios de clientes.
- Guardar credenciales cifradas en backend, validar firmas de webhooks, aplicar idempotencia y permisos multi-tenant.
- Cumplir consentimiento, privacidad, retención de datos y normas aplicables para mensajes comerciales, pagos, impuestos y contratos.
- Determinar modelo comercial de VMV y tarifas de pasarela solo después de comprobar precios reales e implicaciones legales.
- Evitar prometer conversión o incremento de ingresos garantizados.

## Qué queda fuera ahora

No hay backend, pantallas nuevas, motor de precios, IA de presupuestos, conexión Stripe/Square, nuevos permisos, tablas de base de datos, webhooks, notificaciones ni cambios en producción. **Únicamente una tarjeta "Smart Quote — Próximamente" y esta documentación.**

## Criterios futuros de aceptación

- Servicio de prueba autorizado y catálogo definido → datos reales del cliente → presupuesto correcto y trazable → revisión y autorización → envío → pago externo confirmado por webhook → registro en CRM.
- Si el precio es incierto, no se ofrece una cifra falsa.
- Si el cobro falla, no se marca como pagado.
- La desconexión del proveedor y la caducidad de tokens se manejan sin pérdida de seguridad.
- La tarjeta de Servicios se habilitará únicamente cuando el flujo cumpla pruebas de extremo a extremo.

## Contexto de producto

El propietario quiere reunir dos o tres servicios adicionales antes de entrar en fase de **pulido y lanzamiento de VMV**. Por eso Smart Quote se documenta ahora, pero no se activa.
