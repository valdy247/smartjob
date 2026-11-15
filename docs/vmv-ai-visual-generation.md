# VMV AI Web Studio — generación premium guiada por elecciones visuales

Rama: `feat/vmv-ai-visual-personalization`
Base: `feat/vmv-puck-capabilities`
Estado: preview, pendiente de verificación visual y pruebas autenticadas de generación.
No cambiar main ni publicar borradores automáticamente.

## Objetivo
Reducir el texto que introduce el propietario del negocio y dar control visual sobre diseño, portadas y prioridad comercial.
Conservar los hechos del negocio, imágenes reales, enlaces seguros, editabilidad de Puck y SEO.

## 1. Selección visual con un toque
El usuario puede seleccionar:
- Objetivo: presupuestos, llamadas, citas o pedidos.
- Paleta: seis combinaciones prediseñadas o tres colores personalizados.
- Personalidad: minimalista, impactante, editorial o cercana.
- Portada: foto protagonista, foto + contenido o mensaje primero.
- Prioridad: productos/servicios, galería, historia o contacto.
- Redacción: cercana, exclusiva, directa o dinámica.
- Espaciado: amplio, equilibrado o compacto.
- Tipografía, fotografías y forma de imágenes (ya disponibles).
- Conexiones y funcionalidades (inventario, solicitud de cita, chat).

El formulario se completa con el perfil VMV existente cuando está disponible. Las elecciones se envían como enumeraciones validadas por el servidor; no se ejecuta código generado por IA.

## 2. Mayor calidad de generación
La API de creación de webs invoca `gpt-4.1` mediante un tier `web-premium`, sin modificar el `gpt-4.1-mini` usado por los agentes generales.
- Una sola llamada acotada a 2,500 tokens de salida y tiempo de espera de 42 s.
- Prompt específico de estrategia, claridad, diferenciación, conversión, SEO y estilo.
- Las preferencias se aplican a propiedades de Puck (no solo al prompt):
  - Variante visual, apariencia global, portada, alto, overlay, radio/bordes.
  - Disposición de productos y fotografía, densidad de sección.
  - Orden de secciones; se conservan el hero y contacto.
  - Galería solo cuando hay fotos del cliente.
  - CTA adicional para clientes que priorizan conversiones cuando falta en su plantilla.
- Contenido comercial proviene de datos proporcionados o de copy genérico que no inventa datos. No inventar precios, reseñas, políticas ni servicios.

## 3. Preguntas de ciencia durante la espera
Reutilización de `app/vista-app/marketing/ScienceWaitQuiz.tsx`, ya usado por Marketing.
- Modo `web` con estado «Creando tu página con IA…».
- El quiz es opcional, no bloquea ni retrasa la generación, y no hace llamadas extra a IA.
- Con resultado disponible aparece «¡Tu página está lista!» + «Ver mi página».
- «Omitir» oculta el quiz sin cancelar la solicitud.
- Si la generación falla, el quiz desaparece y se muestra el mensaje de error.
- Soporta móvil y preferencias de movimiento reducido del componente original.

## Costos y límites
Presupuesto objetivo de producto: USD 0.20 por generación, **no un límite contable impuesto todavía**.
La nueva generación no crea imágenes IA automáticamente. Los costos dependen del proveedor y tokens reales; los límites por cuenta existentes permanecen activos.

## QA pendiente para lanzamiento
1. Con cuenta autorizada: completar el flujo con la paleta predefinida; generar y aceptar una web.
2. Probar categorías bakery, construction, professional, beauty y creative.
3. Verificar los modos portada con/sin fotografía y la prioridad de galería con/sin imágenes.
4. Confirmar que selector de llamada, citas, cotizaciones o pedidos genera un CTA funcional.
5. Verificar que los estilos elegidos aparecen en el borrador y persisten al guardar y recargar.
6. Confirmar que el quiz no interrumpe ni cancela la solicitud si se omite.
7. Probar error del proveedor, timeout y cuota agotada: aparece aviso, no se publica nada.
8. Revisar adaptabilidad en iPhone y tablet; zoom del texto, scroll, navegación por teclado.
9. Revisar consumo real de tokens para decidir límites de gasto y margen por cliente.
10. Asegurar que el preview no afecta producción, otras cuentas ni publicaciones.

## Siguiente iteración (fuera de esta entrega)
Métricas de tokens/coste por creación, presupuesto de gasto verdaderamente exigible,
evaluaciones automatizadas de calidad con muestras reales, más composiciones Puck reutilizables,
y generación opcional de una imagen IA autorizada y presupuestada.
