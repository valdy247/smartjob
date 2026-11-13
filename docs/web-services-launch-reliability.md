# Web Services — lanzamiento: confiabilidad antes de expansión

Fecha de verificación: 13 noviembre de 2026. Solo rama `feat/vmv-smart-call-control-center`; no promoción a producción. `AGENTS.md` en la raíz de la rama no está presente (404). No se han modificado Home, navegación compartida, Smart Call, AI Agents ni Marketing.

## Corregido e implementado

- El selector de imagen distingue **Eliminar de este lugar** (limpia solo el campo) y quitar el archivo de la biblioteca. Si otra publicación, borrador o versión conserva el archivo, la biblioteca lo oculta sin destruir las referencias; `smartjob_web_media_hidden` es privada al backend.
- El formulario de creación no reordena las fotos cuando se elimina la de portada: los índices de portada y foto de productos permanecen estables.
- Autosave guarda solo el borrador con control de revisión, muestra el estado, tiene una copia local recuperable por cuenta/página y requiere una publicación separada para que se vea en público.
- Puck muestra botones Deshacer y Rehacer usando su historia propia, además de restauración de versiones publicadas.
- **Cambiar diseño** muestra Actual/Propuesta; solo cambia propiedades de presentación y comprueba que se conserven los IDs, bloques, textos, fotos, precios y elementos. Requiere aplicar explícitamente y ofrece revertir el cambio de diseño. No es todavía una conversión entre familias que reemplaza la estructura completa.
- Portadas sin foto y secciones sin contenido permanecen accesibles en Puck, pero las páginas públicas ya no muestran los mensajes internos de carga.
- Idioma de la web `es/en` almacenado en la raíz publicada, separado del idioma de la interfaz VMV. Titulares y descripciones SEO proceden del snapshot publicado.
- Cabecera, menú, logo y pie proceden del componente común `WebsiteChrome`, utilizado por la web pública y por la vista previa en el estudio. La vista previa del formulario reproduce los controles sin poder enviar solicitudes.
- Dos demos ficticias, sin registros ni operaciones comerciales reales: `/web-studio/demos/launch/products` y `/web-studio/demos/launch/services`. Ambas comparan el mismo contenido antes y después de cambiar estilos; la compilación valida que cinco ofertas y las secciones se conservan.

## Evidencia

`supabase/tests/vmv_web_launch_two_businesses.sql`: **PASS**; crea de manera reversible una repostería y una empresa de servicios, publica tres páginas en total, retira una foto de un producto que aparece también en portada/galería, comprueba que no vuelve tras guardar/publicar, cambia color/título/orden, restaura una versión sin republishing implícito, verifica acceso público y aislamiento de los borradores. La transacción termina en `ROLLBACK`: no se dejan negocios ficticios ni se toca Mayuli Bakery.

`supabase/tests/vmv_web_media_archive_roundtrip.sql`: **PASS**; verifica que la imagen referenciada se protege en almacenamiento sin dar a los clientes permisos de lectura o borrado de la tabla de archivos ocultos.

Los despliegues Vercel `READY` verifican la compilación y la generación de rutas Next.js, **no** un navegador autenticado. No se han obtenido capturas verificadas.

## Bloqueadores para declarar finalizado

- Falta el recorrido interactivo real con sesiones de prueba en teléfono y escritorio: elegir propuesta, editar, subir/reemplazar y quitar fotografías, recargar, recuperarse tras desconexión, deshacer/rehacer, comparar y publicar, inspeccionar diseño a los anchos móviles, teclado y enlaces.
- Cambiar completamente de *familia* de plantilla conservando todas las secciones diferentes de manera automática todavía no existe. Hoy solo se cambia con seguridad el **estilo visual** del documento.
- Formulario público guarda solicitudes por negocio, pero faltan notificaciones al propietario verificadas y administración de permisos/integraciones comerciales adicionales.
- El generador de texto con IA no está comercialmente habilitado ni se anuncia como funcional: falta un flujo de validación de respuesta, costo/consumo claro y aprobación humana. El piloto de **imágenes** es independiente.
- Compras de dominio, checkout, inventario, reservas y pagos externos no fueron activados ni probados.

Regla: nunca declarar validado un flujo por teléfono/escritorio basándose solo en builds, tests SQL o el demo estático.
