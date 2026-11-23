# VMV Business · Chat web control center (2026-11-20)

## Resumen

La tarjeta **Chat web** en AI Agents abre un centro limpio de cuatro áreas, manteniendo el agente principal ya existente por negocio:

1. **Webs**: lista páginas publicadas por la cuenta del negocio y ofrece **Vincular** / **Quitar** para asociaciones guardadas entre el agente principal y una web del mismo negocio. La desvinculación elimina el vínculo en Supabase. **El chat público aún no funciona** y la base de datos prohíbe activarlo en esta fase. Las consultas existentes siguen entrando como formularios de contacto.
2. **Probar agente**: reutiliza `AgentLiveTest`, las conversaciones privadas y el endpoint autenticado `simulate`, ahora con `webPreview` para que aplique preferencias de Chat web. No crea pedidos, reservas ni cobros.
3. **Conversaciones**: separa *Web* (solicitudes reales de `smartjob_web_inquiries` del sitio publicado) y *Pruebas* (conversaciones de `vmv_ai_conversations` y mensajes de `vmv_ai_messages`). No afirma que solicitudes web sean chats de IA.
4. **Ajustes**: amabilidad 1–5, formalidad 1–5, longitud, idioma, solicitar contactos opcionales, escalación humana y catálogo. "Ofrecer productos" solo se permite con `cap_catalog="Sí"` y al menos un producto **activo, aprobado, precio positivo, con existencias verificadas o ilimitadas**. El usuario selecciona los productos admitidos; la simulación revalida permisos, existencias y apartados. Ofrecer no significa cobrar.

## Datos y límites

- Migración aplicada: `supabase/sql/vmv_web_chat_control_center_20261120.sql`.
- RLS owner+agent+business en `vmv_web_chat_settings` y `vmv_web_chat_site_links`. Trigger comprueba correspondencia de sitio publicado, propietario, empresa y agente.
- `public_chat_enabled` es siempre `false` por `CHECK` — no activar el chat del visitante a través de una preferencia client-side.
- No se copian historiales ni productos a tablas paralelas.
- El modelo de simulación utiliza los ajustes específicos de Chat web únicamente con `webPreview=true`.
- Los cambios del módulo no afectan Twilio, Smart Call, la facturación ni la configuración principal del agente para otros canales.
- El modo de catálogo sigue siendo lectura y propuesta. Futuro checkout web necesita consentimiento, pagos, validaciones server-side, inventario transaccional y cumplimiento.
- Las páginas web ajenas a VMV no se consideran conectadas. Para incorporar webs externas haría falta un widget/embed validado y controles de origen.
- Si no se encuentra una web publicada cuyo nombre de negocio corresponda al negocio actual, se muestra el estado vacío. No se conectan webs cruzadas.
- No habilitar respuestas web públicas ni anunciar conversaciones IA con visitantes hasta construir la API pública con autenticación de sitios, antispam, límite de créditos, consentimiento, retención, escalación y auditoría.

## QA

- `npm run chat-web:test` incluido en `npm run build` en Vercel.
- Test SQL con `ROLLBACK`: guardar amabilidad/formalidad; rechazo de ventas sin productos; asociación de sitio, desvinculación, aislamiento entre propietarios y bloqueo de `public_chat_enabled=true`.
- Pendiente: prueba de navegador con la sesión real, confirmar producto disponible aprobado y comprobar reflejo del tono en una simulación.
