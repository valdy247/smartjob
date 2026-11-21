# AI Agents · Un agente principal por negocio (2026-11-14)

**Decisión de Valdy:** llamadas, chat, catálogo e inventario, ventas, reservas y actividad son capacidades de la misma identidad de agente. La interfaz no crea un asistente nuevo al tocar Inventario/Ventas/Reservas/Llamadas.

**Rama de trabajo:** `feat/vmv-smart-call-control-center`.
**El director conserva** su `BusinessProfileDialog` dentro del módulo y el contrato `vmv_marketing_businesses`. No se cambian las rutas de Twilio/Smart Call, la traducción, la facturación ni producción.

## Identidad y migración conservadora

- `vmv_ai_businesses` sigue siendo el workspace técnico de agentes y operaciones; `central_business_id` continúa enlazando el negocio central de Marketing para el mismo `owner_id`.
- Se añadió `primary_agent_id` nullable para identificar **exactamente una** identidad principal por workspace, sin borrar `vmv_ai_agents`, combinar identidades ni modificar `vmv_ai_phone_selections`.
- `vmv_ai_select_primary_agent(workspaceId, agentId, expectedId)` es RPC `SECURITY INVOKER`, requiere autenticación, propiedad, workspace central y coincidencia optimista de la selección anterior. Un trigger valida también las actualizaciones directas de `primary_agent_id` contra la pertenencia del agente.
- Al abrir un negocio con **un agente existente**, la interfaz propone usarlo como principal; si hay **varios**, pide una elección explícita. Se prioriza el asignado al teléfono como candidato cuando pertenece al negocio seleccionado, pero **no se modifica el número ni se le otorgan permisos por elegirlo**.
- Un nuevo agente se guarda como borrador en el mismo workspace y se establece como principal si nadie lo eligió antes. Si hubo una selección concurrente no se sobrescribe.
- Los agentes antiguos, conversaciones, llamadas, pedidos y citas se conservan en sus identidades originales; no hay consolidación automática de historiales ni permisos.

## Web e iPhone

- Un solo panel `Tu agente: [nombre]` y `Negocio: [selección]` con tarjetas de **Identidad**, **Llamadas**, **Chat web**, **Ventas**, **Catálogo e inventario**, **Reservas** y **Actividad**.
- Las tarjetas abren el servicio o estudio existente sobre la identidad principal. Inventario va al catálogo; Ventas va a los permisos y pedidos; Reservas va a la agenda; Actividad al historial/calidad; Chat usa una **simulación privada**, no un chat público publicado.
- Se eliminaron entradas duplicadas que permitían eludir este recorrido. El panel conserva acceso a agentes heredados y a la asignación telefónica explícita, restringida en la nueva UI al principal para negocios ya vinculados.
- El wizard configura identidad, idioma conversacional, personalidad y extensión de respuesta, y permite un borrador sin terminar. Elige entre voz Twilio predeterminada y presets seguros `female/male` que se convierten mediante whitelist servidor a Polly (es-US/en-US); una voz no activa llamadas ni compras.
- Personalidad y estilo influyen en las instrucciones reales del simulador y en las respuestas informativas telefónicas. Para llamadas nuevas la voz se toma de `agent_snapshot` por conversación; los agentes anteriores que no eligieron preset mantienen la voz previa.
- Las tarjetas usan estados prudentes: **Sin configurar**, **Requiere atención** o **Lista para probar**; no declaran canal público ni cobros LIVE cuando faltan.
- Las capacidades comerciales mantienen sus autorizaciones originales. Seleccionar un agente principal **no autoriza** cambios de precio, descuentos, inventario, pagos ni reservas.

## Evidencia y pruebas

- Migración aplicada con éxito a Supabase `wrnlhjujsbigculndivs`.
- SQL `supabase/tests/vmv_ai_one_principal_agent_regression.sql`: **PASS** bajo transacción `BEGIN … ROLLBACK`. Comprobó selección legítima, rechazo de elección obsoleta, rechazo de agente de otro workspace, rechazo de actualización directa indebida y denegación de otra cuenta.
- Lectura posterior: **2 agentes existentes, 3 llamadas históricas y 0 agentes principales asignados automáticamente**, sin alterar el piloto.
- Next.js Preview de la rama ha alcanzado `READY` después de los cambios de UI y backend (consultar el HEAD concreto antes de entregar). Esto valida compilación web, **no** funciones telefónicas reales.
- **No** se ejecutó una llamada física nueva, un pago, reserva, compra, actualización de inventario LIVE ni compilación firmada de iPhone. El Expo TypeScript tras los últimos cambios sigue pendiente de comprobación específica.
- GitHub Actions de la rama registra fallos de flujos que incluyen traducciones compartidas; distinguir la causa real y actualizar antes del lanzamiento.

## Bloqueos y continuación

1. El negocio central de Marketing y el workspace que actualmente posee la línea telefónica pertenecen a **cuentas distintas**. No cruzar propietarios. El usuario debe crear o abrir el negocio bajo la cuenta que posee la línea o confirmar una vinculación legítima en la misma cuenta.
2. Validar sobre sesiones autenticadas web/iPhone que al recargar el negocio mantiene el principal, las capacidades no crean agentes adicionales y editar personalidad no toca catálogo ni agenda.
3. En Inventario, guardar un producto aprobado de ese negocio; verificar consulta posterior desde la fuente autorizada, sin usar como precio final una tarjeta de marketing.
4. Tras elegir explícitamente el mismo principal para la línea, probar **llamada entrante real**, voz/idioma/persona, una operación permitida y registro de resultado y consumo. Mantener el fallback/rollback exacto de Twilio.
5. Para Chat web público falta la integración del agente al sitio y validaciones de permisos; para pagos LIVE falta cuenta comercial verificada. Los límites por plan y acciones avanzadas dependen de Director.
6. Probar TypeScript y experiencia en iPhone; no confundir Next.js READY con un binario TestFlight firmado.

## Criterio de cierre

No declarar producto terminado hasta demostrar: **elegir negocio → un solo agente → inventario real → llamada al mismo agente → acción autorizada → resultado, historial y consumo correctos**, sin mezclar otros negocios.
