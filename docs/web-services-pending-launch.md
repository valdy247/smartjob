# Web Services — solicitudes, evidencias y pendientes de lanzamiento

Propósito: **no perder solicitudes cuando entren otras nuevas.** Cada petición se mantiene en esta lista hasta prueba del recorrido completo. Se trabaja exclusivamente en la rama compartida \`feat/vmv-smart-call-control-center\`. No alterar otros módulos ni la web/dominio actuales de Mayuli Bakery.

Convenciones:
- **Comprobado por prueba automatizada** = test de BD reversible / build o tipado, NO prueba real de navegación.
- **Implementado, pendiente de probar** = está en código pero aún no está demostrado como cliente en móvil y escritorio.
- **Pendiente** = sigue sin implementación o tiene un bloqueo real.
No declarar listo para lanzamiento solo por despliegue READY.

## Solicitudes anteriores conservadas

| Prioridad | Solicitud del usuario | Estado y evidencia |
|---|---|---|
| P0 | Eliminar la foto del campo exacto y no recuperarla tras recarga | SQL \`web_studio_intake_media_delete_roundtrip.sql\` passed; almacena un campo vacío en \`smartjob_web_intake_media\`, sin reintroducir fotografías históricas; prueba en navegador autenticado pendiente |
| P0 | Diferenciar retirar una imagen de la biblioteca vs. retirarla de un campo; no romper otras páginas | SQL \`vmv_web_media_archive_roundtrip.sql\` passed; archivos usados se archivan / ocultan de biblioteca, sin borrar referencias; interacción real pendiente |
| P0 | Logo sin recorte en formulario y en web | \`BuilderImageField.module.css\` y \`web-builder-public.css\` usan \`object-fit:contain\`; verificación visual real pendiente |
| P0 | Productos independientes con foto, título, descripción y precio opcional; guardar tras recarga | **SQL PASS** `vmv_web_intake_products_roundtrip.sql` comprobó dos productos distintos, quitar foto de uno, consultar de nuevo, eliminar otro y permisos; interacción real pendiente |
| P0 | Controles al tocar imagen, texto, botón, título y fondo de sección | **SQL PASS** `vmv_web_context_controls.sql` y `vmv_web_cta_visual_controls.sql`: ajustes conservados en borrador/publicación. El panel ahora recibe eventos Puck (incluido iframe) y muestra Fondo/Título/Botón. **Selección táctil real sin comprobar** |
| P0 | Menú flotante **+** en móvil que inserte elementos compatibles, sin falsas funciones de e-commerce | **Build READY + SQL PASS**: `demos/quick-add` valida 19 tipos con normalizador JSON y Render; `vmv_web_quick_add_roundtrip.sql` comprueba persistencia/publicación de tres bloques. FAB circular/hoja inferior implementados; interacción táctil real pendiente |
| P0 | **Pantalla del editor móvil debe mostrar el diseño primero** | **Implementado, build READY**: cabecera volver/nombre/publicar, página actual, crear página por icono, Ajustes plegados, estado único, SEO en sección colapsada, barra +; responde al ancho del contenedor del simulador. Captura y uso real de móvil pendientes |
| P0 | Estado claro de guardado, borrador vs publicación, recuperación, deshacer/rehacer | Autosave, indicador e historial Puck en código; reconfirmar con sesión real, recarga y versión |
| P0 | Recorrido crear/proponer/editar/previsualizar/publicar/editar conservando fotos y diseño | Pruebas SQL de páginas y publicaciones parciales; QA real móvil y escritorio pendiente |
| P1 | Redes sociales opcionales, primera ayuda elegante de copiar enlace, links reales en sitio | \`WebIntakeSocials.tsx\`, tabla RLS, normalizador y pie público; SQL \`vmv_web_quick_add_roundtrip.sql\` passed para guardar/publicar URL; UX real pendiente |
| P1 | Cambiar plantilla sin pérdida y con vista previa/deshacer | Aplicación segura de tres estilos disponible; la conversión entre las cinco familias, preservando todo el contenido, sigue pendiente |
| P1 | Herramientas IA para descripciones y fotos con control de costo y aprobación | No anunciar proveedor real sin comprobar, tampoco autogenerar sin consentimiento; pendiente flujo verificado y presupuesto |
| P1 | Navegación y páginas internas, enlaces directos, formularios con registro en negocio correcto | Base existente; requiere pruebas de recepción, seguridad, recarga y notificaciones |
| P2 | Dominio: consulta de precio, compra autorizada, DNS/HTTPS, renovar, conexión verificable | Solicitud/cotización inicial en código; compra y gestión completa no certificadas, no comprar pruebas |
| P2 | Comercio: carrito real, cantidades, pedidos y checkout | **No operativo**. Catálogo visual no equivale a tienda; no ofrecer carrito funcional |
| P2 | Otras necesidades históricas: columnas, controles responsive, sección reutilizable, componentes editables, animaciones cuidadas | Columnas en código; secciones sincronizadas y muchas variantes de composición siguen pendientes |

## Protocolo obligatorio por entrega
1. Leer HEAD y SHA actualizado de los archivos, cambios recientes y AGENTS.md cuando exista.
2. Ejecutar pruebas concretas: diseño móvil primero, editor real, recarga, RLS y persistencia.
3. Commit solo de Web Services, SHA en rama compartida, sin force push.
4. Verificar despliegue Vercel para SHA exacto y enlazar preview.
5. Separar **Terminado y comprobado**, **Implementado sin comprobar** y **Pendiente / bloqueado**.
6. No cerrar ni eliminar de esta lista los elementos aún no probados; actualizarla en cada entrega.

## Entrega actual — editor móvil primero (13 noviembre 2026)
**Comprobado por automatización:**
- SQL reversible: `web_studio_intake_media_delete_roundtrip.sql`, `vmv_web_media_archive_roundtrip.sql`, `vmv_web_context_controls.sql`, `vmv_web_quick_add_roundtrip.sql`, `vmv_web_intake_products_roundtrip.sql`, `vmv_web_cta_visual_controls.sql`. Sin registros de negocio permanentes.
- Ruta `/web-studio/demos/quick-add`: validación de 19 tipos Puck, serialización/normalización y Render del sitio público en la compilación. No valida interacción en pantalla.
- Vercel READY para cambios previos de esta etapa; comprobar HEAD final tras cada commit nuevo.
**Implementado sin prueba visual de cliente:**
- Rediseño basado en ancho del Web Studio, incluso el simulador móvil dentro de navegador de escritorio; estado de borrador visible, publicar arriba, selector de páginas, acceso a Ajustes, nuevo formulario compacto de página, SEO detrás de desplegable y ausencia de controles duplicados.
- Menú + móvil con bloques compatibles y carrito marcado no disponible. Control CTA contextuales conectados a fondo/título/botón.
**Pendientes bloqueantes de aceptación:**
- Prueba manual autenticada en móvil y escritorio: primer render sobre página, scroll, legibilidad, apertura/cierre del +, insertar todos los tipos, recargar, deshacer/rehacer, select CTA por zona, publicar, visitar URL, cambiar página y volver, funcionamiento en Vista-App simulador.
- Verificar subidas de archivo en cuenta de pruebas, reordenación, selección/tocado sin errores, pedidos/formularios, notificaciones y auditoría RLS cruzada entre cuentas.
- IA real con consumo y revisión, cambio seguro entre familias, contenido dinámico y comercio completo. **No anunciar como terminado** hasta probar.

## Regla de seguimiento
Las solicitudes futuras se agregan a esta misma tabla o a una nueva sección de entregas; no se eliminan por abrir un nuevo trabajo.


## Solicitud del Director — experiencia móvil real y catálogo (13 noviembre 2026)

Esta solicitud se suma a todos los pendientes anteriores; no los sustituye. Se preserva el sistema de idioma de VMV y las actualizaciones concurrentes de otros módulos.

| Frente | Estado y evidencia |
|---|---|
| Lienzo móvil ancho completo, sin miniatura del escritorio | **Implementado en código**: Puck usa el ancho del contenedor y pantalla completa experimental en modo compacto. El contenedor impide desbordamiento horizontal. Prueba visual autenticada a 360, 390 y 430 px pendiente |
| Diseño visible antes que opciones administrativas | **Implementado en código**: cabecera, selector con crear página, Vista previa y Publicar; SEO/dominios/historial en Ajustes. QA visual autenticada pendiente |
| Selección contextual de fotos, CTA, títulos y botones nuevos | **Implementado en código**: fotos por toque notifican a Puck/inspector; botones ComposeButton tienen texto, URL y estilo contextuales. Botón + solicita seleccionar la nueva inserción cuando Puck reconoce su ID. Interacciones en móviles reales pendientes |
| Fotos sin botones superpuestos ni falsa transparencia | **Implementado en código**: herramientas de imágenes ocultas salvo selección; panel de propiedades con tamaño táctil y posición inferior en móvil. Confirmar comportamiento de iframe/sheet con navegador real |
| Catálogo «Choco flan»: evitar imágenes de otros elementos | **Pruebas Node 9/9 PASS** para IDs estables, reordenación y remoción, serialización y render; creación de propuestas ya no reasigna fotos de portada/galería por índice. **Los datos existentes del cliente no se modificaron**, asociación concreta sigue pendiente de inspección segura |
| Vista pública sin «Agregar fotografía» | **Pruebas Node PASS**: el render público omite las herramientas y los placeholders de edición; productos vacíos se ocultan, el producto sin foto mantiene sus textos |
| Galería múltiple y orden, recorte de portada, logo completo, imagen eliminada que reaparece | **Pendientes anteriores conservados.** No cerrar hasta las pruebas reales de crear, guardar, recargar y publicar sin alterar usos de la misma foto |
| Traducciones | Se conservaron commits concurrentes de Idioma, incluido el catálogo común usado por Puck. No se modificaron archivos de diccionario |
| QA final de móvil y publicación | Ejecutar con sesión de prueba a 360/390/430 px: agregar producto y foto, reordenar, editar título y botón, quitar imagen, recargar, previsualizar y republicar; adjuntar capturas reales y SHA exacto. Un build READY no valida estos escenarios |

**Evidencia reproducible**: `node --test scripts/web-builder-images.test.cjs` pasó 9/9 y `npm run typecheck` pasó en el SHA `9ba8a1351353` (sandbox aislado); Vercel compila automáticamente cada commit. Los QA de interacción autenticada y seguridad de cuenta distinta no se realizaron.

## Incidente crítico: preview /web-studio no carga — 13 noviembre 2026

**Diagnóstico reproducido en Chromium sin sesión:** el deploy previamente comunicado, SHA `a37cef4146f8`, devolvía HTTP 200 y Vercel READY, pero la página terminaba en «This page couldn’t load» por la excepción de cliente `Missing translation variable: title`. El error provenía de `puckDictionary` en `WebBuilderWorkspace.tsx`, que interpolaba mensajes dinámicos de Puck sin los marcadores `title`, `count`, etc.

**Corrección:** el diccionario conserva los marcadores dinámicos para que Puck los reemplace al usarlos. Se modificó solo el código de Web Studio, sin cambiar los diccionarios centrales de Idioma. El acceso sin sesión apunta ahora a `/vista-app?returnTo=web-studio`, y VMV Business regresa a `/web-studio` únicamente después de reconocer una sesión válida. No se acepta un destino abierto.

**Evidencia de navegador real sin sesión (Chromium/Playwright, despliegue SHA `38134a14a6cf`):**
- GET `/web-studio` → HTTP 200 en 360, 390 y 430 px.
- Los tres tamaños muestran «Inicia sesión para crear tu web» y un enlace válido de inicio de sesión. Sin `pageerror` ni solicitudes fallidas; sin scroll horizontal a esos anchos.
- A 390 px, el enlace navega al formulario real de `/vista-app?returnTo=web-studio`, visible y sin errores de JavaScript.
- `node --test scripts/web-studio-startup-i18n.test.cjs` → 2/2 PASS para diccionario español/inglés y destino seguro.
- **La carga del editor con sesión autenticada, sus datos privados y todo el circuito de edición/guardado/publicación permanecen pendientes de prueba real**. No usar READY ni HTTP 200 por sí solos como aceptación.
- No se modificaron fotografías ni registros de clientes.

Los anteriores pendientes de experiencia móvil, imágenes, contenido dinámico y funciones comerciales se mantienen intactos.


## Incidencia UI: tocar «Agregar fotografía» no abría el selector (13 noviembre 2026)

**Causa comprobada con Chromium/Playwright en el lienzo real de Puck (sin cuenta):** el texto aparecía en un contenedor con `pointer-events:none` a causa de las reglas de selección del canvas. Además, Puck recrea su iframe al seleccionar un bloque; un evento enviado únicamente después de `requestAnimationFrame` podía perderse.

**Corrección de Web Services:** el placeholder es un botón con eventos táctiles/teclado; los blancos de imagen vuelven a admitir eventos de puntero solo en modo edición. Tras seleccionar el bloque, el evento de abrir biblioteca se reintenta desde el window anfitrión hasta que aparece el diálogo, incluso si Puck recrea el iframe. El selector utiliza la biblioteca compartida existente, mantiene el ID estable del producto y no elimina referencias guardadas en otras ubicaciones.

**Prueba de interacción aislada (sin autenticación):** primer toque abre el diálogo «Seleccionar imagen» a **360, 390 y 430 px**, con pestañas «Mis imágenes» y «Subir fotos» y un input de archivo. No hubo errores JavaScript ni desplazamiento horizontal. Al tocar la segunda tarjeta, el inspector seleccionó «Torta» (índice 1) y no «Choco flan». Se probó usando el código actualizado en un entorno local con Next y Puck real; **no es una prueba de subida efectiva a Storage, guardado de draft o publicación desde una sesión autenticada**.

**Preview del código corregido:** SHA `03d3cb349a5ddf984417d799e6626528525f38b9`, Vercel READY; `/web-studio` dio HTTP 200 y mostró el enlace de iniciar sesión sin errores JS en Chromium sin sesión. QA autenticada pendiente.

Todos los pendientes anteriores de galería múltiple, portada, logo, seguridad de archivos, catálogo y rediseño móvil permanecen abiertos donde corresponda.
