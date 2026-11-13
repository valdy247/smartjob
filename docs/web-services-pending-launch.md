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
