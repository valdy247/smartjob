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
| P0 | Productos independientes con foto, título, descripción y precio opcional; guardar tras recarga | \`WebIntakeProducts.tsx\` y tabla RLS; verificaciones automáticas del catálogo y sesión en navegador pendientes |
| P0 | Controles al tocar imagen, texto, botón, título y fondo de sección | Imágenes y textos añadidos; SQL \`vmv_web_context_controls.sql\` passed. Verificar y completar selección contextual del botón, título y zona de fondo, sin confundir la sección con su imagen |
| P0 | Menú flotante **+** en móvil que inserte elementos compatibles, sin falsas funciones de e-commerce | \`BuilderQuickAdd.tsx\` con elementos Puck, carrito sólo como no disponible; SQL \`vmv_web_quick_add_roundtrip.sql\` passed para tres bloques y publicación, interacción real en móvil pendiente |
| P0 | **Pantalla del editor móvil debe mostrar el diseño primero** | Pendiente reorganizar a cabecera compacta (volver/nombre/publicar), selector de página y +; SEO, solicitudes, historia y dominios dentro de Ajustes |
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

## Entrega en curso
Compactar la interfaz móvil del editor, revelar vista de la página antes que los ajustes, y verificar que el + inserta bloques que sobreviven al normalizador, guardado y publicación. Revisar los controles contextuales CTA y RLS de productos como dependencia.
