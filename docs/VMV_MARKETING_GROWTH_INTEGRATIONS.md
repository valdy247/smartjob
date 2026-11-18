# VMV Business — Marketing: integraciones y crecimiento verificable

Estado: diseño técnico y primera beta, 11 noviembre 2026. Equipo responsable: Marketing.
Rama de integración: `feat/vmv-smart-call-control-center`. No implica publicación a producción.

## Objetivo de producto
No vender una biblioteca de textos: ayudar a un negocio a ganar visibilidad, recibir consultas atribuibles, convertirlas en ventas y retener clientes. Mostrar cifras observadas, no inventadas.

## Implementado en esta beta
- **Industria controlada:** IDs estandarizados por sector, con "Otro" y "No estoy seguro"; evita categorías arbitrarias.
- **Diagnóstico inclusivo:** ticket y margen son opcionales. Calculadoras asistidas si dispone de ingresos/pedidos y precio/coste directo; sin completar, los KPI dependientes quedan como desconocidos.
- **Presencia local:** una ficha de datos empresariales compartida con el diagnóstico; copiar y abrir los portales oficiales de Google, Bing, Apple y Yelp; permite indicar dirección privada o negocio de área de servicio.
- **Estado de directorios:** manual, solo sesión, explícitamente no comprobado. Nunca afirmar que un perfil está publicado sin confirmación del proveedor.
- **Auditoría web:** endpoint `GET /api/marketing/site-audit?url=https://...` consume PageSpeed Insights para rendimiento móvil, SEO y accesibilidad; sin token obligatorio y con control de tiempo de espera. Resultados técnicos y recomendaciones, no atribución de ventas.

## APIs y permisos (revisión documental noviembre 2026)
| API / plataforma | Coste de API | Acceso real | Plan / propietario |
|---|---|---|---|
| PageSpeed Insights | Uso público sin clave para bajo volumen, cuotas | Endpoint REST público; clave de API opcional | Marketing — primera integración |
| Google Search Console | Gratis con cuotas | OAuth del propietario / web verificada | Marketing + Web Services: impresiones, clics, consultas, páginas |
| Google Analytics Data | Cuotas de API estándar | OAuth y propiedad GA4 | Marketing: eventos de conversiones reales |
| Google Business Profile | Sin tarifa para usuarios aprobados | Aprobación de Google; OAuth y perfiles autorizados | **Web Services** administra; Marketing consume datos y acciones delegadas |
| Bing Places | Portal gratuito | Reclamar/verificar o importar ficha de Google desde su portal | Marketing: flujo asistido, sin prometer API pública de publicación |
| Apple Business Connect | Portal gratuito | APIs avanzadas mediante socios autorizados | Marketing: flujo asistido |
| Yelp Fusion | API pública para búsqueda/consulta con credenciales | Las operaciones de publicación/gestión requieren partner | Marketing: solo lectura si se autoriza; flujo asistido de registro |
| LocalBusiness JSON-LD | Gratuito (estándar web) | Publicar en la web del negocio | **Web Services** implementa, Marketing valida consistencia NAP |

Fuentes: 
- https://developers.google.com/speed/docs/insights/v5/get-started
- https://developers.google.com/webmaster-tools/pricing
- https://developers.google.com/my-business/content/faq
- https://developers.google.com/my-business/content/pricing
- https://developers.google.com/search/docs/appearance/structured-data/local-business
- https://www.bing.com/forbusiness/help/modernExperience?setlang=en
- https://businessconnect.apple.com/es-es/support/
- https://docs.developer.yelp.com/docs/yelp-partner-apis

## Prioridad de evolución

### 1. Datos fiables + métricas
Un perfil empresarial por ubicación y propietario, guardado tras autenticación y con permisos multi-tenant. Consentimiento explícito para cada conexión. Crear un catálogo de fuente, fecha de verificación, coincidencia de nombre/dirección/teléfono (NAP), `connected | pending | manually_verified | rejected`.

### 2. Descubrimiento local
Verificación de existencia y duplicados antes de reclamar perfiles. Directorios relevantes por sector y país, no cientos de directorios de baja calidad. Guiar la reclamación, ofrecer fichas precargadas, registrar resultados verificables. GBP bajo Web Services.

### 3. Search Console + medición
OAuth leído por Web Services/servicio de auth; Marketing obtiene consultas que ya traen impresiones y pocos clics, páginas con baja conversión, evolución mensual y alertas. Análisis de costes/consultas basados en fuentes autorizadas. UTM por campaña.

### 4. Captación y seguimiento
Integración con CRM & Leads: formulario, llamada, cita, pedido, reserva y fuente. Capturar tasa de respuesta, tiempo hasta contacto, conversión, CAC, valor de vida y margen de contribución; sin spam ni envíos por defecto. AI Agents puede ayudar a responder y recuperar leads **con consentimiento y límites**.

### 5. Experimentos con rentabilidad
Dos variantes de landing/oferta o creatividad; definir hipótesis, inversión y conversiones antes del lanzamiento. Recomendaciones basadas en resultados y límites de presupuesto. No publicar ni gastar sin autorización explícita.

## Decisión aprobada — Crear una campaña automático con IA (18 noviembre 2026)

**Decisión del Director:** la evolución definitiva de **Marketing → Crear una campaña** es un flujo **automático con IA**, no un servicio manual como destino final. **Meta Ads (Facebook/Instagram) primero; Google Ads en fase posterior.** El cliente debe revisar y autorizar expresamente el anuncio, destino, cuenta publicitaria y presupuesto antes de publicar o generar gasto. No se elimina el planificador de campañas actual: se reutiliza como la primera etapa del recorrido.

**Estado actual:** solo existe el planificador de contenido/estrategia, edición, copia/compartir y calculadora de resultados con datos introducidos manualmente. **No hay conexión OAuth con Meta/Google Ads ni capacidad de crear/publicar campañas, gastar dinero o leer métricas de anuncios desde esos proveedores.** Esta sección es **documentación de producto**, no una activación.

### Flujo futuro aprobado
1. **Conectar cuenta publicitaria** por OAuth oficial, con consentimiento por negocio, permisos mínimos, comprobación de titularidad, caducidad, revocación y desconexión.
2. **Preparar campaña con IA:** objetivo, producto/oferta, público, creatividad y mensaje, ubicaciones permitidas, destino (web/WhatsApp u otro), duración, límite total y presupuesto diario en moneda indicada. Validar políticas de publicidad y consentimiento del material; permitir revisión y edición.
3. **Cotizar por separado** (a) gasto publicitario de la cuenta del negocio y (b) comisión/suscripción de VMV, si procede. Nunca mezclar ambos conceptos ni inventar resultados esperados.
4. **Mostrar previsualización y aprobación explícita** del negocio sobre versión exacta de creatividades, audiencia, destino y presupuesto; registrar versión, usuario aprobador, alcance, fecha, cuenta y consentimiento.
5. **Crear primero el borrador en estado pausado**, vía API oficial y solo bajo la cuenta publicitaria autorizada. Confirmar los IDs reales devueltos, la revisión de plataforma y el estado.
6. **Publicar únicamente mediante acción autorizada**, comprobando aprobación vigente, límites de gasto, permisos y estados de revisión. No reactivar campañas automáticamente ni aumentar presupuestos sin una nueva autorización.
7. **Leer resultados reales de la API**, con fecha/fuente/atribución y aclaración de retrasos; permitir pausar y supervisar presupuesto, errores, rechazo de anuncio y métricas, con avisos basados en hechos verificables.
8. **Historial auditable** por negocio: aprobaciones, cambios, costes, operaciones, eventos del proveedor y reintentos idempotentes; aislamiento multi-tenant estricto.

### Secuencia de implementación y puertas de salida
- **Fase 0 — catálogo y planificador:** conservar el generador actual sin presentarlo como publicación automática. Probar edición/copia/compartir móvil.
- **Fase 1 — Meta en modo prueba:** requisitos de Meta Developers, permisos empresariales, OAuth, cuentas autorizadas y desarrollo de anuncios/borradores **pausados**. Validar en cuenta controlada, sin presupuesto activo.
- **Fase 2 — creación y publicación autorizadas:** confirmar aprobación humana, política de presupuestos, estados de revisión, webhook o reconciliación, operaciones de pausa y pruebas negativas antes de permitir anuncios activos.
- **Fase 3 — Google Ads:** OAuth, acceso del desarrollador/API y flujo equivalente de aprobación, borrador, publicación y métricas.
- **Fase 4 — cobro VMV:** precios, planes y facturación independientes del presupuesto publicitario, con controles de pago y requisitos fiscales revisados.

**No hacer en la fase actual:** no crear conexiones reales ni campañas; no activar pagos, anuncios, credenciales, automatismos o cambios de producción. No crear una tarjeta duplicada en Servicios; el alcance pertenece a Marketing → Campañas. Las cuentas publicitarias y la disponibilidad de funciones dependen de permisos y aprobación de cada proveedor.

Referencias técnicas iniciales que deben verificarse al implementar:
- Meta Marketing API: https://developers.facebook.com/docs/marketing-apis/
- Google Ads API: https://developers.google.com/google-ads/api/docs/start

## Reputation Booster — fase futura de «Mi reputación» (18 noviembre 2026)

**Decisión de producto:** integrar Reputation Booster como una ampliación de `Marketing → Mi reputación`; **no crear otra tarjeta** en el catálogo de Servicios. Ya existen respuestas a reseñas reales y generación manual de solicitudes con enlace. La automatización se deja en estado **Próximamente**, sin activar envíos.

**Flujo previsto:**
1. El negocio activa voluntariamente solicitudes de reseñas y configura el canal y el enlace de reseñas.
2. Tras una compra, servicio o cita **realmente confirmados**, VMV identifica clientes con autorización válida para recibir comunicaciones en ese canal.
3. VMV prepara y, solo cuando el negocio autorice la automatización, envía una solicitud **neutral y honesta** de opinión; ofrece controles para pausar, limitar frecuencia y evitar duplicados.
4. Seguimientos opcionales únicamente dentro del consentimiento y de las reglas del canal; siempre respetar bajas/revocaciones y no insistir a quien no quiere recibir mensajes.
5. Panel con métricas verificables: solicitudes autorizadas y enviadas, entregas cuando el proveedor lo confirme, aperturas o clics solo si medibles, y reseñas recibidas únicamente cuando exista una fuente que permita confirmarlo. **No atribuir una reseña a una solicitud si no hay evidencia.**
6. Los agentes de VMV pueden sugerir borradores de respuesta a reseñas reales; publicación solo con autorización y permisos adecuados.

**Integraciones candidatas:** eventos de pedidos/citas de VMV Smart Quote, Smart Call, Web Services o conectores externos; sistemas de mensajería con consentimiento (email, SMS o WhatsApp según disponibilidad); Google Business Profile Reviews **solo sujeto a aprobación de API, OAuth y permisos de la cuenta**.

**Condiciones:** nunca comprar reseñas, ofrecer incentivos por valoración, fabricar opiniones, filtrar clientes según satisfacción ni pedir exclusivamente reseñas positivas. Gestionar privacidad, retención de datos, permisos por negocio, registros de auditoría, límites de envío y requisitos de Meta/Google/operadores. Costos y disponibilidad pendientes de validación.

**Alcance del cambio actual:** únicamente referencia bilingüe «Próximamente — Reputation Booster» dentro de `ReputationStudio` y esta documentación. No se han añadido conexiones, colas de mensajes, base de datos, cobros, APIs, automatizaciones ni cambios en producción.

## Reglas de seguridad
- No enviar correos/SMS/reseñas sin consentimiento, ni generar reseñas falsas o filtrar solo las positivas.
- No crear fichas duplicadas; no hacer scraping o automatización de portales contra sus términos.
- No declarar una publicación, verificación, conexión OAuth o datos de ventas sin confirmación de API/proveedor.
- Dirección privada de negocios desde casa nunca se revela por defecto en fichas públicas.
- No almacenar secretos de Google/Meta/otros en cliente; tokens cifrados y con scopes mínimos en backend.
- Ningún módulo debe modificar la interfaz/flujo del otro sin acuerdo del Director.
- Web Services mantiene Google Business Profile y web; Marketing mantiene marketing/atribución; AI Agents mantiene agentes.

## Criterios de aceptación de próxima integración OAuth
Cliente autoriza acceso → API devuelve datos reales → VMV conserva fuente y timestamp → errores/expiración se presentan claramente → desconexión de cuenta → nunca se muestra éxito sin lectura de vuelta.
