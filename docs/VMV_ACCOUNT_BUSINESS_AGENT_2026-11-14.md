# Cuenta: Mi negocio / Mi agente — 2026-11-14

Valdy pidió mostrar y poder completar/editar su negocio y su agente desde la pantalla Cuenta.

- `app/vista-app/AccountBusinessAgent.tsx` añade tarjetas bajo el perfil personal y antes del saldo/plan. Usa el negocio central y el agente principal confirmados; no supone que un agente activo esté atendiendo llamadas.
- Con varios negocios, el selector limita la tarjeta de agente al espacio vinculado al negocio elegido. No se fusionan identidades antiguas ni se elige un principal silenciosamente.
- Reutiliza `BusinessProfileDialog` para crear/editar el negocio en la misma pantalla, y `AgentSetupWizard` para configurar/editar el principal. Respeta el RPC de selección, RLS, pertenencia, revisiones y controles del modelo existente.
- Si hay agentes anteriores sin principal, presenta selección explícita. Si no hay negocio, la tarjeta del agente abre primero la configuración del negocio.
- Guardar identidad no modifica la selección telefónica ni activa canales o cobros.
- Cargas paralelas con errores independientes para perfil/agente y descarte de respuestas obsoletas. Los editores se cargan bajo demanda.
- Textos nuevos ES/EN; los editores conservan sus traducciones existentes. La tarjeta no equivale a haber completado toda la internacionalización del módulo.

Validación: build completo, TypeScript y pruebas de perfil central/contexto de agentes. Pendiente: recorrido visual autenticado, guardar/reabrir con un usuario real y prueba física de iPhone. Este cambio pertenece a `/vista-app` web; no modifica el binario nativo.

Conservar la corrección UX concurrente que retiró el selector de idioma repetido y los cambios recientes del asistente de identidad única.

Se conservó la corrección concurrente del chat de agentes para admitir callbacks de guardado síncronos o asíncronos en «Guardar borrador».
