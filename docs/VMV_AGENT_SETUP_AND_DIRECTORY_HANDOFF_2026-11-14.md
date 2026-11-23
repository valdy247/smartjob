# Director: completar agente desde Cuenta y precargar directorios

## Solicitudes de Valdy

1. Tocar una capacidad con el agente incompleto debe llevar a Cuenta, mostrar «Termina de configurar tu agente» y permitir terminarlo allí.
2. Visibilidad local estaba mostrando una ficha vacía en lugar del negocio central guardado.

## Cambios

- `agentSetupDestination` reutiliza `inspectAgent` para distinguir configuración requerida de activación telefónica/permisos/pagos. Las tarjetas llevan a `/vista-app?tab=account&setup=agent&business=ID` cuando falta negocio, principal o configuración requerida; con agente configurado, abren su función.
- Cuenta abre su pestaña desde el enlace y abre el editor del principal del negocio autorizado. Un ID no perteneciente a la lista del propietario no selecciona otro negocio silenciosamente. Si falta negocio, primero lo configura y después abre el agente. Elegir un principal antiguo incompleto continúa con su edición, sin crear otro.
- Cancelar o guardar consume la apertura automática; no vuelve a abrirse el modal al regresar a Cuenta. La navegación normal retira la pestaña Cuenta del enlace al salir.
- `SavedLocalVisibility` consulta `vmv_marketing_businesses` para el usuario autenticado. Un negocio se carga automáticamente; varios requieren selección explícita. Muestra errores de carga en vez de representar un perfil inexistente.
- La ficha reutiliza nombre, categoría, teléfono, ciudad, región, web, descripción y horarios Monday-first. Solo copia calle y postal si la dirección está marcada pública y el negocio no es de área de servicio.
- Los cambios locales de la ficha se mantienen separados por negocio y no sobrescriben el perfil central. «Editar perfil del negocio» reutiliza su editor existente. Cerrar sesión limpia los datos cargados y ajustes locales.
- La ficha de directorios sigue siendo preparación manual: no se declara publicación ni verificación automática.

## Validación

- 4 pruebas del acceso a configuración: principal ausente, incompleto, completo y navegación interna.
- 3 pruebas de precarga de directorios: campos/horarios, dirección privada y separación entre negocios.
- Compilación, TypeScript y comprobación estricta de traducciones de Marketing.
- Pendiente el recorrido visual autenticado y una prueba real con varios negocios. Estos cambios son web, no una publicación del binario de iPhone.

Conservar los cambios concurrentes de UX, Marketing, Idioma y agentes. No sustituir permisos del servidor por el control visual de configuración.
