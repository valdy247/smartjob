# VMV Smart Call: Contactos y agenda

## Implementación

- Agenda VMV disponible desde Llamadas > Contactos. Crear, buscar, editar y eliminar.
- Historial: Guardar contacto usa el número de quien llamó solo si está registrado; de lo contrario abre el formulario vacío.
- Datos compartidos entre la preview web y la app iOS para el mismo usuario Supabase.
- No se copian contactos a Apple Contacts sin permiso explícito; aún no existe integración con la agenda del iPhone.
- Sin cambios en el flujo de llamadas, desvíos, número, Stripe o minutos.

## Base de datos

Se aplicó en el proyecto conectado la migración smartjob_owner_contacts_and_call_caller_phone el 11 de noviembre de 2026.

Tabla public.smartjob_contacts: id UUID, owner_id UUID FK auth.users con cascade, name (1-80), phone_e164 (formato + internacional de 8-15 dígitos), notes (máximo 600), created_at y updated_at. Unicidad por owner_id y teléfono. Índice (owner_id,name).

RLS habilitado con políticas de SELECT, INSERT, UPDATE y DELETE para propietario autenticado: owner_id = (select auth.uid()). anon no tiene permisos y authenticated solo puede operar sus filas. La configuración fue comprobada por SQL y el asesor de seguridad de Supabase.

Se añadió caller_phone text nullable a public.smartjob_call_sessions, con constraint de E.164. Las llamadas anteriores permanecen NULL, no se inventan números.

## Captura desde llamadas futuras

La ruta de entrada verificada por la firma Twilio transmite el número a la reserva de una sesión de llamada, validado como E.164. **Esta nueva captura solo empezará cuando el cambio se despliegue en el backend que atiende realmente la telefonía.** El piloto actual usa una versión de backend separada; su producción no se alteró en esta tarea.

## Criterios de aceptación pendientes

1. Con un usuario de pruebas, crear contacto, refrescar y comprobar que persiste.
2. Ver el mismo contacto en otra sesión de la misma cuenta.
3. Buscar, editar, eliminar con confirmación, y verificar validación de teléfonos y duplicados.
4. Con un segundo usuario, demostrar que no puede leer ni modificar contactos del primero.
5. Probar guardado desde llamada con número real y sin número; no inventar identificador para llamadas previas.
6. Probar navegador móvil, sesión expirada y errores de conexión.
7. Ejecutar typecheck, compilar y probar iOS real después de resolver la firma EAS; READY en Vercel no valida código nativo.
