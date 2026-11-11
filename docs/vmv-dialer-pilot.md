# VMV Smart Call — teclado, historial y contactos

Fecha: 2026-11-11. Ramas de prueba (no producción).

## UX

Llamadas ya no muestra el antiguo encabezado SMART CALL / Llamadas ni el resumen de la línea. La navegación interior es solo por iconos accesibles:
- ⌨️ Teclado (predeterminado)
- 🕘 Historial (filtros, devolución de llamada y guardar contacto)
- 👥 Contactos (agenda privada VMV con crear, buscar, editar y eliminar)

La información de cuenta, saldo, ruta y plan sigue disponible en Servicios → Smart Call y Cuenta. Se eliminó solamente su repetición dentro de Llamadas.

## Llamadas salientes desde el teclado

Se construyó un teclado real en la preview web y en la app nativa:
- POST /api/vista-app/dial → proxy autorizado → POST /api/ios/dial en la rama piloto.
- El servidor verifica usuario Supabase, disponibilidad del plan, ruta de iPhone, número empresarial propio e identidad de servicio.
- Destino introducido manualmente en formato +1; Twilio Lookup V2 Basic valida que sea un número **de Estados Unidos**. No permite llamar a números internacionales, números especiales ni servicios premium +1-900.
- Crea una solicitud en smartjob_callback_requests con request_kind=dialer, source_bridge_sid=NULL y destino verificado desde Twilio Lookup. La tabla tiene RLS, sin permisos para anon/authenticated.
- Primero Twilio llama al iPhone registrado como client:sj_{owner}; una vez contesta, el webhook firmado Twilio sirve <Dial callerId=numero-VMV> al destino. El cliente ve el número empresarial, no el personal.
- Es una llamada **normal**, sin traducción. Su costo Twilio sí se factura al negocio y **no** se descuenta del saldo de traducción.
- El usuario confirma antes de iniciar, y solo puede iniciar una solicitud activa; 4 intentos/hora, 12/día, duración máxima 10 minutos.
- En Vercel el flag SMARTJOB_DIALER_ENABLED está habilitado **solo en la rama Preview feat/live-v2-production-foundations**, con aislamiento adicional de suscripción y cuenta piloto. No se habilitó en producción.
- El backend sigue sin aplicar el futuro límite de 150 minutos normales de Starter. **No se debe comercializar esa cuota como un saldo implementado.**

## Verificaciones

- Migración SQL aplicada y verificada: origen "history" exige CallSid; origen "dialer" no permite CallSid. Reglas RLS activas; anon y authenticated sin acceso directo.
- Next.js preview y backend piloto se construyeron en Vercel READY.
- La página web /vista-app devuelve HTTP 200.
- Rutas de llamada GET sin token devuelven HTTP 401, como deben.
- **Pendiente:** prueba telefónica real de extremo a extremo con cuenta piloto, iPhone con PushKit conectado y número real estadounidense; verificar caller ID, audio, estado/timeout, cargos Twilio y bloqueo cuando el plan no está activo.
- **Pendiente:** compilar, firmar y probar iOS nativo en TestFlight, que no se valida con el build Next.js.
- **Pendiente:** contabilidad independiente de minutos nacionales antes de ofrecer 150 minutos como cuota comercial.

No se cambió el flujo de llamadas entrantes ni el traductor.
