# VMV Ads Studio — simplificación y producto comercial (18 noviembre 2026)

Rama: `feat/vmv-smart-call-control-center` (Preview; sin cambios de producción)
Responsable: Marketing. Reutiliza la conexión oficial de Meta ya autorizada por el cliente.

## Problema observado en pruebas de iPhone

- El cliente vio una página demasiado larga: un hero grande, pasos repetidos, catálogo completo de futuras APIs antes del servicio que realmente usa, formularios extensos y explicaciones de límites repetidas.
- El botón «Proponer anuncio con IA» devolvió «Descubre [negocio]»: plantilla genérica y no un anuncio por el cual un negocio pagaría.
- Diagnóstico confirmado en Vercel: en Preview **no existe actualmente** una variable `OPENAI_API_KEY` ni `AI_GATEWAY_API_KEY`. El sistema antiguo devolvía un fallback genérico por diseño.
- Antes, los anuncios dirigían la audiencia a **todo Estados Unidos** por defecto, algo costoso e inadecuado para pequeñas empresas locales.

## Rediseño implementado (rama Preview)

- Eliminado el gran hero y la navegación duplicada: encabezado compacto dentro de los estilos de Marketing, tarjetas individuales de **Cuenta publicitaria, Tu promoción, Propuesta publicitaria, Presupuesto y entrega**.
- La Página de Facebook se elige inmediatamente debajo de la cuenta conectada, sin pedir el dato dos veces. Cambiar/desconectar se mantiene en un desplegable.
- Datos esenciales: negocio, qué vende, diferenciador verdadero, público en términos generales y ciudad.
- Buscar ciudad **real en Meta** mediante `GET /api/marketing/ads/meta/locations?q=...`; usuario debe escoger ubicación devuelta por Meta. Radios predefinidos 10, 15, 25 y 50 millas.
- Las campañas se guardan únicamente con una ciudad devuelta por Meta, verificada **de nuevo desde backend** con el token autorizado. El ad set usa `geo_locations.cities` con ID de ciudad y radio; **ya no se usa segmentación nacional por defecto**.
- Tres propuestas distintas de texto con selección y edición; vista previa de la creatividad con imagen subida por el cliente.
- Switch real para incluir Instagram (solo cuando la Página tiene Instagram profesional conectado). Switch real para **etiquetar enlaces UTM**, no prometer visitas ni ventas sin GA4.
- Presupuesto diario + duración y total configurado. El presupuesto publicitario lo factura Meta al negocio, separado de la tarifa VMV.
- El historial y los canales futuros están plegados para reducir ruido y evitar hacer pasar por disponibles las APIs de Google/TikTok/Pinterest/LinkedIn/Snapchat.
- Mantiene bloqueo de gasto: `VMV_ADS_META_PUBLISH_ENABLED=false` y autorización adicional requerida antes de cualquier anuncio activo.

## Motor de propuestas

`POST /api/marketing/ads/generate` entrega tres variantes y una hipótesis medible:

1. **Con IA**, solo si hay proveedor configurado (`OPENAI_API_KEY` server-only o `AI_GATEWAY_API_KEY`). Prompt basado exclusivamente en hechos proporcionados, JSON con estructura, tres enfoques distintos, propuesta de medición y motivo para cada enfoque.
2. **Sin IA**, motor local determinista basándose en los hechos del negocio. Se etiqueta honestamente **Borrador sin IA**, no «IA generó...». No inventa descuentos, precios, testimonios ni capacidades.
3. Si el proveedor no responde, se presenta el mismo borrador basado en reglas con explicación visible. No falsificar éxito.

### Para activar IA realmente

El propietario deberá crear/configurar una clave del proveedor que elija directamente en las variables **privadas** de Vercel, entorno Preview y rama piloto. Para OpenAI usar `OPENAI_API_KEY` (**Sensitive**, nunca `NEXT_PUBLIC_`), volver a desplegar, probar una propuesta real y revisar respuestas, tiempos, costos y límites. La clave **no debe enviarse por chat ni subirse a GitHub**.

## Oferta comercial a estudiar (NO precios ni planes aprobados)

**VMV Ads Launch Pack**:
- Conectar cuenta autorizada de Meta y seleccionar Page/Instagram.
- Construir un brief rápido del negocio.
- Propuesta de 3 anuncios con ángulos diferenciados, imagen y vista previa.
- Segmentación geográfica local, fecha y límite de presupuesto.
- Etiquetas UTM para medición en la analítica externa disponible.
- Revisión/aprobación humana y creación de objetos PAUSED en Meta.
- Seguimiento de clics, impresiones y gasto cuando Meta devuelva datos; conversiones y ventas **solo con señales conectadas y verificadas**.

**Posibles modalidades futuras**, sujetas a pruebas y aprobación de pricing: tarifa fija de preparación o gestión mensual. No confundir el coste de servicio VMV con el presupuesto de anuncios del cliente. El cobro Stripe TEST de cotizaciones está programado por separado, sin E2E validado.

## Qué falta para declarar vendible

- QA manual iPhone/Android y revisión visual con el propietario; hacer una revisión de accesibilidad de tarjetas/switches.
- Configurar IA y comprobar calidad y estructura de 3 propuestas con negocios reales. Medir coste por solicitud y aplicar límites persistentes antes de escalar.
- Probar búsqueda y selección de ciudad con Meta API; comprobar IDs, radios y audiencia en una cuenta publicitaria real.
- Seleccionar Facebook Page y subir imagen; verificar creación real `PAUSED` de campaign/adset/creative/ad en Meta sin gastar dinero.
- Verificar fuente real de métricas e informar claramente ausencia de datos cuando no existan; las UTM no crean analítica por sí mismas.
- Completar Stripe TEST de extremo a extremo y relacionar el servicio facturado con la entrega sin cobrar presupuesto de anuncios.
- Prueba integral de autorización/consentimiento para el gasto antes de permitir publicaciones. Bloqueo de publicación permanece activo.
- Acceso Meta para clientes externos depende de revisión de permisos por Meta, no basta que un desarrollador de la app pueda conectarse.

No cambiar precios, planes ni estado de lanzamiento sin aprobación expresa.
