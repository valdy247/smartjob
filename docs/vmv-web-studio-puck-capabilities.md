# VMV Web Studio — integración de capacidades Puck 0.24

Rama de trabajo: `feat/vmv-puck-capabilities`. Rama de origen: `feat/vmv-smart-call-control-center`.
No fusionar con producción antes de validación visual y pruebas con borradores reales.

## Capacidades incorporadas

1. **Composición del editor:** modo optativo **Puck Pro** en escritorio. Renderiza `Puck.Components`, `Puck.Preview`, `Puck.Outline` y `Puck.Fields`. Volver al diseño clásico mantiene la instancia de Puck y su historial.
2. **Texto enriquecido:** bloque `RichText` basado en el campo nativo `richtext`; admite formato editorial con sanitización de etiquetas y enlaces antes de guardar o publicar.
3. **Reordenación nativa:** arrastre estático, manejadores de arrastre y árbol movible en Puck de escritorio. En móvil se conserva la reordenación propia hasta confirmar equivalencia funcional.
4. **Viewports nativos:** 390px (móvil), 768px (tablet), 1440px (escritorio) en el editor Puck.
5. **Capas:** árbol nativo en Puck Pro y sección **Capas de esta página** en el menú móvil, con acceso a elementos anidados.
6. **Campos dinámicos y fuente de datos:** `resolveFields` para opciones dependientes del diseño del hero y productos. Bloque `SitePageLink` con campo `external` que consulta páginas *publicadas* de los sitios del usuario autenticado, respetando el filtro `owner_id`. No publica borradores como enlaces.
7. **Protección y plugin:** `locked` por bloque, `resolvePermissions` para prevenir movimiento, duplicación y eliminación en Puck, controles equivalentes en móvil y plugin de revisión básica del contenido.
8. **Pestañas y grupos:** `FieldTab` y `FieldGroup` integrados mediante puente cliente para evitar dependencias de editor en el bundle RSC de las páginas públicas.

Complemento: **Sincronizar estilo** en móvil aplica una copia puntual del estilo del elemento seleccionado a otros similares de la página, omitiendo elementos protegidos. Es una copia de una sola vez, **no** un vínculo que cambie automáticamente en el futuro.

## Pruebas antes de fusionar

- Abrir un borrador existente con imágenes, secciones y páginas publicadas. Alternar Puck clásico / Puck Pro sin perder cambios ni historial.
- Editar un RichText con negrita, listas, títulos, enlaces externos y alineación. Guardar, recargar y comprobar la vista publicada.
- Cambiar entre 390, 768 y 1440px; reorganizar un bloque de columna desde el panel de capas.
- Proteger un bloque; confirmar que no puede ser eliminado o arrastrado y que se puede desbloquear.
- Probar pestañas de HeroVisual y OfferingGrid; confirmar que los campos ocultos por `resolveFields` no destruyen sus valores.
- Enlaces externos: usuario autenticado, ninguna página publicada, múltiples sitios, y enlace válido a una página publicada.
- En iPhone: abrir Capas, seleccionar un objeto difícil de tocar, editar y recuperar el menú central. Probar Sincronizar estilo para texto, botón e imagen y después Deshacer.
- Confirmar que el hero tipo `cover` sigue ocupando el área completa y que producción permanece intacta.

## Límites deliberados

- El panel móvil conserva su interfaz personalizada; el modo de composición completo de Puck es una opción de escritorio, no un reemplazo forzoso en iPhone.
- La selección `external` y la edición avanzada RichText están disponibles desde los campos nativos de Puck. No se ha conectado un CMS externo de terceros sin autorización.
- La copia de estilos afecta **solo a la página actual**, nunca publica automáticamente ni modifica las otras páginas del negocio.
- La compilación Vercel y TypeScript no sustituyen la prueba táctil y visual en un iPhone real.
