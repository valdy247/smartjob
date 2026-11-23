# VMV Business — AI Agents × Perfil central de Marketing

**Responsable:** AI Agents. **Rama única:** `feat/vmv-smart-call-control-center`.
**No cambia:** Smart Call, traductor, webhook de Twilio, Marketing, Web Services ni facturación.

## Contrato y fuente de verdad

- `vmv_marketing_businesses.id` es el identificador **central del negocio**, bajo `owner_id` de la cuenta autenticada. Marketing mantiene nombre, categoría, descripción, datos públicos, sitio y horarios. NO se escribe otra copia del perfil desde AI Agents.
- `vmv_ai_businesses.id` permanece como **workspace técnico de compatibilidad** para las claves foráneas de agentes, llamadas, inventario, pedidos y citas. Se añade `central_business_id` con clave foránea compuesta `(owner_id,central_business_id)` al negocio central. Una relación no puede saltar entre dueños.
- La antigua unicidad por propietario en los workspaces técnicos se reemplazó por unicidad de propietario + negocio central. Los workspaces anteriores siguen sin vínculo hasta aprobación del dueño. **No se hizo reasignación ni migración de datos de llamadas.**
- Las RPC `vmv_ai_workspace_for_central_business` y `vmv_ai_link_existing_workspace` usan la identidad `auth.uid()`, requieren el mismo dueño, son idempotentes y protegen el vínculo frente a cambios silenciosos.
- El chat y la telefonía se asocian al negocio por `vmv_ai_agents.business_id` → `vmv_ai_businesses.central_business_id`. Los historiales conservan `agent_revision` y cada inicio de llamada ligada copia el contexto público y `central_profile_version` a `vmv_ai_voice_calls.agent_snapshot` para diagnóstico.

## Experiencia implementada

Web móvil (`/vista-app/ai-agents`) e iPhone nativo:
1. Se consulta la lista central **dentro de la misma cuenta**. Un negocio se selecciona automáticamente; varios requieren una selección explícita.
2. Los agentes, los pedidos de prueba, el catálogo y las solicitudes de atención se muestran **solo** para el workspace elegido. Cambiar de pantalla o de negocio no reasigna la línea.
3. Un agente nuevo solo puede guardarse con un workspace ligado a un negocio central. La edición de agentes del piloto anterior sigue posible sin migrarlos ni romper sus llamadas.
4. Si el dueño tiene un workspace antiguo sin vínculo, puede vincularlo a un negocio central que también sea suyo mediante una confirmación explícita. La acción no modifica el número ni Twilio.
5. Si no existe negocio central, la web enlaza a Marketing para crearlo; en iPhone se indica regresar a VMV y usar Marketing.
6. El wizard precarga datos públicos ya registrados, oculta las preguntas repetidas y mantiene en el propio agente solo misión, instrucciones, permisos, voz y políticas específicas. No sobrescribe el borrador cuando llega una lectura asíncrona.
7. Cuando cambia `vmv_marketing_businesses.updated_at`, la interfaz advierte que el agente necesita revisión. La activación desde estudio exige guardar de nuevo el agente revisado.
8. Las llamadas telefónicas ligadas a un negocio central usan el nombre comercial y los horarios públicos **actuales**, con snapshot por llamada y reglas de atención independientes de traducción.

## Privacidad

Solo se leen campos de presentación de negocio: nombre, categoría, descripción comercial, país, ciudad, región, zonas de servicio, URL pública, URL de reservas y horarios. Los SELECTs y snapshots **no incorporan** calle, unidad residencial, código postal, razón social, email administrativo, notas internas, documentos ni teléfonos personales. Un número solo puede divulgarse mediante una autorización específica del negocio, no por estar guardado en Marketing.

`central_business_id` se verifica siempre con `owner_id`, mediante FK compuesta y políticas RLS existentes. Las RPC de provisión se ejecutan como el usuario invocador (no con privilegios de servicio).

## Verificación

- Migración central ejecutada en Supabase: **SUCCESS**, sin cambios de ID en el piloto.
- Prueba transaccional con rollback: crear workspace central, reintentar sin duplicar, negar que el propietario de un piloto enlace un negocio de otra cuenta y conservar intacto el piloto: **PASS**.
- Cuatro pruebas automatizadas en `tests/vmv-ai-central-business-context.test.mjs`: exclusión de campos privados; lunes→domingo; rechazo de horarios inválidos; piloto no vinculado conserva snapshot: **4/4 PASS**.
- TypeScript de iPhone nativo: **PASS** en entorno Expo hasta el commit `6c163b6b9c9243b0d5be7e8b6a3b2c33776e3751`. Posteriormente hubo cambios menores en UI que necesitan nueva ejecución.
- Los despliegues de Next.js de la rama han alcanzado `READY` durante esta implementación. Verificar HEAD y último READY antes de informar al propietario; no asumir que coincide si otros módulos comiten al mismo tiempo.
- **No** se hizo una nueva llamada real ni una prueba con sesiones autenticadas de múltiples cuentas en el navegador. No se han cobrado clientes, enviado comunicaciones ni alterado el webhook.

## Bloqueos / trabajos pendientes de coordinación

1. **Cuentas distintas en el piloto:** el único negocio central disponible en la base de datos y el workspace telefónico con dos agentes **pertenecen actualmente a distintos `owner_id`**. No hay consentimiento ni autorización para unirlos. El propietario debe acceder a la misma cuenta VMV en Marketing y AI Agents, o crear su perfil central dentro de la cuenta que posee la línea. Solo después podrá confirmar el vínculo del piloto y probar por teléfono con datos centrales.
2. **Límites:** Marketing ya tiene el trigger servidor `vmv_private.marketing_business_capacity_guard`, que permite el primer negocio y **niega otros** con `additional_businesses_pending_plan_definition`. Conservarlo. El catálogo actual de facturación solo define minutos/voz, **no una política publicada de límites por agente**. Director debe definir la cuota por plan y su enforcement transaccional antes de ofrecer varios agentes en producción; no inventar cantidades ni precios. Las rutas AI siguen en piloto Preview.
3. **Web Services:** necesita asociar cada sitio/dominio al `vmv_marketing_businesses.id`, con comprobación de propietario, y conectar un agente de chat únicamente si `configuration.channel` y su estado lo permiten. No existe todavía un motor público de chat final; no exponer instrucciones de agente, tokens o datos privados. Usar el catálogo comercial autorizado existente en vez de fichas de marketing como precios de checkout.
4. **Inventario/agenda:** mantener `vmv_ai_catalog_items` y `vmv_ai_booking_services/slots` como fuentes transaccionales existentes mientras Director consolida las entidades compartidas. Las fichas visuales `smartjob_web_intake_products` son solo borradores de marketing; todavía carecen de `central_business_id`.
5. **Telefonía:** piloto vinculado a un solo propietario autorizado y un número. Falta validar llamada real después de vincular perfil, controles de varias líneas, saldo, transferencia humana y continuidad de traducción bajo la nueva configuración. No cambiar webhooks sin prueba aprobada.
6. **Cobros:** no hay cuenta comercial Stripe Connect verificada para el negocio; pedidos de prueba siguen sin pago real. Los límites de agentes, consumo y pagos LIVE no están listos para lanzamiento.
7. **Internacionalización:** varias etiquetas de AI Agents aún son literales en español; migrar a los mensajes existentes ES/EN antes del lanzamiento.
8. **Nativo:** falta una compilación iOS firmada/TestFlight; en intentos anteriores Expo negó el acceso a la firma Apple. No afirmar que el cambio ya está instalado.

## Prueba manual siguiente (cuando se use la MISMA cuenta)

Abrir VMV → Marketing, comprobar que el negocio central pertenece a esa cuenta. Entrar en AI Agents; seleccionar el negocio y revisar las fichas públicas precargadas. Si el antiguo agente aparece «Sin vincular», elegir el negocio y confirmar «Vincular agentes existentes». Abrir y guardar su configuración, comprobar su línea, llamar desde otro teléfono al piloto y verificar en Supabase que responde el agente elegido y que el snapshot lleva el negocio correcto. No realizar ventas cobradas durante la prueba.

Este documento es un handoff para que Valdy lo comparta con el Director; **no se ha enviado automáticamente a otro chat**.
