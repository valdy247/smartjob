# VMV Business · Home ≠ Servicios (14 noviembre 2026)

Rama de integración: `feat/vmv-smart-call-control-center`. No autoriza lanzamiento en producción ni cambios de telefonía/pagos.

## Decisión de producto

**Home = panel operativo del negocio. Servicios = catálogo de funcionalidades.** Ambos mantienen la identidad pastel/morada, pero ya no renderizan los mismos productos como pantallas duplicadas.

| Vista | Objetivo | Contenido respaldado |
|---|---|---|
| Home web | ¿Qué sucede en mi negocio? | Nombre del negocio de `smartjob_profiles`, estado real de Smart Call (solo si `summary.line.ok`), minutos y conteo de llamadas de respuestas reales, últimas dos llamadas de `smartjob_call_sessions`, accesos rápidos a Traductor y AI Agents y enlace a historial |
| Servicios web | ¿Qué herramientas puedo abrir o explorar? | Buscador; filtros Todos, Comunicación, Digital, Crecimiento; Smart Call/Traductor/Web Services/AI Agents/Marketing; catálogo adicional plegable y ofertas por planes/pago único |
| Home iOS | Estado operativo | Nombre existente de `smartjob_profiles.business_name` cuando está disponible, estado/minutos/uso de endpoints autenticados, últimas llamadas de RLS, dos accesos rápidos y ruta a historial |
| Servicios iOS | Herramientas, no dashboard | Buscador, cuatro filtros y cinco entradas principales; ofertas secundarias plegables; apertura de los mismos destinos ya soportados |

## Principios de integridad

- Un número, estado o balance **no se infiere** a partir del diseño. Datos faltantes se muestran como `—` o «No disponible».
- El historial es de la cuenta autenticada y usa las consultas existentes protegidas por RLS. En iOS se ejecuta la lectura existente también al abrir Home, con el mismo control de identidad del servicio.
- «Piloto» y «Beta» describen estado de producto, **no** habilitación de un servicio pagado para esa cuenta; no se añade el filtro «Mis servicios» sin datos de permisos/activaciones verificables.
- Las ofertas adicionales conservan sus flujos de edición, borrador, consentimiento, guardado y autorización. La búsqueda no escribe datos.
- La interfaz habla ambos idiomas mediante `lib/i18n/messages.json`. La voz hablada de Smart Call y los idiomas de agentes no se alteraron.
- El iPhone conserva el traspaso al espacio web para AI Agents y Marketing; no se presenta como funcionalidad nativa implementada.

## Verificación

- La compilación `next build` se ejecuta en los previews automáticos de Vercel, incluyendo las auditorías de traducciones y la comprobación de separación entre Home y Servicios en `scripts/check-services-i18n.mjs`.
- No se realizó prueba autenticada con capturas de pantalla ni prueba manual de navegación en un iPhone real. **READY web no valida la compilación nativa de Expo**.
- Las compilaciones EAS iOS previas permanecían bloqueadas por credenciales/permisos Apple; evitar afirmar QA o lanzamiento de iOS.
- Los módulos Marketing, AI Agents y Web Services tienen responsables paralelos; no se modificó lógica de compras, llamadas, bases de datos o permisos.

## QA siguiente antes de producción

1. Web 320/360/390/430 px; buscar producto principal y oferta adicional, categorías y resultado vacío; comprobar ES/EN, foco y teclado.
2. Cuentas con y sin línea conectada, saldo cero, saldo no disponible, ningún historial, una llamada y varias llamadas; verificar que no se inventa un estado.
3. iPhone real: Home, retorno desde Smart Call, botones Traductor/AI Agents, cambio de pestaña, búsqueda de «Google» y carga de ofertas, VoiceOver y safe areas.
4. Verificar sesión de web al abrir módulos desde iOS: nunca compartir tokens mediante URLs.
5. Agregar actividad de Marketing/AI Agents a Home solo cuando exista consulta multi-tenant autorizada, con indicadores reales y permisos verificados.
