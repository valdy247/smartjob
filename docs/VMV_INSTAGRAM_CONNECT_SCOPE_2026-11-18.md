# VMV Business — Instagram Connect (alcance inicial)

Fecha: 2026-11-18
Estado: **Próximamente / documentación de producto**. La integración **NO** está implementada ni activada.
Ubicación de la tarjeta: **Servicios** (grupo Comunicación). Tarjeta visible y deshabilitada, sin conexión, formulario, cobro ni credenciales.
Repositorio y rama: `valdy247/smartjob` — `feat/vmv-smart-call-control-center`.
Responsables previstos: Servicios (catálogo e integración), Marketing (automatizaciones y medición), AI Agents (atención automatizada), con coordinación del Director VMV.

## Objetivo

Ofrecer a negocios pequeños una conexión segura de una **cuenta profesional de Instagram** con VMV Business para atender consultas, automatizar respuestas permitidas a comentarios, gestionar conversaciones e identificar oportunidades comerciales. El propietario mantiene el control de las conversaciones y permisos.

## Experiencia futura prevista (no disponible aún)

1. El negocio abre **Servicios → Instagram Connect** y escoge «Conectar Instagram».
2. VMV inicia el flujo oficial de autorización de Meta (OAuth/Instagram Login según la ruta API elegida), sin solicitar ni almacenar contraseñas de Instagram.
3. VMV muestra permisos requeridos, cuenta conectada, fecha de última sincronización, estado de conexión y opción de desconectar/revocar.
4. En la **bandeja de mensajes** el propietario ve las conversaciones que la API permite recuperar, responde manualmente, asigna un responsable y puede activar o pausar al agente IA.
5. **Comentarios inteligentes:** el propietario elige una publicación y configura palabras clave (p. ej. «PRECIO»), reglas de intención y respuesta privada inicial permitida por Meta. La persona debe interactuar/responder para continuar una conversación; no se promete mensajería ilimitada.
6. **AI Agents** recibe el contexto mínimo necesario del negocio para responder preguntas, solicitar datos, proponer una cotización o cita y transferir la conversación a una persona cuando haga falta.
7. **CRM y analítica:** registrar contactos/oportunidades con origen (Instagram, publicación y campaña cuando la API y permisos lo permitan), consentimiento y resultados verificables; no declarar una venta hasta que exista confirmación del sistema de pedidos/pagos.
8. En el futuro, una **bandeja unificada** podrá reunir Instagram, Facebook, WhatsApp y Web Chat con adaptadores independientes, sin prometer cobertura total ni el historial completo de cada canal.

## Alcance mínimo del primer desarrollo

- Conexión y desconexión seguras; estados reales de conexión y errores explicables.
- Webhooks y sincronización de conversaciones/mensajes dentro de los límites de la API.
- Bandeja de atención manual con historial disponible y estado de atención humana/IA.
- Automatización opt-in por publicación y palabra clave con protección contra duplicados, mensajes repetidos y bucles.
- Agente IA habilitado explícitamente por negocio y controles de escalado a humano.
- Registro básico de origen y resultados en CRM; indicadores sustentados en eventos reales.
- Idiomas español e inglés coherentes con preferencias de VMV.

## Límites, aprobación y seguridad

- Verificar en implementación las APIs oficiales vigentes de **Instagram Platform / Meta**, requisitos de cuenta profesional, permisos de mensajería, revisión avanzada de la aplicación y funcionamiento de Instagram Login / Facebook Login según corresponda.
- Los mensajes y respuestas privadas a comentarios se ajustarán a ventanas, requisitos de interacción y restricciones vigentes de Meta. No asumir que se pueden iniciar conversaciones arbitrarias ni acceder a todo el historial.
- Evitar scraping, contraseñas en VMV, promesas de acceso a cuentas personales, spam y mensajes masivos sin consentimiento.
- Tokens solo en backend, cifrados y con permisos mínimos; gestionar expiración, revocación, auditoría de acciones, seguridad por negocio (multi-tenant) y minimización/retención de datos.
- El agente no debe inventar precios, inventario o disponibilidad. Cotizaciones, reservas y pagos usarán datos autorizados y acciones verificables; operaciones sensibles requieren las aprobaciones apropiadas.
- Preparar revisión de privacidad, términos de Meta, borrado/desconexión de datos, límites de tasa y mecanismos de recuperación de webhooks.
- Evaluar costos de hosting, IA y mantenimiento; **Meta no ha sido configurado, aprobado ni probado en este proyecto**.

## Dependencias y pruebas futuras

- App de Meta configurada, política de privacidad y procedimientos de revisión; permisos disponibles y aprobados para cuentas externas.
- Backend para OAuth, webhooks y almacenamiento seguro; controles contra duplicados y entregas fuera de orden.
- Prueba con una cuenta profesional de prueba: conectar, recibir comentario, activar regla, gestionar mensaje privado, respuesta del cliente, transferencia al agente/humano, desconectar.
- Validar comportamiento con tasa limitada, mensajes fuera de ventana y permisos rechazados.
- Definir métricas del piloto: comentarios válidos, mensajes entregados, respuestas recibidas, contactos cualificados, citas/cotizaciones y ventas **confirmadas**.

## Exclusiones actuales

No implementar todavía OAuth, inbox, mensajería, automatización, agente, CRM, tablas, endpoints, cobros, roles, secretos de Meta ni despliegue a producción. **Solo tarjeta “Instagram Connect — Próximamente” en Servicios y este documento de alcance.**

## Referencias de estudio al iniciar implementación

- https://developers.facebook.com/docs/instagram-platform/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/private-replies/

Nota: enlaces de orientación para validación posterior; no implican que se haya obtenido aprobación ni integración.
