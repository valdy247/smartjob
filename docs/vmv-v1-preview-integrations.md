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
| ElevenLabs | `ELEVENLABS_API_KEY` solo en Preview para `feat/vmv-smart-call-control-center` | Crear **nueva** variable sensible con el mismo nombre, target Preview y `gitBranch=release/vmv-business-mvp-v1`; Vercel no entrega el valor existente; requerirá que el dueño pegue la clave de forma segura |
| Motor de animación | Render `vmv-pilot-motion-preview` sigue en `feat/vmv-smart-call-control-center` | Preparar worker de V1 persistente; revisar costos antes de aprovisionar un nuevo servicio |
| Créditos/ledger | No se confirmó ledger V1 completo | No descontar créditos ni aceptar pagos hasta pruebas de idempotencia |
| Publicación Meta Ads | Variable `VMV_ADS_META_PUBLISH_ENABLED=false`, exclusiva de Preview V1 | Mantener bloqueada hasta autorización para publicación real |
| Pilot auto-render antiguo | `VMV_PILOT_RENDER_ENABLED=false`, exclusiva de Preview V1 | No habilitar hasta verificar worker, aprobación de escenas y montaje |

## Riesgos y puertas de lanzamiento

- El proyecto Supabase es compartido con flujos existentes: nunca ejecutar migrations destructivas o crear tablas conflictivas sin revisión.
- La variable `ELEVENLABS_API_KEY` de otra rama no debe reasignarse porque eso puede romper las voces del Preview anterior.
- Un worker Render ligado a otra rama no prueba que V1 pueda continuar jobs con el navegador cerrado.
- Nada en esta auditoría prueba un video generado y descargable desde Historial; ese flujo sigue pendiente.
- Las banderas protectoras son seguras; no activan costos externos ni campañas.
