# VMV Business — Anuncios por AI Agents (única vía de creación)

**Rama compartida:** `feat/vmv-smart-call-control-center`. **Estado:** Preview implementado, no probado con una sesión Meta de usuario final ni desplegado a producción.

## Responsabilidades

- **AI Agents** es dueño exclusivo del alta y configuración de campañas nuevas desde UI.
- **Marketing** conserva historial, seguimiento, campañas pausadas, autorización de publicación, métricas, cumplimiento y todas las APIs de Meta.
- La ruta Marketing → "Crear campaña" redirige a AI Agents. Acceso directo al antiguo formulario de Marketing no ofrece un segundo flujo de creación sin un traspaso legítimo; la ruta de compatibilidad sigue para otros borradores de agentes anteriores.
- Ningún anuncio se publica ni genera gasto automáticamente.

## Recorrido actual

1. Pantalla de asistente inmersivo sin chrome de AI Agents: robot, pregunta, opciones, progreso y retorno.
2. Validación del negocio y web HTTPS.
3. Selección múltiple de productos aprobados y servicios, oferta editable, objetivos y audiencia.
4. Cuenta y página de Facebook: la API de Meta verifica la autorización.
5. Ciudad escrita y estado elegido de 51 opciones: "Verificar ciudad con Meta" abre un diálogo modal desenfocado con coincidencias verificadas en el estado elegido; tocar un resultado conserva la llave de ciudad y pasa a imagen, sin botón Continuar.
6. Imagen JPG/PNG ≤2 MB subida directamente a la cuenta Meta mediante API de Marketing; indicador mientras la operación está pendiente, éxito solo con hash confirmado.
7. Generación automática de título y mensaje con la API de IA; se pueden editar. No se ofrece el botón "Regenerar" una vez generado.
8. Presupuesto diario de 5 a 250 USD, duración de 1 a 30 días, máximo de 7.500 USD, UTM opt-in.
9. Revisión integral, casilla explícita de no pertenecer a categorías especiales, legitimidad del texto y derechos de imagen.
10. **Enviar anuncio** confirma por separado el presupuesto máximo. AI Agents llama primero al endpoint existente `/api/marketing/ads/meta/campaigns` con `operation=draft` e idempotencia; después con `operation=create_paused`, `confirmPaused=true` y importe aprobado. Los anuncios y grupos se crean **PAUSED**, nunca activos. Se abre historial.
11. La activación real requiere un consentimiento diferente y el control operacional de Marketing: `VMV_ADS_META_PUBLISH_ENABLED`, allowlist del propietario y confirmación explícita `PUBLICAR`. El agente **jamás** llama `operation=activate`.

## Condiciones de integración

- No introducir una segunda UI de alta en Marketing.
- Conservar toda la validación del backend: dueño autenticado, cuenta autorizada USD, página, ciudad verificada en Meta, imagen autorizada, URL HTTPS, límites de presupuesto, categoría especial, acciones idempotentes.
- La selección múltiple orienta el texto creativo. **Meta solo acepta OUTCOME_TRAFFIC en el piloto**, aunque el usuario marque mensajes o ventas; no declarar que estos objetivos fueron programados en Meta.
- Si falla la creación pausada tras guardar el draft, comunicar el estado incompleto, no simular éxito ni repetir cargos. Historial de Marketing permite revisar el resultado.
- La web iPhone Expo firmada todavía requiere QA por separado; estos cambios corresponden al flujo web responsive.

## Verificaciones

- Compilación y pruebas de `npm run build` en Vercel Preview para rama compartida.
- Pruebas estructurales `scripts/vmv-ai-auto-ad.test.cjs` y `scripts/vmv-agent-ad-review.test.cjs` con validación de separación entre draft/PAUSED/activate.
- Pendiente: prueba autenticada completa con cuenta Meta, imagen real, selección de ciudad, aceptación de políticas y resultado de draft/PAUSED. No tocar producción antes de aprobar.
