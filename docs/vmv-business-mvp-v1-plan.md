# VMV Business — MVP V1: alcance y plan de implementación

Estado: PLAN PROPUESTO; no autoriza activar proveedores, cobros, publicación de anuncios ni despliegue a producción.
Repositorio: valdy247/smartjob
Rama: release/vmv-business-mvp-v1
Base técnica: feat/vmv-smart-call-control-center @ a79d3e1dddecac93a17e6e67776867568d71371b (código moderno)
Producción actual: main @ 2751666db60fc2fc30bcf4b5d4897cff2954b654 (aplicación anterior, llamadas/traducción)
Objetivo: construir la primera versión funcional con la experiencia enfocada en 6 módulos sin alterar main.

## Visible en V1 — catálogo y navegación

1. Web Services: sitio web, editor, solicitudes y enlaces a Web Studio; conservar datos reales y roles.
2. AI Agents: configuración de agentes, atención de clientes, catálogo/pedidos, reservas y actividades verificadas. Revisar el agente de llamadas y bloquear entradas que dependen exclusivamente de Smart Call.
3. Imagen / Video (incluye VMV Pilot): un SOLO módulo, punto de entrada, wizard, configuración de imagen/voz/duración, revisión de storyboard, aprobación del gasto y biblioteca compartida. Base candidata de video: VMV Motion + Seedance; incorporar funciones útiles de Imagen/Video y Radar; no ofrecer motor Pilot Worker como operativo hasta validar su activación.
4. Smart Quote: presupuestos, propuestas, flujo de agente y gestión de resultados; revisar pruebas y estado de APIs.
5. Marketing: estrategia, contenido, leads, métricas reales y acciones; no inventar resultados.
6. Ads Studio: preparación, revisión y gestión de campañas; ningún anuncio o pago se activa automáticamente.

## Fuera de la primera versión (no borrar datos ni código sin auditoría)

- Smart Call como producto/pestaña independiente, compras de minutos, historial y pantallas telefónicas.
- Traductor, pestaña y flujos de traducción en vivo.
- Instagram Connect como producto/conector independiente, onboarding y accesos.
- Piloto automático de renderizado por worker que devuelve pilot_worker_not_ready; no anunciarlo como disponible.
- Toda otra función experimental o en preparación que no tenga un flujo E2E probado.

Instagram/Facebook como canal PUBLICITARIO dentro de Ads Studio NO es Instagram Connect: la exclusión no elimina la publicidad Meta.
Las funciones de telefonía usadas por AI Agents se revisarán antes de retirar endpoints de Twilio. No se eliminan webhooks compartidos a ciegas.

## Hallazgos verificados del repositorio

- main actual de producción es una aplicación pequeña centrada en llamadas/traducción; crear rama desde main perdería módulos modernos.
- En la rama moderna, app/vista-app/page.tsx todavía muestra Smart Call, Traductor, Instagram Connect y dos tarjetas separadas para Video Generator y VMV Pilot. También depende de useSmartCallAccount.
- VMV Motion Seedance funciona por un flujo distinto de Pilot Render Dock. La API de Pilot Render requiere VMV_PILOT_RENDER_ENABLED=true y su worker; no está lista para uso general.
- AI Agents enlaza actualmente a varios asistentes de vídeo, incluida una ruta de piloto; debe llevar a un solo módulo sin duplicaciones.
- Ads Studio tiene flujo de revisión y NO autoriza publicación ni gasto automático desde su panel.
- Las funciones que aparecen en la UI con etiquetas BETA no se considerarán listas sin pruebas reales.

## Implementación, en orden

### Fase 1 — Contrato de MVP y arquitectura
- Inventariar rutas, APIs, permisos, feature flags y dependencias.
- Definir un único catálogo de módulos y su origen de verdad.
- Decidir expresamente qué hacer con la capacidad de llamada de AI Agents.
- Separar auth/perfil del hook useSmartCallAccount; no consultar balance/telefonía desde la portada V1.
- Mantener sesiones, backups, datos y compatibilidad; preservar rama anterior.

### Fase 2 — Experiencia V1
- Nueva portada y navegación: Home, Servicios, Cuenta; seis módulos visibles.
- Eliminar entradas y accesos de navegación a Smart Call, Traductor e Instagram Connect.
- Ocultar sus paneles en onboarding, perfil, recomendaciones, búsqueda, menú y accesos rápidos.
- Aplicar guardas a rutas directas de módulos pospuestos SIN romper webhooks de otros módulos.
- Corregir redirecciones y enlaces cruzados.

### Fase 3 — Unificar Imagen/Video y VMV Pilot
- Un único acceso "Imagen / Video" con "Generar" e "Historial".
- Un solo wizard de vídeo; separar imagen vs vídeo con decisiones secuenciales.
- Priorizar VMV Motion/Seedance para animación y montaje; integrar Radar, imágenes y biblioteca compatibles.
- No duplicar clientes, jobs o cobros; respetar aprobaciones antes de operaciones pagadas.
- Resolver voces, sincronía, duración, cambios de versiones, exportación y reintentos; pruebas E2E.
- Deshabilitar/ocultar ramas Runway, Kling o Pilot Worker no verificadas, sin destruir datos existentes.

### Fase 4 — Acabado e integración
- Verificar Web Services, AI Agents, Smart Quote, Marketing y Ads Studio en el entorno nuevo.
- Manejar sin simulaciones errores de configuración, permisos y créditos.
- Confirmar que Ads Studio no publica anuncios ni incurre en gastos sin consentimiento.

### Fase 5 — QA y lanzamiento
- Pruebas unitarias, TypeScript, build, móviles, accesibilidad y permisos.
- Pruebas manuales de flujos reales por módulo y presupuesto/control de gasto de imagen/video.
- Despliegue PREVIEW desde release/vmv-business-mvp-v1.
- Aprobar promoción solo tras verificación y autorización expresa; producción/main sin cambios automáticos.

## Criterios de aceptación

- Home y Servicios exponen exactamente los seis módulos V1; un acceso principal a vídeo.
- Ningún usuario ve Smart Call, Traductor o Instagram Connect como módulo V1.
- Las rutas diferidas están protegidas sin romper AI Agents, Web Services ni pagos.
- Un usuario autenticado puede completar los flujos esenciales de cada módulo realmente disponible.
- Ningún costo, publicación ni envío externo sin aprobación humana explícita.
- El mismo video no paga de nuevo por clips reutilizados, y queda guardado en biblioteca.
- Todo lo pendiente muestra un estado real y no promete funcionamiento.
- La nueva rama obtiene build READY y revisión QA antes de decidir el lanzamiento.


## Decisión confirmada: aprobación de imágenes antes de animar (22 nov 2026)

El cliente termina el wizard (tema, público, estilo, duración 15/30/60/120/180 s o personalizado, idioma, voz OpenAI/ElevenLabs, subtítulos, tendencias y propuesta de guion editable, calidad Turbo/Alta, resumen y costos) y confirma la primera operación pagada.

1. El backend crea un proyecto y un job DURABLE con identificador idempotente y configuración congelada por versión.
2. Genera el guion editable, el storyboard y los fotogramas de todas las escenas (por defecto escenas de 5 s), con un progreso real por etapa.
3. Pasa el job a **awaiting_image_approval**; el usuario puede cerrar el navegador, regresar y aprobar cada fotograma individualmente o todos al final. Puede cambiar el guion, la acción o regenerar una imagen con el costo por crédito indicado antes de autorizar el gasto. Una edición que afecta un fotograma aprobado anula solo esa aprobación.
4. **No se genera ningún clip animado antes de que TODAS las imágenes estén aprobadas.**
5. Al aprobar todas las escenas, se realiza preflight de imágenes existentes, permisos y presupuesto y se reserva el costo del trabajo de animación según la política de créditos. Se encola el job durable para el worker, SIN requerir que el navegador permanezca abierto.
6. El worker genera clips en la nube, guarda cada clip exitoso, reintenta fallos con idempotencia y límites y jamás reprocesa clips válidos por recargar/cerrar navegador.
7. A continuación el worker genera UNA narración sincronizada con escenas (si la opción del wizard la requiere), mezcla audio, coloca subtítulos, une todos los clips, verifica duración/calidad y guarda un MP4 final privado en la biblioteca.
8. El progreso visible se restaura desde la base de datos al iniciar sesión: estado real, porcentaje basado en eventos de trabajo (no cronómetro artificial) y ETA orientativa diferenciada de porcentaje. La finalización se muestra incluso si el usuario cerró la pestaña.
9. En caso de fallo, se informa cuál escena/proveedor falló, se preserva todo el material generado y se libera/reembolsa cualquier crédito no consumido según política explícita, sin duplicar cobros.
10. Estados sugeridos: draft → planning → generating_images → awaiting_image_approval → queued_animation → animating → generating_voice → assembling → verifying → completed (o failed/retryable/cancelled).

**Restricciones V1:** solo generación de video; no "crear imagen", "editar foto", "editar video", música, efectos o selector de cambios de voz tras el montaje. Las imágenes son solo fotogramas de un video. No se activan gastos externos sin confirmación. Video original 9:16; tendencias desde YouTube, Facebook, Instagram o TikTok solo si sus contenidos verificables y previews están disponibles conforme a las APIs de origen. El resto debe marcarse no disponible.

**Criterio de aceptación crítico:** iniciar proyecto → generar fotogramas → cerrar navegador → reabrir → revisar/aprobar todos → cerrar navegador → animación/narración/montaje continúan hasta MP4 → historial y descarga al volver. No basta con un MediaRecorder ejecutándose en el dispositivo del cliente.
