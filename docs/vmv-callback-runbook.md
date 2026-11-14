# VMV Smart Call — devolver llamada por el número del negocio

## Función

En Llamadas > Historial, un usuario autenticado puede devolver una llamada de cliente previamente recibido en su línea Twilio:
1. La preview web o iOS pide confirmación explícita.
2. Backend valida sesión, propiedad del historial, plan y línea iPhone activa.
3. El número del cliente se toma del campo caller_phone almacenado desde el webhook Twilio firmado. Si falta, la acción "Recuperar número" consulta **solo** el CallSid original a Twilio, verifica cuenta y número Twilio destinatario y copia el From verificado. No se utiliza un número arbitrario proporcionado por el navegador.
4. El backend solicita a Twilio llamar primero a client:sj_[ownerUUID], ya registrado por PushKit y el SDK de voz existente.
5. Cuando el dueño acepta la invitación, un webhook Twilio firmado consume una sola vez la solicitud y devuelve TwiML Dial con callerId igual al número Twilio del negocio. El cliente ve el número empresarial.
6. La llamada es normal, sin traducción ni transcripción. No descuenta minutos del contador de traducción; sí genera costes de llamada de Twilio.

## Seguridad

- Deshabilitada en producción. Solo se habilita cuando SMARTJOB_CALLBACKS_ENABLED=true y VERCEL_ENV=preview, y únicamente en el backend de piloto con credenciales correctas.
- Requiere un usuario Supabase con perfil VMV, plan admitido, ruta iOS asignada y vigente y coincidencia con TWILIO_NUMBER del entorno.
- Los destinatarios del piloto se limitan a +1 de NANP, se excluye +1 900. El negocio y el cliente no pueden ser iguales.
- Nunca se acepta un To arbitrario. CallSid del historial debe pertenecer al dueño.
- Máximo 4 intentos/hora, 12/día, una devolución activa por dueño, expiración de solicitudes; duración del enlace de cliente limitada a 10 minutos.
- Las solicitudes están en smartjob_callback_requests, RLS activado, sin grants de anon o authenticated; solo clave de servidor. Webhooks de puente y fin verifican HMAC Twilio, AccountSid, From, To, CallSid y claim atómico one-time.
- Las solicitudes duplicadas o expiradas nunca inician un Dial al cliente.
- El backend web /api/vista-app/callback delega únicamente al piloto fijo y vuelve a verificar el bearer y la cuenta.
- No se alteran los webhooks de llamadas entrantes ni el enrutamiento del traductor.

## Pruebas

1. Con la cuenta piloto autorizada, entrar a la web y confirmar que GET /api/ios/callback responde available true.
2. Crear una llamada real desde un número externo al Twilio registrado para validar la captura caller_phone. No se puede generar un número verificado desde un registro antiguo sin fuente Twilio.
3. Pulsar Devolver llamada y aprobar la confirmación. Verificar que suena el iPhone VMV, que solo tras contestar se llama al cliente, y que el cliente ve el número de empresa.
4. Confirmar sin traducción ni cambio en los minutos de traducción. Comprobar que los cargos Twilio están en cuenta sandbox y no se cargan a tarjetas Stripe.
5. Probar negativa: sin token, otro usuario, CallSid inexistente, número internacional, número privado, 5 intentos por hora, dos llamadas simultáneas y webhook sin firma.
6. Probar que un intento rechazado, no contestado o completado libera el bloqueo de devolución activa.
7. Para llamadas previas, pulsar Recuperar número. Si Twilio ya no retiene el CallSid, mostrar que no fue posible en vez de inventar un número.
8. Ejecutar compilación nativa, TestFlight y llamadas reales en iPhone con permisos Expo/Apple de propietario; READY en Vercel no prueba CallKit ni entrega PushKit.

## Despliegue

La API activa se conecta a la rama de piloto feat/live-v2-production-foundations que tiene credenciales de Twilio en Vercel Preview. La UI de VMV Business está en feat/vmv-smart-call-control-center. Ambas son ramas de prueba. Ningún despliegue se ha fusionado ni promovido a producción.
