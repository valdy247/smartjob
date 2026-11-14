VMV SMART CALL — STARTER / 150 MINUTOS NACIONALES
Actualizado 2026-11-11. SOLO PREVIEW PILOTO; producción no modificada.

ALCANCE
- Starter: 150 min por período, separados totalmente de los minutos de traducción.
- Incluye llamadas normales entrantes, llamadas desde teclado y devoluciones.
- Se cobra tiempo realmente conversado con el cliente, por llamada redondeado al minuto superior. Las no contestadas no consumen.
- Máximo 10 minutos por llamada del piloto, reducido automáticamente cuando el saldo restante es menor.
- Renovación al iniciar un período nuevo. Sin traslado de sobrantes.
- NO hay recargas de minutos nacionales: su precio, tamaño y cobro Stripe están pendientes de aprobación.
- Los 150 min piloto arrancan desde la activación; no se descontaron retrospectivamente llamadas antiguas.

BASE DE DATOS
- Migración aplicada: supabase/sql/vmv_starter_150_national_calls.sql.
- Tablas independientes: smartjob_national_periods y smartjob_national_calls.
- Funciones atómicas: smartjob_national_claim, smartjob_national_settle, smartjob_national_reap.
- Bloqueo transaccional por período, idempotencia por llamada y expiración de intentos abandonados.
- RLS activo; anon y authenticated no tienen acceso ni a tablas ni a funciones. Solo service_role.
- La bolsa anterior smartjob_minute_ledger de traducción queda independiente.

INTEGRACIÓN
- Entrada normal: app/api/twilio/live/language, lib/vmv-ivr y live/direct-ended.
- Teclado y devoluciones: app/api/ios/dial, ios/callback, twilio/callback/bridge, dial-ended y status.
- API: app/api/billing/overview y app/api/ios/account-overview.
- UI: app/vista-app/page.tsx y apps/ios/App.tsx.
- El IVR permite seguir usando traducción sin minutos nacionales y viceversa.

ACTIVACIÓN CONTROLADA
SMARTJOB_NATIONAL_MINUTES_ENABLED=true solamente en Preview de feat/live-v2-production-foundations; exige además la lista blanca de propietario y validaciones TEST/plan activas. NO habilitado para producción, otros usuarios ni Pro/Premium.

VERIFICACIÓN
- Migración aplicada con éxito, RLS verificado y permisos de ejecución revisados.
- Prueba SQL en transacción con rollback: reclamación 10 min, repetición idempotente, 65 s -> 2 min, reintento no duplica cargos y llamada sin respuesta -> 0. No se dejaron registros de prueba.
- Compilación Vercel piloto en READY y redeploy con la flag activada.
- Pendiente: llamada física iPhone + cliente externo, validar PushKit, tiempo del Dial, fin de llamada, contador; TestFlight nativo aún sin compilar.
- Recargas nacionales no habilitadas hasta definir precio y reglas.

TRABAJO PARALELO
Las ramas feat/live-v2-production-foundations y feat/vmv-smart-call-control-center comparten la lógica. Director debe integrar y validar antes de producción. No sobrescribir cambios de otros módulos ni mezclar los minutos de traducción con los nacionales.
