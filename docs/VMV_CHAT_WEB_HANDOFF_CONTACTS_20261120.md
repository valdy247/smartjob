# VMV Business · Chat web IA, contactos y atención humana
**2026-11-20 · Rama compartida:** `feat/vmv-smart-call-control-center`

## Experiencia del dueño

- La tarjeta **Chat web** mantiene sus cuatro secciones: Webs, Probar agente, Conversaciones, Ajustes.
- **Probar agente** en modo Chat web es una conversación limpia, blanca, a pantalla completa: flecha atrás, robot al centro, saludo personalizado (solo en UI) y caja de texto abajo. Historial y catálogo no se muestran en esa pantalla.
- El agente recibe una instrucción explícita de tratar al interlocutor como a cualquier cliente, sin saber que es el dueño. El dueño puede practicar preguntas reales de venta.
- Si el negocio autoriza ventas y selecciona un producto apto, y se expresa intención de compra, puede aparecer **Comprar en modo prueba**. Pasa por las RPC existentes de pedido/aceptación y Stripe Checkout **TEST** únicamente si el propietario tiene cuentas y permisos verificables. **Nunca hay checkout real ni cobros live desde esa prueba**.
- Los controles de **Amabilidad** y **Formalidad** van del 1 al 100 %, con deslizamiento paso a paso en incrementos del 1 %; cambios persistidos y verificados en Supabase, también aplicados al chat público.

## Captura voluntaria de contactos

- Si `lead_capture` está activado y el visitante expresa un interés comercial claro (por ejemplo solicitar cotización o comprar), el agente le puede invitar a guardar nombre y teléfono o email.
- El visitante decide y acepta por separado antes de enviar los datos. Se validan en servidor y se asocian a la sesión y al negocio correctos.
- Los leads están en `vmv_web_chat_leads` bajo RLS del dueño. Si incluye teléfono válido, se copia también a `smartjob_contacts` sin sobrescribir contactos ya existentes.
- Los leads con correo únicamente se muestran dentro de **Contactos Chat web** en el libro de contactos de VMV. No se inventa un teléfono.
- Los leads se eliminan con la sesión tras 29 días; los contactos copiados voluntariamente a `smartjob_contacts` se administran por separado y no se borran automáticamente: se informa en la política pública.

## Transferir a humano

- Un visitante puede solicitar **Hablar con una persona** o escribir una petición equivalente en el chat.
- Si la IA falla, no hay conectividad del modelo o reconoce que no puede responder y `human_handoff` está activado, el servidor cambia la sesión a **waiting** y crea un aviso propietario `vmv_web_chat_alerts` sin revelar datos de otros negocios.
- Los siguientes mensajes del visitante se almacenan sin llamar al modelo mientras espera o está en atención humana.
- En **Chat web → Conversaciones → Chat IA**, el dueño abre la sesión, lee el historial, escribe una respuesta humana real y puede pulsar **Finalizar atención humana** para devolverla al agente.
- En sitios públicos la interfaz consulta cada 2,5 s mientras está abierta. En la bandeja autenticada se usan eventos de Supabase Realtime y un respaldo de consulta cada 4 s. No son WebSockets directos entre visitante y dueño, sino sincronización casi instantánea.
- El aviso se puede ver en cualquier pantalla de VMV Business cuando la aplicación está abierta, con botón **Atender ahora** que dirige a la conversación. El dueño puede solicitar permiso de notificaciones del navegador desde Ajustes.
- **No hay notificación push garantizada con la app totalmente cerrada**. Para esa capacidad faltan tokens APNs/Expo o Web Push, permisos y verificación en dispositivos reales.

## Seguridad y pruebas

- Nuevas rutas server-only: `/api/vmv/public-chat/action` y `/api/vmv/web-chat-owner`, más autenticación de cookie firmada en `lib/vmv-web-chat-session.ts`.
- Migraciones aplicadas: `supabase/sql/vmv_chat_web_handoff_leads_20261120.sql` y corrección `supabase/sql/vmv_web_chat_lead_validation_fix_20261120.sql`.
- Consentimiento explícito; HMAC por visitante y web; validación de origen y usuario; RLS, cuotas diarias, registro de alertas y mensajes con roles `user`, `assistant`, `human`.
- Test SQL con `BEGIN ... ROLLBACK`: correo solo, teléfono normalizado, inserción en contactos, generación de alertas, mensajes humanos, permisos del propietario. Sin persistir fixtures.
- `npm run chat-handoff:test` verifica pantallas, rutas de seguridad y contrato de datos, integrado al build de Vercel.
- No se ha activado automáticamente ninguna web del dueño. Requiere un agente principal activo, configuración guardada y activación manual.

## Pasos de aceptación

1. Abrir AI Agents → Chat web → Ajustes. Deslizar porcentaje, guardar, autorizar avisos.
2. Probar agente: verificar el robot, saludo, respuestas como cliente y campo inferior.
3. Activar un sitio desde Webs y, en el navegador visitante, abrir Chat IA y aceptar privacidad.
4. Preguntar por cotización, guardar nombre/email o teléfono si se ofrece la tarjeta; comprobar Contactos VMV.
5. Escribir **«quiero hablar con una persona»**, verificar el aviso VMV → Atender ahora.
6. Responder en Chat IA, comprobar llegada de respuesta al visitante en segundos y finalizar intervención.
7. Probar fallo de proveedor en entorno controlado y comprobar la misma derivación.
8. Si existe Stripe TEST verificado, solicitar comprar un único producto autorizado para probar la experiencia de compra sin dinero real.

Aún falta una prueba E2E navegador-navegador con una web que el dueño active y, para alertas de fondo en iPhone, integración de push real.
