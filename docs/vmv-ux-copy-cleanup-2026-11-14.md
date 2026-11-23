# VMV Business — limpieza transversal de microcopy
**Fecha:** 14 de noviembre de 2026  
**Rama compartida:** `feat/vmv-smart-call-control-center`  
**Responsabilidad:** UX/UI. Entrega de interfaz y microcopy, no aprobación de publicación.

## Criterios
- Una sola idea clara por pantalla o sección: títulos breves, botones con verbos, estados identificables.
- Evitar párrafos que repiten el título, letras pequeñas decorativas, mensajes repetidos al precargar información y listas explicativas que no ayudan a decidir.
- Nunca retirar consentimiento, estados de costo, riesgos de publicación, privacidad, verificación de Google, disponibilidad de herramientas, validación de pagos, protección de datos ni estados de error.
- Conservar las claves ES/EN; cambios de texto bilingüe en `lib/i18n/messages.json`, y mantener mensajes no vacíos para el validador.
- Trabajar por archivo con su SHA actualizado para no sobrescribir los equipos paralelos.

## Matriz de pantallas
| Pantalla / recorrido | Acción de UX realizada | Archivos principales | Estado |
|---|---|---|---|
| Acceso, marco web Smart Call y Home | Se retiran bloques promocionales repetidos, introducción extensa y encabezados accesorios. Se conserva la frase traducida de acceso por auditoría de idioma. | `app/vista-app/page.tsx`, `lib/i18n/messages.json` | Código subido y compilación web validada |
| Registro | Cuatro subtítulos genéricos de pasos retirados; etiquetas de datos y requerimientos permanecen. | `components/SignupWizard.tsx` | Código subido |
| Servicios y catálogo | Revisados: catálogo y ofertas siguen identificables, no se elimina información de disponibilidad ni autorizaciones. | `app/vista-app/page.tsx`, `app/vista-app/BusinessServicesPreview.tsx` | Revisado |
| Cuenta, Smart Call, Contactos | Se retiran sobreetiquetas de módulo, repetición del historial vacío; se mantienen plan, estado, contactos y acciones. | `app/vista-app/page.tsx`, `app/vista-app/ContactBook.tsx`, `apps/ios/ContactsPanel.tsx` | Código subido |
| Marketing · solicitar servicio | Intro repetida, textos de pasos, aviso duplicado de categoría y precarga: retirados. | `app/vista-app/marketing/page.tsx`, `MarketingActionCenter.tsx` | Código subido |
| Marketing · Perfil de Google | Categorías, elegibilidad y copia de borrador reducidas ES/EN; campos read-only redundantes retirados; manual review más claro. | `GoogleProfileWizard.tsx`, `GoogleCategoryLookup.tsx`, `lib/i18n/messages.json` | Código subido |
| Marketing · directorios / reputación / diagnóstico | Se retiran textos introductorios duplicados; mini-descripciones concisas y avisos de verificación/uso real conservados. | `DirectoryDiscovery.tsx`, `LocalVisibilityStudio.tsx`, `ReputationStudio.tsx`, `WebRepairStudio.tsx` | Código subido |
| Marketing · solicitudes / negocios / informe | Revisadas áreas de estado, consentimiento, cotizaciones, historiales; no se oculta información contractual. | `marketing/requests/page.tsx`, `marketing/negocios/page.tsx`, `marketing/informe/[id]/page.tsx` | Revisado |
| AI Agents · inicio | Hero compacto; tarjetas muestran nombre y estado, detalles disponibles para lectores de pantalla en etiqueta de acción. | `ai-agents/page.tsx` | Código subido |
| AI Agents · asistente | Subtítulos de etapas y repeticiones removidos; notas de acceso, autorización, IA y cobros condensadas. | `AgentSetupWizard.tsx` | Código subido |
| AI Agents · ventas, reservas, llamadas, pruebas y calidad | Avisos breves sobre límites de pagos, proveedores, llamadas e integración; se retiran instrucciones duplicadas y estados vacíos verbosos. | `CommerceStudio.tsx`, `BookingStudio.tsx`, `CallControl.tsx`, `AgentLiveTest.tsx`, `AgentQualityLab.tsx`, `BusinessProfileDialog.tsx` | Código subido |
| Web Studio · crear sitio | Introducción redundante retirada; avisos de imágenes únicamente cuando hay actividad o mensajes. | `WebSiteIntake.tsx` | Código subido |
| Web Studio · editor y plantillas | Estados, recuperación y comparación de diseños con texto más compacto; mantiene aclaración de no publicar o inventar datos. | `WebBuilderWorkspace.tsx`, `TemplateProposals.tsx` | Código subido |
| Soporte | Encabezado menos repetitivo, estados más cortos, explicación del formulario compacta, privacidad de tickets conservada. | `soporte/page.tsx` | Código subido |
| Finanzas | Encabezados y verificación Stripe más directos, custodia y pruebas de pagos explícitas. | `finanzas/page.tsx`, `apps/ios/FinancesPanel.tsx` | Código subido |
| Admin | Encabezados y sobreetiquetas redundantes retirados, métricas, tickets y estados preservados. | `app/admin/AdminConsole.tsx` | Código subido |
| iOS · Cuenta, activación, Smart Call | Sobreetiquetas redundantes y notas largas condensadas; consentimiento y límites de minutos/pagos conservados. | `apps/ios/App.tsx`, `NativeActivation.tsx`, `SmartCallControlCenter.tsx` | Código subido |
| iOS · AI Agents | Identidad, wizard, capacidades, agenda, ventas y control telefónico compactos. | `AIAgentWizard.tsx`, `AIAgentsStudio.tsx`, `AIAgentsBookingStudio.tsx`, `AIAgentsCommerceStudio.tsx`, `AIAgentsCallControl.tsx` | Código subido |
| iOS · llamadas, intérprete, contactos, otros paneles | Revisión estática de acciones y estados; no se manipulan consensos de datos ni controles de llamada. | `CallScreen.tsx`, `InterpreterPanel.tsx`, `ContactsPanel.tsx` | Revisado; Contactos ajustado |

## Validación y restricciones
1. Vercel: compilaciones READY en la rama tras volver a incorporar `native.signInExplanation` como microcopy breve, y recuperar el texto no vacío de `services.history.emptyHint` exigido por i18n.
2. La rama compartida recibió commits simultáneos de Marketing y Finanzas; los cambios de UX se guardaron con SHA de blob actualizado por archivo. Esos commits externos no se deben atribuir al trabajo de UX.
3. No se probó una sesión autenticada en navegador, interacción real de VoiceOver ni una build iOS reciente. El READY de Vercel **no** verifica iPhone.
4. No se publicaron versiones en producción, ni se modificaron tarifas, Twilio, reglas de pago, tablas o permisos.
5. Antes de aprobar: probar ES/EN, legibilidad 320–430px, lector de pantalla, navegación por teclado, persistencia de borradores, consentimiento y confirmaciones de pago/cotización; revisar capturas reales por pantalla.
6. El registro incluye pantallas inspeccionadas sin cambios porque su información no era redundante o contenía datos importantes. No se afirma eliminación del 100% de cadenas de texto de la aplicación: solo de textos innecesarios localizados y revisados.
