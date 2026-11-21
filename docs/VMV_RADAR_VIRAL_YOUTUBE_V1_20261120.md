# VMV Business · Radar Viral IA v1 (YouTube)

Fecha: 2026-11-20 · Rama compartida: `feat/vmv-smart-call-control-center`.

## Alcance implementado

- Entrada visual **«Investigar mi mercado»** en el primer paso del Wizard de Piloto Automático.
- Fuente inicial oficial: **YouTube Data API v3**, `search.list` (videos cortos, fechas, búsquedas) y `videos.list` (estadísticas originales).
- Resultados reales con títulos, canales, miniaturas, fechas, vistas, me gusta y comentarios cuando están disponibles, y enlaces directos a YouTube. **Nunca inventar resultados**.
- Priorización según el orden de popularidad que devuelve YouTube para videos recientes. **No existen puntuaciones propias ni cálculos de vistas por día o engagement**: una auditoría/autorización específica de YouTube es necesaria para métricas derivadas.
- Botón separado **«Crear 3 ideas con IA»**. La IA utiliza títulos, descripciones y estadísticas de las fuentes seleccionadas para formular hipótesis y conceptos **originales**. No recibe el vídeo completo, audio, transcripción ni retención.
- Guardado privado en Supabase; lectura RLS por propietario y mutaciones solo en servidor; caché hasta 6 horas y 6 búsquedas nuevas por usuario cada 24 h.
- Selección humana de idea y referencia de investigación, verificadas contra la investigación del mismo propietario antes de guardarlas en el plan. El primer video de AI Agents usa la inspiración como propuesta original, con autorización individual antes de gastar créditos Runway.
- Consentimiento antes de buscar, enlace a términos de YouTube, aviso de privacidad de Radar y botón para borrar investigaciones.
- `pg_cron`: eliminación automática de investigación y estadísticas al cumplir **29 días**; borrar investigaciones manualmente también desvincula su inspiración del plan.
- Instagram y TikTok quedan como fuentes futuras con proveedores/consentimientos autorizados, sin scraper no aprobado.

## Bloqueo operativo real — requiere un paso del administrador

En Vercel (proyecto `smartjob`, Preview de esta rama) **NO está configurada** `YOUTUBE_DATA_API_KEY`. Sin esa variable, la búsqueda responde `radar_youtube_key_missing` y no devuelve resultados falsos.

1. Abrir [Google Cloud Console](https://console.cloud.google.com/apis/library), seleccionar o crear un proyecto de Google Cloud dedicado a VMV.
2. Habilitar **YouTube Data API v3** en **APIs & Services → Library**.
3. En **Credentials**, crear **API key** y restringir su uso a **YouTube Data API v3**. Es una clave de servidor: no utilizar restricciones de «HTTP referrers» para Vercel, ni ponerla en `NEXT_PUBLIC_*`.
4. Guardar esa clave de forma **secreta** en Vercel → smartjob → Settings → Environment Variables con nombre **`YOUTUBE_DATA_API_KEY`**, target Preview, preferiblemente restringida a la rama compartida.
5. Volver a desplegar la misma rama. Nunca copiar la clave a GitHub, al chat, a la app móvil ni a un documento.
6. Iniciar sesión con la cuenta que tenga `VMV_VIDEO_ALLOWED_OWNER_ID`, abrir `/vista-app/video-generator?setup=autopilot`, elegir un tema, aceptar privacidad de Radar, pulsar **Buscar**, abrir un video real de YouTube y generar tres ideas con IA si el modelo está conectado.

## QA sin consumo del proveedor

- `npm run video-radar:test` verifica TSX, acceso, manejo de fuentes, no derivar métricas, RLS y retención.
- La migración `supabase/sql/vmv_video_radar_youtube_20261120.sql` fue aplicada y crea `vmv_video_radar_scans` y `vmv_video_radar_claim`.
- La migración `supabase/sql/vmv_video_radar_retention_20261120.sql` fue aplicada y configura cron diario y borrado explícito.
- La API rechaza usuarios no autenticados o fuera de la lista de Preview; la clave nunca se envía al navegador.
- SQL transaccional con `ROLLBACK` comprueba aislamiento, cuota, persistencia y borrado sin dejar registros de prueba (revisar resultado antes de anunciar completado).

## Límites de la primera versión

- Hasta 12 videos en los últimos 7/30/90 días por consulta; **solo metadatos**, no inspección del video, comentarios individuales, retención, sonido o tendencias en tiempo real.
- Las búsquedas son iniciadas por una persona: todavía no hay investigaciones programadas ni feeds continuos.
- No publica en YouTube, Instagram, TikTok, Facebook ni cobra por números/tarjetas.
- La generación de ideas puede utilizar el proveedor de IA configurado (consumo bajo control del botón). El modelo no debe afirmar causalidad o métricas no observadas.
- Para análisis audiovisual genuino en etapas futuras, integrar un proveedor con derecho a acceder al material, transcripciones autorizadas y APIs de cada red.
- Revisar los términos oficiales de [YouTube API](https://developers.google.com/youtube/terms/developer-policies), los requisitos de marca, consentimiento y política de privacidad antes de ampliar a clientes externos.

## Arquitectura preparada para otras redes

Modelo normalizado interno `RadarVideo` y fuente `source=youtube`. Añadir Instagram/TikTok como adaptadores de fuente **solo después** de autenticar/autorizar el acceso, verificar su política y aislar los datos por negocio. No tratar estadísticas de diferentes plataformas como directamente comparables.

No habilitar investigación recurrente ni publicación autónoma hasta contar con cuotas, consentimientos, auditoría de APIs y un botón global de pausa con efecto real en el servidor.
