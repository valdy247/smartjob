# AI Agents → Marketing | Anuncio automático

Fecha: 2026-11-18. Rama compartida: feat/vmv-smart-call-control-center.

## Propiedad y alcance

AI Agents posee el asistente conversacional de recopilación. Marketing posee la creación final de anuncios, inteligencia creativa, la UI de Ads Studio, Meta OAuth, imágenes, cuentas, páginas, ubicación Meta, presupuestos, aprobaciones y publicación.
**No se modificó el código del módulo Marketing. No se crean, activan ni publican anuncios desde AI Agents.**

## Implementado por AI Agents

- Tarjeta 'Anuncio automático' para el agente principal ya guardado en el negocio central seleccionado. No crea un segundo agente.
- Interfaz en pantalla pequeña y moderna: robot centrado, preguntas grandes y confirmaciones Sí/No para nombre y web, luego producto/oferta, objetivo, público, ciudad/estado, selección de imagen y resumen.
- Solo lee campos de perfil público del negocio central; comprueba la identidad del usuario y que el agente pertenece al mismo workspace técnico y propietario.
- Lista únicamente inventario **aprobado y activo** del workspace en vmv_ai_catalog_items. Si no hay imagen del negocio, no ofrece usarla; las imágenes del catálogo se ofrecen únicamente con image_path presente.
- Nunca obtiene datos privados del negocio, teléfono personal, credenciales de Meta, precios del modelo ni listas de clientes. No promete disponibilidad manual como stock real.
- 'Generar anuncio' guarda un **brief**, no una campaña, para el propietario autenticado en sessionStorage, con TTL de 30 min y lo redirige a /vista-app/marketing/ads/create?from=ai-agents&business=<id>.

## Contrato para el especialista Marketing: acción pendiente

El helper compartido `lib/vmv-ai-agents/ad-handoff.ts` exporta `consumeAgentAdBrief(ownerId,businessId)`. La página Ads Studio debe:

1. Autenticar al propietario, comprobar que `businessId` pertenece a la misma cuenta y solamente entonces llamar a `consumeAgentAdBrief` (no confiar en el query string ni en los campos del browser).
2. Consumir el brief una sola vez; verificar que negocio, workspace y agente siguen autorizados. Es información de **prellenado no confiable**, nunca prueba de consentimiento publicitario.
3. Prellenar `businessName`, `website`, `offer`, `audience`, `city`, `region`, objetivo e imagen preferida donde corresponda, sin sobreescribir datos que Marketing ya cambió. El producto elegido se debe volver a validar en el inventario.
4. Marketing debe continuar exigiendo página y cuenta Meta, geolocalización válida de Meta, imagen cargada/validada, presupuesto y duración, categoría especial, generación IA y revisión humana. Su API existente nunca debe saltarse validaciones por este brief.
5. Permitir imagen existente del negocio/producto solo tras cargarla desde origen autorizado; si la imagen no puede transferirse, pedir subida en Ads Studio. La propiedad `imageChoice=upload` indica que el usuario la seleccionará en Marketing.
6. La intención `goal` es una preferencia; Meta Ads actual solo admite campañas de clics a sitio web. Si se solicita 'mensajes' o 'ventas', Marketing debe pedir confirmar alternativa compatible en lugar de publicar un objetivo distinto.
7. Si el storage fue bloqueado/caducó, mostrar formulario normal sin prometer que ya se precargó. No leer briefs de otra sesión/otro usuario.

## Riesgos no resueltos

- No se verificó en sesión real el recorrido visual con inventario y un propietario conectado.
- El brief se guarda y navega pero **Ads Studio aún no consume el brief** hasta que Marketing integre el helper.
- La imagen elegida es referencia, no bytes ni URL de Meta; la carga sigue siendo responsabilidad de Marketing.
- La elección de otro nombre de negocio solo cambia el brief; no cambia la propiedad ni autoriza manejar una cuenta externa.
- El conector Meta continúa bloqueado si no existen credenciales/permisos oficiales; publicar y gastar requieren consentimiento explícito independiente.

Prueba estructural: scripts/vmv-ai-auto-ad.test.cjs. Ejecutar además flujo en web con propietario real y productos aprobados.
