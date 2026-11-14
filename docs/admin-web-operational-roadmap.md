# VMV Business — Admin Web

Owner: Admin Web chat, coordinated with Director. Shared branch: `feat/vmv-smart-call-control-center`.

## Estado confirmado, 13 nov 2026

- Repositorio: `valdy247/smartjob`, Next.js 16, React 19, TypeScript, Supabase y Vercel.
- No hay archivos `AGENTS.md` en el árbol completo inspeccionado de la rama.
- La autenticación web ya utiliza `getSupabase()` y el pool existente de Supabase Auth; no se creó otro sistema.
- `public.vmv_marketing_requests` es la solicitud canónica para trabajos de Marketing. El cliente ya consulta allí el estado, los presupuestos, la última actualización y la evidencia.
- `public.vmv_marketing_staff` permite identificar operadores autorizados mediante RLS. No se conceden roles desde la interfaz ni mediante metadatos editables.
- `public.vmv_marketing_quote_acceptances` contiene aprobaciones del cliente. El guard de la base de datos impide avanzar a ejecución/verificación sin la aprobación vigente.
- `public.smartjob_web_inquiries` son consultas recibidas por los sitios **de los clientes** (pedidos, citas o clientes potenciales de esos negocios). NO constituyen solicitudes a VMV Business y NO deben migrarse sin un contrato explícito.
- `public.vmv_ai_human_requests` son solicitudes de llamada a una persona para los titulares de AI Agents, no tickets generales de soporte de VMV.
- La base de datos tiene también tablas ajenas a este producto; no deben entrar en la bandeja por coincidencia de nombres.
- Al revisar el proyecto conectado se contaron **3 solicitudes de Marketing y 0 operadores provisionados**. Son datos puntuales, no valores de ejemplo para mostrar en la UI.

## Primera fase implementada en el repositorio

Ruta `/admin`:
1. Verificación de la identidad con Supabase Auth, rechazo de sesiones anónimas y comprobación de pertenencia a `vmv_marketing_staff`.
2. Lectura de solicitudes reales mediante el JWT del usuario y las políticas RLS existentes. Nunca se usa una clave de servicio en el navegador.
3. Inicio con contadores derivados de solicitudes reales. Si hay más de 200 registros y los totales no son exhaustivos, se oculta el número en vez de presentar métricas inventadas.
4. Bandeja de solicitudes de Marketing con búsqueda, estados, servicios, orden cronológico, referencia única e información contextual.
5. Registro de presupuestos con revisión, notas, petición de información, paso a trabajo y entrega con evidencia HTTPS, sujetos a los permisos y triggers ya existentes.
6. Diseño escritorio: lista, detalle y contexto; diseño móvil: lista → detalle → información, con controles para volver.
7. Clientes ven estado y última nota en el mismo `vmv_marketing_requests`; no se crea una segunda copia de solicitudes.

Limitaciones deliberadas de esta fase: la actualización `staff_update` es una **nota más reciente**, no un chat ni historial. Marcar `needs_customer` NO envía notificaciones. La entrega utiliza una URL HTTPS y no implementa carga privada de documentos.

## Próximas etapas / alcance completo pendiente

**P1: flujo operativo central y seguridad**
- Definir un esquema canónico de tickets de **soporte VMV** y una tabla de eventos/mensajes para historial inmutable, adjuntos con ACL, bitácora de cambios y referencias humanas.
- Tabla de asignaciones, prioridad, plazo, responsables y estados con una matriz de transiciones y auditoría. Los contadores de sin asignar, vencimientos y fallos deben esperar a tener esos datos reales.
- Revisar si Marketing necesita un adaptador o campos adicionales manteniendo `vmv_marketing_requests.id` como origen. No duplicar ni cambiar su lógica de presupuestos sin coordinación.
- Provisionamiento de operadores mediante un proceso separado, verificado por Director; separación admin/agente, mínimo privilegio y prueba de RLS positiva/negativa.
- Definir la forma en que el cliente recibe los mensajes y aporta información, incluyendo notificaciones y protección contra acceso cruzado.

**P2: módulos visibles**
- Clientes: ficha autorizada, búsquedas, solicitudes por negocio y visibilidad parcial de datos, con RLS específico.
- Servicios: cola multi-origen de tareas VMV (Marketing, Web Services de VMV, constitución de LLC cuando exista una solicitud canónica).
- Equipo: asignaciones, cargas y permisos, sin autoconcederse roles.
- Configuración: categorías de servicios, SLA, notificaciones, plantillas y cambios auditables.

**P3: herramientas avanzadas**
- Solicitudes de presupuesto con aceptación verificable, control de versiones, solicitudes de revisión y evidencia de entrega.
- Indicadores de espera, SLA y fallos con fuente verificable; búsqueda y paginación por servidor.
- Atención de soporte, automatización segura y panel de auditoría; exportaciones con filtros y permisos.

## Pruebas y puertas de lanzamiento

- Los nuevos archivos están aislados en `app/admin/`. No se modifica ninguna pantalla de Marketing, AI Agents, Web Services ni iOS.
- Antes de anunciar disponibilidad interna: provisionar **explícitamente** un operador autorizado en un entorno de prueba; verificar acceso de agente, denegación de usuario normal/anon, límites de acceso a otra cuenta, filtros y móvil.
- Validar contra la base conectada: cotización, nueva revisión, rechazo o aceptación, transición a trabajo solo tras aceptación, evidencia verificada y resultado visible en la pantalla original de Marketing.
- Confirmar que RLS deniega `smartjob_profiles`, `smartjob_web_inquiries` y otros negocios al rol de operador no autorizado para esas tablas.
- Ejecutar `npm run typecheck`, pruebas de flujo y construcción en un entorno con dependencias instaladas antes de publicar. **No desplegar manualmente a producción**.
- El contexto de las otras conversaciones se considera pendiente hasta poder corroborarlo con datos y código. El prompt original recibido quedó truncado tras la mención de «pedidos, citas o contactos», así que esa parte necesita verificación cuando esté disponible.

## Decisiones arquitectónicas

- UX minimalista y moderna, lime/lila moderados, sin números ficticios.
- Mostrar solo Inicio, Bandeja y Servicios mientras el resto no esté operativo. Registrar Clientes, Equipo y Configuración en el alcance, no simular botones.
- La página usa control de acceso de cliente + RLS real del servidor. Este es un MVP de entrada; futuras operaciones sensibles deberían tener endpoints de servidor con revisión de permisos, tasa y auditoría.
- Evitar elevación por `user_metadata` y evitar incorporar solicitudes ajenas por semejanza de esquema.


## Estado posterior al cierre de base (13 nov 2026)

El archivo `docs/admin-web-closure-2026-11-13.md` describe el sistema operativo ampliado y sus pruebas. Bandeja paginada, métricas globales, soporte, avisos, auditoría transaccional, roles y archivos con visibilidad separada ya se implementaron. Siguen pendientes la aceptación autenticada en móvil/escritorio con dos cuentas piloto, la validación completa en inglés y los contratos externos específicos; no se cambió ningún caso real como prueba.
