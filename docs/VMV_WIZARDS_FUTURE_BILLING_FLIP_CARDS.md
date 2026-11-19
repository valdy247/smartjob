# VMV Business — Idea futura: tarjetas «La mala y la buena noticia» en todos los wizards

**Estado:** propuesta de producto / UX, **NO IMPLEMENTAR TODAVÍA**.  
**Alcance:** todos los wizards de los servicios de VMV Business, actuales y futuros.  
**Origen:** idea del fundador expresada el 18 de noviembre de 2026.  
**No autoriza:** cambios de código, variables, precios, suscripciones, pagos, activación de servicios ni campañas.

## Idea central

Cuando un usuario esté completando un wizard y el backend confirme que **necesita pagar a VMV para continuar** —por créditos insuficientes, plan vencido o falta de acceso de su suscripción—, mostrar una experiencia amigable que no pierda su trabajo.

En lugar de presentar solo «Error: pago requerido», mostrar **dos tarjetas interactivas con efecto de giro**:

1. **«Ver la mala noticia»**: al voltear, explica claramente el motivo específico que impide continuar (por ejemplo, «Se agotaron tus créditos para esta generación» o «Tu suscripción venció»). No mostrar un motivo genérico si conocemos la causa.
2. **«Ver la buena noticia»**: al voltear, explica que **puede resolverlo sin salir del flujo** y ofrece la acción apropiada («Recargar créditos», «Renovar plan», «Activar suscripción» o «Pagar ahora», según el caso).

El efecto de giro debe ser ágil y elegante, respetando el estilo visual actual de VMV y funcionando en iPhone y escritorio. **La información y la solución deben seguir siendo accesibles sin animación**, incluyendo tecnologías asistivas y la preferencia «reducir movimiento». Nunca ocultar información importante tras una animación obligatoria.

## Comportamiento propuesto

1. El cliente avanza por un wizard (ej.: crea un anuncio, solicita un video, prepara una web, etc.).
2. **El servidor**, no el modelo de IA ni el navegador por su cuenta, comprueba sus derechos de uso y créditos antes de cualquier operación facturable.
3. Si puede continuar, el wizard funciona normalmente. **Si no necesita pagar, no mostrar tarjetas ni interrupciones artificiales.**
4. Si requiere pago a VMV, el agente explica la situación en términos sencillos y el wizard ofrece las dos tarjetas para explorar «mala» / «buena».
5. La opción positiva muestra **solo la alternativa de pago o gestión que realmente corresponda a su cuenta**. Incluye información del importe, moneda, renovación o créditos antes de confirmar cuando sean conocidos y aplicables.
6. Pulsar «Pagar ahora» abre el checkout seguro correspondiente (integrado o alojado por el proveedor de pago), sin pedir números de tarjeta al agente y sin ejecutar cobros invisibles.
7. Una vez que el backend **verifique el pago y actualice la suscripción o el saldo**, se retoma el wizard exactamente donde quedó. Si se cancela o falla el pago, el borrador permanece intacto y el usuario puede volver más tarde.

## Casos y textos orientativos

| Caso real confirmado por backend | Tarjeta «Mala» | Tarjeta «Buena» / acción |
| --- | --- | --- |
| Créditos insuficientes | «No tienes créditos suficientes para completar este paso». | «Puedes recargar tus créditos aquí». Botón **Recargar créditos** o **Pagar ahora**. |
| Plan vencido | «Tu suscripción venció y esta función requiere un plan activo». | «Puedes renovarla desde aquí sin perder tu avance». Botón **Renovar plan**. |
| Sin suscripción requerida | «Este servicio necesita una suscripción de VMV». | «Puedes elegir tu plan y continuar». Botón **Ver planes** / **Suscribirme**. |
| Pago anterior fallido o pendiente | «No pudimos confirmar el pago de tu plan». | «Puedes revisar tu facturación y resolverlo». Botón **Gestionar pago**. |

**Nunca mostrar un botón que no lleve a una acción configurada y disponible.** Si el sistema de pagos todavía no está listo, mostrar una explicación franca, conservar el trabajo y dejar clara la disponibilidad.

## Reglas que deben respetar todos los servicios

- **Componente compartido**, no duplicar el mismo sistema en cada wizard. El servicio aporta su tipo de bloqueo, el paso suspendido, el costo o crédito necesario y su acción permitida; el componente aplica las mismas tarjetas y el mismo estilo.
- **Cobro de VMV vs. terceros:** no confundir créditos o suscripción de VMV con gasto publicitario de Meta, tarifas de otros proveedores o pagos del cliente a terceros. En Ads Studio, Meta cobra la publicidad directamente según sus propios requisitos; estas tarjetas solo atienden bloqueos de facturación **propios de VMV**.
- **Veracidad:** los créditos y el plan se determinan por datos del servidor. El agente no inventa saldos, vencimientos, precios, promociones ni aprobación del cobro.
- **Seguridad:** autorización de usuario/negocio, checkout mediante backend, confirmación fiable de proveedor/webhook, idempotencia, comprobación de derechos después del pago y protección contra dobles cargos.
- **Experiencia:** guardar inputs, imágenes, prompts, selección de producto y progreso; opción «Ahora no», sin temporizadores de presión, sin culpabilizar al usuario. No convertir las dos tarjetas en una táctica manipuladora.
- **Accesibilidad:** ambas caras leíbles por lector de pantalla, botones accesibles, control táctil y por teclado, `prefers-reduced-motion`, estados de carga y reintento.
- **Costos:** bloquear cualquier acción consumidora de recursos antes de la confirmación necesaria, no justo después de haber consumido créditos externos.
- **Analítica:** eventos de bloqueo, apertura de tarjetas, checkout iniciado, pago verificado, reanudación y abandono, sin registrar datos sensibles de pago.

## Servicios a cubrir

Cualquier wizard que incorpore facturación propia: AI Agents, Video Generator, Ads Studio (solo suscripción/créditos VMV), Web Services, Marketing y los próximos servicios de la plataforma. Los servicios sin cobros o sin un requisito de pago no deben mostrar esta experiencia.

## Criterios de aceptación antes de implementarlo

- El bloqueo es específico y se explica sin términos técnicos.
- Las dos tarjetas se giran suavemente, conservando claridad visual y accesibilidad.
- La acción correcta depende del motivo real: recarga, renovación, suscripción o gestión de pago.
- Pago cancelado/fallido no borra el progreso ni desbloquea funciones.
- Pago verificado devuelve al usuario al mismo paso y conserva el estado previo.
- No aparecen cargos de VMV ni de terceros por tocar o voltear tarjetas.
- Funciona igual de bien en móvil y escritorio, en español e inglés.
- Respeta la infraestructura central de billing, sin modificar los cobros o gastos de otros módulos.

## Decisión pendiente

Definir más adelante el servicio central de recuperación de pagos, la matriz de derechos/créditos por servicio, las rutas de checkout/portal, los textos finales y el diseño exacto de la animación.

**Recordatorio:** solo idea documentada. No implementar ni activar hasta instrucción expresa del fundador.
