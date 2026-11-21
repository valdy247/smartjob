# VMV Business — contrato de perfil central (Marketing, 2026-11-14)

**Rama compartida:** `feat/vmv-smart-call-control-center`. Este trabajo reutiliza `public.vmv_marketing_businesses`, `public.vmv_marketing_requests`, `smartjob_profiles` y `vmv_ai_businesses`. No crea otra tabla de negocio paralela.

## Identidad y seguridad

- Cuenta (`smartjob_profiles.id`) y negocio (`vmv_marketing_businesses.id`) son entidades distintas. La clave de relación es `owner_id`, nunca el nombre comercial.
- Las fichas del onboarding y AI Agents se proponen como **fuentes candidatas**, identificadas por `source_system` y `source_record_id`; no se fusionan automáticamente por nombre.
- `vmv_marketing_businesses` está protegida por RLS del propietario, y se conserva la FK compuesta `(owner_id, business_id)` en solicitudes.
- Mientras Director no defina el número de negocios por plan, **solo se puede crear el primer negocio central**. Un trigger con bloqueo de fila del perfil serializa creaciones simultáneas. No se borran ni bloquean lecturas/ediciones de negocios existentes al reducir el plan.
- Director debe decidir límites por plan, qué cuenta como negocio adicional y cómo se administra un eventual exceso; no se han inventado precios ni cupos multiperfil.

## Datos que se reutilizan

- Categoría interna `category_id` es de VMV. **No es** una categoría oficial de Google.
- `kind` distingue local, área de servicio y ambos. La dirección del negocio se guarda privadamente; `address_visibility` controla la visibilidad permitida. Para solicitudes Google de área de servicio, la copia omite una dirección residencial.
- Contacto, nombre legal, descripción, URL, redes, zonas, horarios, servicios, productos y rutas de imágenes están disponibles en el perfil. Idioma de interfaz, idioma del negocio y lenguaje del agente son preferencias diferentes.
- La interfaz de Google utiliza `lib/vmv-central-business.ts` para completar únicamente campos aún vacíos. Las modificaciones explícitas del cliente tienen prioridad.
- Se pueden seleccionar y editar fichas centrales en Marketing. Otros módulos deben obtener el negocio **propio del usuario autenticado** y aplicar RLS, no confiar en un `business_id` enviado por un cliente web.

## Solicitudes aprobadas

- La nueva solicitud guarda `business_id`, `business_snapshot`, `confirmed_at` asignado en el servidor y `consent_version='vmv-business-consent-v1'`.
- El snapshot incluye el contenido aprobado y `mediaPaths` inmutables. Los archivos están en `vmv-business-media` (privado), separados de nuevas fotos de solicitud `vmv-google-media` (privado). El cliente no tiene permiso de borrar las imágenes que pudieran tener solicitudes antiguas.
- Si el cliente marca **Guardar también en mi negocio**, se actualizan las correcciones pertinentes del perfil. Sin marcar, se aplican solo a esa solicitud.
- El trigger impide modificar `business_snapshot`, `business_id`, `confirmed_at` o `consent_version` una vez creada la solicitud.
- La publicación, la verificación Google, el cobro y cualquier cambio en sitios/agentes externos requieren pasos y autorizaciones posteriores. Una cotización aceptada no implica un cargo procesado.

## Conexión con otros módulos y pendientes

- **Registro:** reutiliza el nombre, web y demás datos de `smartjob_profiles` como sugerencia. Pendiente comprobar flujo de registro autenticado en dispositivo real; no se tocó el onboarding compartido.
- **AI Agents:** conserva `vmv_ai_businesses` y no cambia agentes activos. Cualquier lectura automática del nuevo perfil debe validarse con el equipo dueño del módulo; no se declara integrada sin prueba real.
- **Web Services:** no se cambian sitios publicados. La integración real futura también debe requerir aprobación.
- **Admin/soporte:** `vmv_marketing_requests` conserva los expedientes y sus referencias; el enlace a la conversación existente es `/vista-app/soporte?source=marketing&id=<request_uuid>`. Falta verificar el expediente completo desde una sesión Admin real.
- **QA:** SQL transaccional verificó alta inicial, bloqueo de alta adicional, rechazo de negocio ajeno, fotos privadas, bloqueo de referencias falsas e inmutabilidad de la copia; todas las transacciones de prueba se revirtieron. El recorrido móvil y la autenticación interactiva requieren prueba de usuario real.

**No ampliar planes ni incorporar módulos externos sin aprobación de Director.**
