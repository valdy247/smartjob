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
