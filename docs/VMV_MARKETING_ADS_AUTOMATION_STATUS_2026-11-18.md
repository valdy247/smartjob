# VMV Business — Ads Automation: implementación y bloqueos reales

Fecha de revisión: 18 de noviembre de 2026
Rama aislada: `feat/vmv-smart-call-control-center`.
Ruta del cliente: `/vista-app/marketing` → pestaña **Campañas** → **Conectar cuentas y crear anuncios** → `/vista-app/marketing/ads`.
Ninguna implementación de esta rama equivale a desplegar anuncios en producción.

## Alcance programado

1. **Meta OAuth**: `/api/marketing/ads/meta/start` inicia autorización oficial con estado aleatorio, almacenado como hash y ligado al propietario autenticado. `/api/marketing/ads/meta/callback` consume el estado una sola vez, intercambia el código, pide token de larga duración y guarda el token cifrado mediante AES-256-GCM en una tabla inaccesible para roles del navegador.
2. **Cuentas y páginas**: `/api/marketing/ads/meta/accounts` consulta cuentas de anuncios y páginas autorizadas por Meta y permite elegir solamente una cuenta activa en USD. También identifica si una página tiene Instagram de empresa conectado. `/api/marketing/ads/meta/disconnect` elimina las credenciales.
3. **Creatividades**: el usuario sube JPG/PNG de hasta 3 MB desde VMV. Un endpoint autenticado valida tipo y cabecera y sube la imagen a `/adimages` de Meta; no guarda binarios públicos en VMV.
4. **Texto**: `/api/marketing/ads/generate` solicita a IA una propuesta de título y texto en español/inglés, con revisión humana. Si faltan credenciales o falla el proveedor, usa una plantilla con `source=template`; nunca simula autoría de IA.
5. **Campañas**: `/api/marketing/ads/meta/campaigns` guarda un borrador, valida URL HTTPS, página autorizada, cuenta, imagen, audiencia general de Estados Unidos, duración de 1 a 30 días, presupuesto diario entre USD 5 y USD 250, confirmación de que no corresponde a categorías de publicidad especiales. Tras aprobación explícita del presupuesto por el propietario, hace solicitudes a Meta para crear **campaña, adset, creative y anuncio con `status=PAUSED`**, guardando los IDs en Supabase. Si falla una etapa, no reintenta automáticamente, pues podría duplicar objetos externos.
6. **Seguridad de publicación**: el código de activación existe pero está **apagado** por `VMV_ADS_META_PUBLISH_ENABLED=false`. Solo se habilitaría con permisos, propietario autorizado mediante `VMV_ADS_META_ALLOWED_OWNER_ID`, aprobación nueva del presupuesto y confirmación manual `PUBLICAR`. No habilitar en este momento.
7. **Control y resultados**: se puede pedir pausa a Meta sobre una campaña creada, leer indicadores reales desde `/insights` para los últimos 7 días, y ver estados y recibos. La API no afirma que exista una campaña real cuando no recibió IDs confirmados.
8. **Supabase**: migración aditiva `supabase/sql/vmv_marketing_ads_oauth_pilot.sql` aplicada, RLS por propietario sobre metadatos y campañas, tokens y estados OAuth sin acceso para `authenticated` ni `anon`. Los proveedores se consultan exclusivamente desde rutas server-side.

## Configuración actual de Vercel

Preparado en **Preview de esta rama** (no en Producción):
- `VMV_ADS_TOKEN_KEY` — valor secreto aleatorio de 32 bytes, configurado como **sensitive**; no registrar en GitHub.
- `VMV_ADS_PUBLIC_ORIGIN` — hostname estable de Preview, verificado por HTTPS.
- `VMV_ADS_META_PILOT_ENABLED=true`.
- `VMV_ADS_META_PUBLISH_ENABLED=false`.

**Bloqueo obligatorio**: faltan `META_APP_ID` y `META_APP_SECRET` de una app real de Meta Developers para esta rama. Hasta añadirlas, `adsMetaReady()` da falso y la interfaz indica «Configuración de Meta pendiente».

### Acciones manuales externas necesarias para una prueba Meta

1. Crear/configurar en <https://developers.facebook.com/apps/> la app Business correspondiente a VMV y los productos Login/Marketing API. Asociar/verificar empresa y permisos cuando Meta lo exija.
2. Registrar la URL de retorno EXACTA: `https://smartjob-git-feat-vmv-smart-cal-fcbaa4-valdys-projects-b97fc7a6.vercel.app/api/marketing/ads/meta/callback`. Verificar que Meta puede llegar a la URL de Preview (sin protección Vercel incompatible).
3. Solicitar y conseguir permisos `ads_read`, `ads_management`, `business_management`, `pages_show_list`, `pages_read_engagement`. Meta restringe funciones a apps, empresas y cuentas según su estado de revisión y nivel de acceso. No se puede completar ese consentimiento por código ni inventar su aprobación.
4. Guardar `META_APP_ID` y `META_APP_SECRET` como variables de Preview de esta rama (secreto `sensitive`). No compartir claves aquí y no ponerlas en `NEXT_PUBLIC_*`. Volver a desplegar Preview.
5. Usar un negocio propio autorizado, Page y cuenta publicitaria activa USD; conectar OAuth y seleccionar. Subir imagen, generar/editar copy, guardar propuesta y crear objetos pausados. Verificar en Ads Manager que todos los objetos de la campaña están **PAUSED**.
6. Ejecutar pruebas negativas de CSRF, expiración de estado, permisos ausentes, moneda no USD, IP/URL privada, categorías especiales, cuenta ajena, rechazo Meta, imagen incorrecta, clic doble, errores de red, pausa y desconexión.
7. Comparar el estado y el gasto informado por Meta. Solo después considerar una prueba controlada de publicación, con controles de gasto y autorización separada. La activación jamás debe encenderse globalmente.

## Canales y realidad de las APIs

| Canal | Estado dentro de VMV | Dependencias externas |
|---|---|---|
| Facebook/Instagram (Meta) | UI, OAuth, carga creativa, borrador y API Meta PAUSED implementados; sin prueba real de permisos | App Meta, Business verification/App Review, cuenta Ads y Page autorizadas |
| Google Ads (Search/Display/YouTube) | En catálogo, **no hay conector API de campañas operativo** | Proyecto Google Cloud, OAuth de Google Ads, nivel de acceso API apropiado y cuenta Ads autorizada |
| TikTok Ads | En catálogo, **no implementado** | App/API for Business y acceso/permiso del anunciante |
| Pinterest Ads | En catálogo, **no implementado** | Business Access y scopes `ads:write` mediante OAuth |
| LinkedIn Ads | En catálogo, **no implementado** | Marketing Developer Platform, aprobación de permisos |
| Snapchat Ads | En catálogo, **no implementado** | Marketing API habilitada por Snap, OAuth y permisos |

La capacidad de cada API NO significa que VMV ya tenga permisos comerciales ni cobertura de todos los formatos o países. Nunca mostrar «Conectar» como operativo sin OAuth funcional.

Fuentes oficiales:
- Meta Marketing API <https://developers.facebook.com/documentation/ads-commerce/marketing-api>
- Meta permisos y Business Management <https://developers.facebook.com/docs/business-management-apis/businessmanager/support>
- Google Ads OAuth <https://developers.google.com/google-ads/api/rest/auth>
- Google Ads acceso a producción <https://developers.google.com/google-ads/api/docs/api-policy/access-levels>
- TikTok Marketing API <https://business-api.tiktok.com/portal/docs/marketing-api/v2.0>
- Pinterest Ads <https://developers.pinterest.com/docs/work-with-ads/ads-overview/>

## Cobros

**Separación obligatoria**: el presupuesto publicitario lo factura la plataforma a la cuenta Ads del negocio. Las tarifas de VMV (setup, IA, servicio o suscripción), si se establecen, son cobros propios.

El circuito Stripe **TEST** de cotización, aceptación y recibo está programado aparte:
- `app/api/marketing/campaign-checkout/route.ts`
- `app/api/marketing/campaign-webhook/route.ts`
- `vmv_marketing_campaign_test_payments`

AÚN faltan pruebas E2E y conectar de forma transaccional un pago de servicio con el pedido de publicación de Ads. No se deben usar recibos de Stripe TEST como autorización para gastar dinero en Meta.

## Límites y compromisos

**No afirmar «funciona al 100 %»** hasta:
- conexión OAuth probada con cuenta real autorizada;
- Meta valida adset/creative/ad, y comprobamos IDs reales PAUSED;
- prueba de reintentos, cancelación, permisos y gasto en entorno controlado;
- revisión legal de anuncios especiales y políticas de Meta;
- Stripe TEST end-to-end sin cargos reales;
- permisos aprobados para cualquier canal adicional.

El código nuevo no modifica producción ni las operaciones de Web Studio, Director o AI Agents. La pantalla de Meta queda inoperativa de manera explícita hasta disponer de la app de Meta y su autorización.
