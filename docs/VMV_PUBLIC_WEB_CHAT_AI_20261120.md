# VMV Business · Chat web público con IA · v1

Fecha: 20 de noviembre de 2026. Rama compartida: `feat/vmv-smart-call-control-center`.

## Implementado

- **Chat web → Webs**: sitios clásicos (`/sites/[slug]`) y nuevos sitios Web Studio (`/web/[slug]`) pertenecientes al mismo propietario y negocio. Preparar asociación, activar chat real por sitio, pausar o desvincular. No se enciende ningún sitio automáticamente.
- **Chat web → Ajustes**: amabilidad, formalidad, extensión, idioma, ventas autorizadas, contacto opcional y derivación. El visitante conversa con el **agente principal activo** y con fuentes públicas/propietario autorizadas.
- **Chat web → Conversaciones**: pestañas separadas **Chat IA**, **Solicitudes** y **Pruebas**. Las conversaciones de visitantes son registros propios, accesibles solo a la cuenta del negocio.
- Widget con mensajes en burbujas, aceptación expresa de privacidad, cookie HttpOnly firmada, recuperación de sesión en el mismo navegador y botón **Hablar con una persona** que abre el formulario ya existente.
- Server API `app/api/vmv/public-chat/route.ts`: autenticación de sitio/negocio/agente via service role, verificación de agente activo y principal, estado de sitio, origen same-site, control de longitud/honeypot, contexto central público y catálogo aprobado, respuesta IA con `askAiAgent`; no puede cobrar, reservar ni ejecutar órdenes.
- Supabase `vmv_web_public_chat_sessions`, `vmv_web_public_chat_messages`, `vmv_web_public_chat_usage`; propietario solo lee sus chats via RLS. La clave service role nunca se entrega al navegador. Sesiones de visitante se identifican mediante HMAC, no IP explícita.
- Cuotas atómicas SQL: **máx. 140 mensajes por propietario, 80 por sitio, 16 por IP por día, 12 por sesión por 24 horas**; se reserva antes de usar IA y bloquea consultas simultáneas de la misma sesión.
- Borrado automático diario de sesiones con antigüedad mayor a 29 días y métricas de cuota antiguas con pg_cron; aviso público `/web-chat-privacy` con exención de proxy en dominios personalizados.
- Los formularios de contacto siguen funcionando; los sitios sin vínculo activo **no** llaman al modelo.

## Activación del primer sitio (obligatoriamente manual)

1. En AI Agents elige el negocio y verifica que su **agente principal** esté aprobado y **Activo**. La función se niega a activar un agente en borrador o pausado.
2. Abre la tarjeta **Chat web** → **Ajustes**; establece tono/idioma y pulsa **Guardar ajustes**.
3. Abre **Webs**. Aparecerán los sitios publicados de **ese mismo negocio**. Pulsa **Vincular** y después **Activar IA**. El propietario debe confirmar el aviso; habilitar un sitio puede consumir cuota del proveedor.
4. Abre la web publicada, toca **Chat IA**, acepta la privacidad y envía una pregunta. En **Chat web → Conversaciones → Chat IA** debe aparecer la sesión con sus mensajes y respuesta.
5. Verifica **Pausar**: bloquea nuevas consultas al agente sin destruir el sitio ni su formulario de contacto.

**Estado actual de los datos de la cuenta (sin modificar)**: las webs publicadas tenían agentes principales vinculados, pero esos agentes no estaban en estado *active* al efectuar la comprobación. Por eso no se habilitó ningún chat automáticamente. El propietario deberá activar el agente principal con la verificación de calidad existente.

## Probado

- Migraciones `supabase/sql/vmv_public_web_chat_runtime_20261120.sql` y `supabase/sql/vmv_public_web_chat_owner_toggle_20261120.sql` aplicadas al proyecto compartido.
- Con transacción SQL y `ROLLBACK`: rechazo sin activar, activación tras pasar el agente a activo dentro de la transacción, creación de sesión y mensaje, bloqueo de segunda solicitud mientras responde, respuesta guardada, pausa y rechazo posterior. No persistió nada de QA.
- Cron de retención habilitado.
- `npm run public-web-chat:test` integrado en `npm run build`.
- Aún hace falta **prueba de navegador con un sitio activado por su dueño y una llamada real de modelo**, para certificar el flujo completamente.

## Límites y seguridad

- La función pública solo existe en páginas **publicadas** que pertenecen al negocio del propietario. No soporta un widget embebido en dominios externos no verificados.
- Las recomendaciones comerciales están limitadas a productos verificados y seleccionados cuando el dueño permitió ventas. Sin inventario comprobado, no promete existencias.
- Conversaciones **no** equivalen a reservas, pedidos, facturas ni pagos. La derivación humana utiliza el formulario de contacto, no una respuesta síncrona de una persona.
- Respuestas se generan por solicitud/respuesta HTTP. No hay streaming de tokens ni WebSockets; “conversación en vivo” significa respuestas de IA en el widget del visitante.
- La cuota fija es una primera barrera antiabuso. Antes de hacer un lanzamiento público masivo conviene incorporar WAF/captcha adaptable, monitorización de costos por cuenta, auditoría de contenido y protección adicional contra bots.
