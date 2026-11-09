# VMV Call — menú bilingüe de llamadas y número habitual

## Flujo técnico
1. El usuario verifica titularidad y conecta un número Twilio dedicado con recepción `ios_app`. Su número público no cambia ni se porta automáticamente.
2. Para que **todas** las llamadas entren en VMV, el operador debe aceptar y activar manualmente el **desvío de todas las llamadas** a su número Twilio. El desvío condicional **solo** envía llamadas ocupadas/no contestadas; no puede preguntar idioma a una llamada que el propietario contesta en su línea habitual.
3. Al recibir una llamada en `/api/twilio/live/voice`, cuando `SMARTJOB_LANGUAGE_IVR_ENABLED=true`, la ruta de teléfono está activa, multi-tenant está habilitado y el destino es un cliente iOS, se reproduce una introducción personalizable y un menú DTMF:
   - **1, English:** redirige con firma HMAC al puente de traducción inglés ↔ español, con la reserva/consumo de minutos de IA **si el control de billing está habilitado**.
   - **2 o silencio, Español:** conecta directamente por `<Dial><Client>...`, sin relay ni reserva/consumo de minutos de IA.
   - Selección inválida: una repetición; después cuelga sin iniciar traducción.
4. `smartjob_call_sessions.call_mode` registra `direct` o `translated`. El historial de ajustes muestra el tipo; no se graba ni transcribe la rama directa.
5. Premium y Pro con suscripción activa pueden escribir un saludo personalizado desde web o iOS (máximo 180 caracteres). El menú bilingüe estándar se reproduce **siempre**, incluso con saludo personalizado. Starter usa el menú estándar.
6. No se crean cobros automáticos por activar el menú ni por los desvíos. La rama española **no consume minutos de IA de VMV Call**, pero Twilio y el operador pueden facturar minutos de transporte/direccionamiento por separado.

## Seguridad y compatibilidad
- La autenticación de webhook comprueba firma Twilio y AccountSid. La continuación a inglés requiere HMAC ligado a CallSid, id de ruta, caller y idioma; se verifica en cada redirección incluso durante el precalentamiento del puente.
- La ruta directa solo admite receptor nativo iOS; nunca hace un nuevo marcado PSTN a un número que podría estar reenviado al mismo Twilio.
- El guardado de un operador o preferencia no hace cambios en Verizon/AT&T/T-Mobile, no activa un desvío ni modifica rutas aprobadas.
- `SMARTJOB_LANGUAGE_IVR_ENABLED` queda **apagado por defecto**. Se debe activar en Preview después de comprobar la recepción y disponer de rollback.
- La prueba `/api/ios/test-call` demuestra la capacidad de recibir VoIP, **no** el desvío del número personal.
- **No** afirmar que el número público ya recibe llamadas traducidas sin una llamada real de un tercer teléfono al número habitual, con el iPhone bloqueado.

## Cómo validar sin afectar producción
- Instalar build interno iOS 0.3.0 (3) desde Expo EAS.
- Verificar SMS y `voice.register`; llamar al número técnico Twilio desde un tercer teléfono y contestar desde iPhone bloqueado.
- Activar el flag solo en el Preview de esta rama.
- Llamar al número Twilio desde tercero: tecla 2 sin interpretación, tecla 1 con traducción, silencio directo, tecla incorrecta con reintento.
- Validar webhooks Twilio y `call_mode` en historial; comparar saldos antes/después para confirmar **no reserva de minutos para español** y que los segundos de inglés se liquidan **solo cuando el enforcement de prueba está activo**.
- Luego y solo si se acepta el riesgo, activar desvío **de todas las llamadas** en el operador. Verificar desde tercero llamando al número habitual y revisar que la llamada entra a iPhone VoIP sin bucles. Anotar la prueba real.
- Realizar reversión del desvío si no entra, y mantener el piloto anterior disponible.
- No habilitar cobros reales, Stripe live, ni enforcement global sin QA y revisión de cumplimiento.
