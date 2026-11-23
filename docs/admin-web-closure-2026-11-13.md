# Admin Web — cierre operativo independiente

**Fecha:** 2026-11-13 (hora local de Valdy)
**Repositorio:** `valdy247/smartjob`
**Rama compartida:** `feat/vmv-smart-call-control-center`
**Base revisada al comenzar:** `410409086ea86ffe716fe1fc893295cfca7415c1`
**Implementación principal:** `2ba1b2841bda0ff498144e4f11a040d78d7dfbd1`
**Corrección de build:** `faf7bc471d78e4128db1f84039d4566a7cf51058`
**Idioma y estado de servicios:** `ac60ab4e2850366b48a68f24e867ecdd65bcf256`
**Preview compilada:** https://smartjob-1wqmsqm4h-valdys-projects-b97fc7a6.vercel.app/admin
**Soporte:** https://smartjob-1wqmsqm4h-valdys-projects-b97fc7a6.vercel.app/vista-app/soporte

## Alcance integrado

1. **Inicio:** métricas globales calculadas por `vmv_admin_queue_metrics`; contadores de nuevos, sin asignar, pendientes del cliente, en proceso y próximos a vencer. Los recuentos ya no se derivan de solo 150 registros. Los casos y clientes tienen paginación en servidor.
2. **Bandeja:** fuentes canónicas Marketing, soporte VMV, solicitudes de línea y dominios; búsqueda por campos, filtros, responsable, prioridades y fechas, orden y consulta por ID incluso fuera de la primera página.
3. **Detalle:** conversación paginada, notas internas, historial de eventos, archivos, contexto del cliente, responsables, prioridad, plazo, revisiones de presupuesto y evidencia.
4. **Equipo:** alta de cuenta VMV ya verificada, cambio/revocación de rol con comparación de versión y bloqueo transaccional de último administrador; no hay autoasignación de permisos por metadatos editables.
5. **Cliente:** portal `/vista-app/soporte`, enlazado desde la sección Cuenta de VMV; tickets con idempotencia, reintentos, mensajes, fotos/PDF privados, historial, estado y nuevo ticket relacionado cuando se cierra el original. Incluye dominios y líneas que pertenecen a la cuenta; no duplica su solicitud canónica.
6. **Notificaciones internas:** nueva solicitud, mensajes, información requerida, presupuesto, cambio de estado, entrega y archivos compartidos; con estado de lectura.
7. **Seguridad de archivos:** bucket privado, firma temporal de 60 segundos, encabezados autorizados, verificación de caso, MIME y firma de contenido, tamaño 3 MB, nombres depurados, visibilidad `shared`/`internal`, compensación de almacenamiento cuando el registro falla. Una firma temporal **no** es de un solo uso.
8. **Facturación y servicios:** lectura de suscripciones y errores de llamadas; distinción TEST/LIVE. AI Agents, Web Studio y líneas muestran registros reales disponibles, sin activar compras ni servicios.
9. **Configuración:** preferencia SLA de 1–30 días aplicada **a nuevos tickets** (tabla `vmv_admin_case_meta`); bienvenida en portal, guardado con control de versión. Otros servicios mantienen plazos manuales.
10. **Idioma:** portal de soporte español/inglés y controles primarios de Admin con selector existente. Persisten algunos textos secundarios de Admin exclusivamente en español; no afirmar traducción completa hasta QA visual.

## Migraciones — aplicadas al Supabase conectado

- `supabase/sql/vmv_admin_closure_foundation.sql`: claves de reintento, visibilidad de adjuntos, notificaciones, historial, índice unificado y métricas.
- `supabase/sql/vmv_admin_closure_atomic_ops.sql`: `vmv_admin_apply`, control de concurrencia y auditoría atómica para casos, roles, presupuestos, estados y ajustes.
- `supabase/sql/vmv_admin_closure_support.sql`: `vmv_admin_create_ticket` y `vmv_admin_append_message`, con idempotencia, topes transaccionales y actividad actualizada.
- `supabase/sql/vmv_admin_closure_files.sql`: `vmv_admin_register_file`, registro de adjuntos con historial/auditoría en una sola transacción.

No se creó un segundo modelo de solicitudes Marketing. Las tablas `smartjob_web_inquiries` y `vmv_ai_orders` no entran a soporte de VMV, porque pertenecen a la operación comercial del negocio cliente.

## Comprobaciones efectuadas

- Revisión del HEAD de GitHub y árbol completo: ningún `AGENTS.md` aplicable al momento de comenzar.
- Vercel Preview: compilación Next.js, TypeScript y suite del proyecto completadas, despliegue `READY` para `ac60ab4`; sin publicación manual.
- SQL sobre datos **sintéticos y revertidos con ROLLBACK**: creación de ticket, reintento con mismo ID sin duplicado, creación de mensaje, reintento sin duplicado, rechazo de mensaje de otra cuenta, transición de soporte, ticket relacionado y conflicto de versión.
- RLS simulando dos cuentas autenticadas: el dueño ve su ticket, mensaje público y archivo compartido; no ve nota ni archivo interno. Un segundo cliente no puede ver ninguno.
- Marketing con registros sintéticos y transacción revertida: cotización con revisión, rechazo de aprobación antes de consentimiento vigente, aceptación correcta, cambio a trabajo y entrega con evidencia y notificación.
- Query de permisos: las funciones `vmv_admin_apply`, `vmv_admin_create_ticket`, `vmv_admin_append_message`, `vmv_admin_register_file` y `vmv_admin_queue_metrics` no son ejecutables por `anon` o `authenticated`; únicamente por rol de servicio en el servidor.
- Comprobación tras ROLLBACK: no quedaron usuarios, solicitudes, mensajes o auditorías de prueba persistidos.
- Conversión de `datetime-local` a timestamp UTC revisada en `America/New_York` y `America/Los_Angeles`; los instantes originales se conservan en el código de conversión.
- Cuenta de Valdy: existe como administrador con correo verificado en `vmv_marketing_staff`, verificada por consulta; no se cambió su rol.

## Lo que NO se puede dar por probado todavía

- Prueba E2E real en navegador autenticado con cuentas piloto A, B y operador, incluyendo revocación efectiva de una sesión y verificación visual en móvil. Las pruebas SQL/RLS no reemplazan cookies, UI y rutas HTTP bajo sesión real.
- Paginación con carga de más de 150/250 casos y navegación hacia mensajes muy antiguos en la interfaz real.
- Pruebas simultáneas con varios clientes para saturar el límite; la exclusión mutua y unicidad están definidas en SQL, pero necesitan estrés con conexiones reales.
- Prueba real subida/descarga de archivo y foto Google desde navegador autenticado, incluidos fallos de red y limpieza de huérfanos.
- Revisión visual y lingüística completa de todo Admin en inglés. Controles primarios y soporte sí están implementados; algunos secundarios siguen en español.
- Lectura de notificaciones en distintos dispositivos y pruebas de integridad con red inestable.

Estas pruebas no se ejecutaron con cuentas reales ni solicitudes existentes, de acuerdo con el requisito de no alterar datos reales.

## Dependencias concretas externas

| Integración | Qué falta | Responsable | Lo preparado en Admin |
|---|---|---|---|
| Crear compañía | Fuente canónica con id, owner, formulario por estado, aprobaciones, estados, evidencia y permisos | Módulo Crear compañía / Director | Bandeja y modelo genérico de soporte; adaptador cuando exista registro canónico |
| Notificaciones externas | Credenciales, plantillas, consentimiento y reintentos de email/SMS/push | Director / infraestructura de comunicaciones | Avisos **dentro** de VMV con estados de lectura, sin afirmar envíos externos |
| Activación de líneas/dominios | Operaciones autorizadas en los módulos originales, verificaciones de proveedor y política de compra | Smart Call / Web Services | Consulta, asignaciones, chat del cliente, archivos y seguimiento sin activación no autorizada |
| AI Agents | Contrato de incidentes del propio servicio, distinto de pedidos/escalaciones del comercio del cliente | AI Agents / Director | Tickets etiquetados, resumen de registros de agentes y bandeja general |

## Acciones mínimas para cerrar aceptación

1. Abrir la URL Preview de Admin y de soporte con una cuenta de operador verificada y dos cuentas piloto de clientes sin datos reales.
2. Validar creación → asignación → mensaje → respuesta → evidencia → cierre → ticket relacionado con el navegador y el teléfono; probar cambio rápido A/B, ingreso directo a ID antiguo, visibilidad de adjuntos y sesión revocada.
3. Registrar resultados y fallos de la prueba en un acta; solo entonces considerar publicación controlada.

**Estado:** base operativa sustancialmente implementada y compilada, validaciones de base/RLS realizadas; **NO declarar 100 % finalizado hasta QA autenticada y revisión completa del idioma**.
