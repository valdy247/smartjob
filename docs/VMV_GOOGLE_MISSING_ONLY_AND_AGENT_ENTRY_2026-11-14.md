# Director: datos precargados y entrada sencilla a las capacidades

## Google Business

Valdy pidió dejar de preguntar de nuevo por el nombre, actividad y otros datos guardados del negocio.

- GoogleProfileWizard recibe un seed del negocio central y muestra solo campos vacíos o inválidos. «Editar» permite abrir los precargados; los botones Editar del resumen también los abren directamente.
- Se mantiene el resumen final con consentimiento. Los datos cargados no se publican automáticamente.
- La actividad interna de VMV se usa como **propuesta pendiente de revisión humana**, con `googleCategorySource=business_activity` y `categoryPendingReview=true` si existe una actividad conocida. No se inventa un ID del catálogo oficial ni se marca como verificada.
- Una actividad desconocida/«other» sigue siendo un dato faltante. El texto escrito por el cliente se identifica como propuesta para revisión y borra cualquier ID oficial anterior; no equivale a selección verificada de Google.
- Los campos de ubicación precargados quedan pendientes de revisión manual; nunca se declara una geocodificación de Google que no se haya realizado. Se conservaron las validaciones y los endpoints oficiales aportados concurrentemente por Marketing.
- La navegación ya no bloquea una pregunta por un enlace inválido que corresponde a otro paso. Los pasos con datos inválidos no se omiten por estar simplemente llenos.
- Las respuestas manuales previas se conservan al completar datos desde el perfil.

## AI Agents

Se retiraron de la pantalla principal el panel «Negocio que estás configurando», la franja de piloto y el bloque técnico de confirmación/vinculación del principal. El acceso a las tarjetas sigue usando `agentSetupDestination`: carga negocio/principal y, si falta configuración, lleva a Cuenta.

La preferencia de negocio se conserva por propietario en sessionStorage. Se acepta solo si sigue perteneciendo a su lista autorizada; no es una fuente de permisos. Los permisos, las líneas y la asignación telefónica no se modifican por esta simplificación.

## Verificación

- Pruebas de renderizado del formulario: nombre/actividad guardados no reaparecen como inputs, ubicación parcial pregunta ciudad, Editar abre campos guardados y valores inválidos siguen editables.
- Pruebas de semillas de perfil y preservación de respuestas; build/TypeScript y auditoría estricta de Marketing.
- Pendiente prueba visual con sesión autenticada. No se declara llamada real ni publicación en Google como comprobadas.

Continuar los cambios sobre la rama compartida, conservar los endpoints de categorías/ubicaciones y no presentar una actividad interna como una categoría oficial ya validada.
