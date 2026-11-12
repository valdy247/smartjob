# VMV Web Services — Solicitudes reales (piloto de la rama compartida)

**Repositorio:** valdy247/smartjob  
**Rama:** feat/vmv-smart-call-control-center

## Entrega funcional

1. **Formulario público por negocio**, solo si el propietario activa `Recibir solicitudes en la web` en Web Studio y publica una revisión. Las webs antiguas permanecen sin formulario hasta que lo habiliten.
2. **Campos dinámicos** por categoría:
   - Bakery / catering: fecha, porciones, sabor, enlace de referencia.
   - Construcción / carpintería / mejoras del hogar: tipo de proyecto, presupuesto, plazo.
   - Eventos: fecha, invitados, presupuesto.
   - Negocios generales: plazo.
   - Siempre nombre, al menos un contacto (correo o teléfono), servicio y mensaje.
3. **Guardado efectivo** por RPC `smartjob_web_submit_inquiry`, con un `id` de solicitud confirmado por Postgres. Sin correos automáticos ni aprobaciones ficticias.
4. **Bandeja protegida** desde `Web Services → Solicitudes`, con contadores totales y nuevos, últimos 100 pedidos, filtros, contacto y estados: Nuevo/Cotizado/Aceptado/Completado/Archivado.
5. **Navegación desde los servicios**: si el formulario está activo, tocar un servicio prepara su selección; si no, conserva los enlaces directos existentes. No se altera Smart Call, AI Agents, Marketing ni Home.

## Modelo de seguridad

Tabla `public.smartjob_web_inquiries` con RLS y políticas de lectura/actualización restringidas por `auth.uid() = owner_id`. Usuarios autenticados solo pueden modificar columnas `status` y `updated_at`. `anon` no tiene SELECT/INSERT sobre la tabla.

Función pública `public.smartjob_web_submit_inquiry(text,jsonb)` es `SECURITY DEFINER` **de forma intencional**, ya que permite solo insertar una solicitud a una web efectivamente publicada y con formulario activado, sin conceder a `anon` acceso a datos de clientes. El propietario se obtiene desde el registro publicado en el servidor, nunca del formulario. Validaciones: tamaños, correo, teléfono, servicio existente, whitelist de detalles y honeypot. Límite transaccional por web: máximo 1 cada 3 segundos, 12 en 10 minutos, 100 en 24 horas. Estos límites reducen spam, pero **no sustituyen CAPTCHA/Turnstile ni defensas avanzadas**.

El linter de Supabase advierte por el `SECURITY DEFINER` público; es una excepción deliberada y requiere una revisión de seguridad de la función si se modifica.

## Validación realizada

- Insert como rol `anon` sobre una publicación temporalmente habilitada: correcto.
- Lectura y cambio de estado como propietario con rol `authenticated`: correcto.
- Transacciones de prueba revertidas mediante `ROLLBACK`; sin contaminar datos reales.
- `anon` sin permisos de lectura ni escritura directa de la tabla; visitante no puede consultar pedidos.
- Vercel build + TypeScript para la rama compartida debe permanecer READY antes de entregar.
- Faltan pruebas manuales en navegador con usuario real, envío desde red móvil, accesibilidad y manejo de picos.

## Próximas fases (no implementadas)

- Antibot avanzado (Turnstile, cuota per-IP/control IP según privacidad, bloqueo manual).
- Notificaciones de nuevos pedidos y respuesta desde el panel.
- Exportación/borrado de datos y política de retención.
- IA de clasificación y borradores de respuesta con aprobación humana, auditables y sin prometidos de ganancias.
- Métricas de conversión visitante → solicitud → presupuesto aceptado.
- Integración con Director y Marketing **solo coordinada** con sus chats.
