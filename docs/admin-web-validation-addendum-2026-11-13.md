# Admin Web — verificación y correcciones adicionales (13 Nov 2026)

Base auditada: `3d9ec9d75ed89b16f585e4fcc73856b7df4b5d91` en `feat/vmv-smart-call-control-center`.

## Confirmado

- Las cinco funciones de cierre `vmv_admin_*` son ejecutables únicamente con `service_role`, no con `anon` ni `authenticated`.
- `vmv_admin_case_index` es una vista `security_invoker` cuyo acceso está concedido únicamente a `service_role`, no a clientes.
- `vmv-admin-files` y `vmv-google-media` son buckets privados.
- La cuenta de administrador actual sigue provisionada. No se cambió ninguna cuenta o permiso.
- La infraestructura previa ya contiene paginación de casos, historial, mensajes y notificaciones, operaciones atómicas y portal de soporte.
- No hay solicitudes nuevas de soporte ni mensajes administrativos reales en el momento de la consulta.

## Correcciones nuevas

1. `app/api/case-files/route.ts`: propietarios autenticados de solicitudes de dominio y telefonía pueden acceder a adjuntos **compartidos** en su expediente canónico. El campo `visibility=internal` sigue reservado al personal.
2. `supabase/sql/vmv_admin_closure_file_limits.sql`: la función `vmv_admin_register_file` serializa cargas concurrentes mediante bloqueos transaccionales por actor y caso, y hace cumplir sus límites de 20 archivos por día y 80 por expediente dentro de PostgreSQL. La autorización y el estado abierto del expediente se comprueban otra vez dentro de la misma transacción que registra metadatos, historial y avisos.
3. `components/CaseAttachments.tsx`: una subida o fallo tardío de un expediente anterior no reemplaza el estado visible del expediente nuevo.

La subida al bucket antecede al registro atómico. En caso de rechazo de la función, el servidor intenta eliminar el objeto subido. La compensación no es equivalente a una transacción distribuida; una falla de eliminación podría dejar un huérfano, que deberá ser atendido por un proceso de conciliación.

## Validación y criterios de aceptación pendientes

- Migración aplicada al proyecto Supabase conectado y definición de función a releer.
- Compilación de Preview en Vercel y controles de tipos.
- Prueba autenticada con cliente A/B, operador, archivos internos y compartidos, cambio rápido de caso, subida y descarga real, simultaneidad a gran escala y dispositivos reales.
- Revisión visual completa del inglés en Admin; la traducción del portal y los controles principales existen, pero no todos los textos.
- Contratos externos de Crear compañía, avisos SMS/email/push y activaciones de proveedor siguen en sus módulos responsables.

No se han usado solicitudes reales como datos de prueba ni se han ejecutado cobros, compras, SMS o emails. No publicar manualmente a producción.