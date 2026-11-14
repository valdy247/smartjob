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
