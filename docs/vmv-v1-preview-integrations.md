# VMV Business V1 — Mapa de conexiones Preview

Actualizado: 2026-11-22. Este documento contiene estados y **nombres** de configuración, nunca valores de secretos.

## Alcance

- Vercel project: `smartjob` (`prj_yeVaibe69wH77tUM2ZXphTHjzwfx`).
- Rama V1: `release/vmv-business-mvp-v1`.
- No modificar variables de `production` ni mover claves asignadas a otras ramas.
- Los cambios a variables requieren un nuevo despliegue Preview para surtir efecto.

| Integración | Estado verificado | Próximo paso |
| --- | --- | --- |
| Supabase pública | `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en todos los entornos | Probar sesión y guardar proyectos con RLS |
| Supabase servidor | `SUPABASE_SECRET_KEY` en Preview general | Aplicar migraciones de V1 solamente tras revisar efectos en el proyecto compartido |
| OpenAI | `OPENAI_API_KEY` en Preview general | Validar endpoints, permisos y límites de gasto |
| YouTube | `YOUTUBE_DATA_API_KEY` en Preview general | Comprobar Radar y fuente real, sin inventar datos |
| ElevenLabs | **Configurada por el dueño en Preview general** (sin `gitBranch`); también permanece la clave anterior específica de `feat/vmv-smart-call-control-center`. | Video Studio V1 usa `GET /api/video-studio/voices`, solo para usuario autenticado, que devuelve voces OpenAI y hasta 40 voces ElevenLabs; comprobar muestras reales con sesión iniciada. No se habilitan TTS de pago ni generación de videos por este cambio. |
| Motor de animación | Render `vmv-pilot-motion-preview` sigue en `feat/vmv-smart-call-control-center` | Preparar worker de V1 persistente; revisar costos antes de aprovisionar un nuevo servicio |
| Créditos/ledger | No se confirmó ledger V1 completo | No descontar créditos ni aceptar pagos hasta pruebas de idempotencia |
| Publicación Meta Ads | Variable `VMV_ADS_META_PUBLISH_ENABLED=false`, exclusiva de Preview V1 | Mantener bloqueada hasta autorización para publicación real |
| Pilot auto-render antiguo | `VMV_PILOT_RENDER_ENABLED=false`, exclusiva de Preview V1 | No habilitar hasta verificar worker, aprobación de escenas y montaje |

## Riesgos y puertas de lanzamiento

- El proyecto Supabase es compartido con flujos existentes: nunca ejecutar migrations destructivas o crear tablas conflictivas sin revisión.
- La variable general de Preview se aplica también a otros despliegues Preview; se mantuvo intacta la variable específica de la rama anterior. El secreto nunca se imprimió ni se almacenó en GitHub.
- Un worker Render ligado a otra rama no prueba que V1 pueda continuar jobs con el navegador cerrado.
- Nada en esta auditoría prueba un video generado y descargable desde Historial; ese flujo sigue pendiente.
- Las banderas protectoras son seguras; no activan costos externos ni campañas.

## Registro de conexión de voz V1

- La variable `ELEVENLABS_API_KEY` ahora aparece con `target=preview` y `gitBranch=null` en Vercel, sin revelar su valor.
- Nuevo endpoint `app/api/video-studio/voices/route.ts`, que consulta el catálogo mediante sesión autenticada. No invoca generación de voz ni cobra créditos.
- Componente `PilotVoiceStep` acepta `catalogEndpoint` y `sampleMode="prerecorded"`. La V1 puede escuchar solo muestras pregrabadas con enlace; los previews de TTS pagado permanecen protegidos.
- Test `scripts/vmv-v1-voice-setup.test.cjs` integrado en el build de Preview.
- **Pendiente de validación manual:** con sesión iniciada, comprobar que la API de ElevenLabs responde y las voces aparecen con sus muestras en el selector.
