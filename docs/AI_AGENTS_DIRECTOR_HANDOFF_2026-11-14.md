# Director → nuevo chat AI Agents — 2026-11-14

## Problema comunicado por Valdy

En `/vista-app/ai-agents`, un negocio antiguo sin vínculo central dejaba las tarjetas de creación deshabilitadas. «Crear tu negocio» y «Revisar negocio» sacaban al usuario a Marketing en vez de permitir resolver el requisito dentro del servicio.

## Corrección de este relevo

- `BusinessProfileDialog.tsx`: formulario modal dentro de AI Agents, reutilizando `CentralBusinessEditor`, la tabla central `vmv_marketing_businesses`, su validación y payload existentes. No se crea una entidad de negocio paralela.
- Crear o editar negocio permanece en la misma pantalla. La edición carga los datos completos solo para el propietario autenticado y utiliza `updated_at` para detectar cambios concurrentes.
- Las tarjetas de funciones ya no quedan inertes. Sin negocio central, abren la configuración y recuerdan la función elegida; tras guardar correctamente, continúan hacia ese agente.
- El diálogo ofrece vincular un espacio antiguo mediante una casilla explícita, usando el RPC existente `vmv_ai_link_existing_workspace`. No cambia la selección telefónica ni reasigna líneas.
- El enlace del asistente «Revisar negocio» también abre el modal y mantiene montado el asistente para no perder sus respuestas.
- Los recuentos se describen como agentes disponibles/configurados, sin afirmar que estén atendiendo llamadas reales.
- El nuevo modal tiene textos ES/EN y conserva el estilo violeta y las tarjetas existentes. El resto del módulo conserva su deuda previa de internacionalización.

## Límites y cuidado al continuar

- Este cambio corresponde a la **web** mostrada en la captura. No equivale a una corrección publicada en un binario de iPhone.
- El editor compartido se reutiliza sin carga de imágenes en este modal. No se reemplazan ni eliminan las referencias a fotos ya guardadas.
- No eliminar la autorización del propietario, los controles RLS ni la validación de plan para resolver bloqueos visuales.
- No cambiar el backend de llamadas o traducción por este arreglo.
- Comprobar con sesión real: negocio antiguo → configurar → consentimiento de vínculo → mismos agentes visibles; tarjeta sin negocio → guardar → función elegida; editar desde el asistente → conservar borrador.
- No se declara una llamada real, cobro o activación telefónica comprobada como parte de este arreglo.

Consultar el commit que incorpora este archivo, su diff y el preview correspondiente antes de continuar. Conservar estos cambios y comprobar el HEAD de la rama compartida `feat/vmv-smart-call-control-center`.

## Actualización del Director: perfil, inventario y muestras de voz

- El editor y Cuenta ahora aplican `centralPrefill` también al reabrir un agente existente. Los datos centrales actuales sustituyen la copia antigua, incluidas ubicación, horario y teléfono comercial. No se copian calle privada, email personal ni notas administrativas.
- Con negocio central se omite «Conoce tu negocio». Se conservan las políticas específicas del agente dentro de supervisión. «Editar/Completar negocio» abre el editor compartido y conserva el borrador del agente.
- `AgentConnections` abre el catálogo existente mediante `CommerceStudio catalogOnly`; se reutilizan `vmv_ai_catalog_items`, los controles de propietario y el espacio central. No se crea otro agente ni otro inventario. Guardar productos es inmediato; el permiso `cap_catalog` se guarda al finalizar el agente.
- `cap_catalog` habilita consultas de solo lectura del catálogo aprobado en el simulador y en telefonía. Existencias descontadas de apartados vienen del snapshot canónico. No concede permisos de pedidos, pagos o modificaciones de stock. No afirmar que un calendario externo esté conectado: reservas conserva sus permisos y exige servicios/horarios reales.
- `VoiceSample` permite escuchar muestras oficiales Amazon Polly estándar: Lupe/Miguel (es-US), Joanna/Matthew (en-US), con selector ES/EN para bilingüe. `voice-options.ts` comparte los identificadores con el runtime telefónico. Reproducir la muestra no llama a nadie. La voz predeterminada de la cuenta Twilio puede cambiar fuera de VMV; no se ofrece una muestra falsa para ella.
- Pruebas: `node --test scripts/agent-profile-connections.test.cjs scripts/agent-capability-access.test.cjs scripts/central-business.test.cjs`; build completo sin prebuild de sincronización externa (`npm --ignore-scripts run build`). Las cuatro muestras devolvieron HTTP 200 y audio/mpeg.
- Falta comprobación de extremo a extremo dentro de la sesión real del propietario y en llamada real; este cambio no activa números, cobra pagos ni publica chat externo. La aplicación iOS nativa no se actualiza con este preview web.
