# VMV Business — Auditoría UX/UI inicial (13 de noviembre de 2026)

**Responsable:** UX/UI VMV · **Rama:** `feat/vmv-smart-call-control-center` · **Estado:** auditoría estática de web e iOS, primera corrección web entregada.

> Esta auditoría se basa en archivos reales de GitHub y en los resultados de compilación. No representa una sesión autenticada, una inspección visual en un navegador real ni una prueba en un iPhone. La imagen de referencia citada en el encargo no estaba adjunta junto al texto recibido; se aplicó únicamente la dirección visual descrita: fondos claros, tarjetas pastel, navegación cómoda y poco texto.

## Preparación y coordinación

- Repositorio revisado: `valdy247/smartjob`; rama compartida verificada antes de modificar.
- El árbol remoto revisado no contenía ningún `AGENTS.md` aplicable. La API de GitHub no permite comprobar cambios locales no confirmados que otros colaboradores mantengan en sus equipos.
- Revisados los commits recientes de AI Agents, Web Studio, Idioma y Marketing. Estos módulos estaban recibiendo cambios simultáneos; no se modificaron sus archivos.
- La UI web reside principalmente en `app/vista-app`, `app/web-studio` y sus módulos; la app iOS nativa tiene implementación independiente en `apps/ios`. La compilación web no valida el comportamiento nativo.
- Las prioridades P1/P2/P3 siguientes son de experiencia, no de capacidad telefónica o facturación.

## Matriz inicial

| Pantalla | Problema observado | Consecuencia | Mejora propuesta | Prioridad | Evidencia / estado |
| --- | --- | --- | --- | --- | --- |
| Registro y acceso | `/registro` usa `SignupWizard`, mientras `/vista-app` presenta otro acceso dentro de un marco de teléfono y contenido explicativo extenso. | Cambia la presentación y el usuario puede no reconocer que es la misma cuenta. | Reducir introducción visual, unificar títulos y regreso entre acceso y registro; no modificar autenticación. | P2 | **Código:** `app/registro/page.tsx`, `app/vista-app/page.tsx` (bloque `signed_out`). **Pendiente:** ensayo real de recuperación y teclado. |
| Home y navegación | El dock web tenía cinco iconos sin títulos y el botón de Llamadas sobresalía; iOS aún usa cinco iconos sin texto. El Home iOS muestra Web Services, AI Agents y Marketing como «Próximamente» mientras existen recorridos web. | Navegación menos reconocible; diferencia de disponibilidad entre plataformas. | **Web corregida:** títulos traducidos y botón central alineado. **Pendiente iOS:** evaluar etiquetas visibles y enlazar de manera aprobada a servicios disponibles, sin dar a entender que existen pantallas nativas todavía no integradas. | P1 | **Código:** `app/vista-app/page.tsx`, `app/vista-app/vista-app.module.css`, `apps/ios/App.tsx` (Home y bottomDock). **Implementado web, iOS pendiente.** |
| Smart Call y contactos | Las pestañas de Teclado / Historial / Contactos eran iconos emoji sin etiquetas visibles tanto en la web como en iOS. | Se depende de reconocer el icono y recordar dónde está cada tarea. | **Web corregida:** títulos bilingües visibles y objetivos táctiles mayores. **iOS pendiente:** revisar etiquetas y comprobar que historial, contacto y devolución se distinguen. | P1 | **Código:** `app/vista-app/page.tsx` (`callViewTabs`), `apps/ios/App.tsx` (`callsTabs`). **Implementado web, prueba de interacción e iOS pendientes.** |
| AI Agents | Existen configuración de Atención de llamadas, pruebas, agente elegido y acciones de comercio; las reglas de horarios se estaban modificando el mismo día. | Alto riesgo de confundir «configurado», «en piloto» y «realmente atiende». | Resumen único de agente, activación, horario, idioma y resultado fuera de horario, respaldado por el backend actual; verificar coincidencias y excepciones con su responsable. | P1 | **Código:** `app/vista-app/ai-agents/page.tsx`, `CallControl.tsx`, `apps/ios/AIAgentsCallControl.tsx`. **Sin QA telefónica propia.** |
| Marketing | El flujo principal de Acciones está separado de herramientas avanzadas, pero abundan formularios y pestañas en el recorrido avanzado. La UI está mayormente en español literal. | Sobrecarga contextual y experiencia desigual para cuentas en inglés. | Mantener tres acciones principales, «Mis solicitudes» y pasos cortos. Revisar traducciones y el estado de borradores sin interferir en el desarrollo activo. | P1 | **Código:** `app/vista-app/marketing/page.tsx`, `MarketingActionCenter.tsx`, commits recientes de Marketing. **Pendiente sesión EN/ES y QA.** |
| Web Studio | El editor usa Puck y ahora tiene acciones contextuales, selección y biblioteca de imágenes; documentos internos advierten que faltan pruebas autenticadas táctiles y de publicación. | La existencia de controles no prueba que sean cómodos, accesibles o que persistan en móvil. | Probar selección de texto, imágenes y sección, teclado, desplazamiento, autosave, preview y publicación en 360/390/430 px; coordinar con Web Services antes de tocar archivos. | P1 | **Código:** `app/web-studio/WebBuilderWorkspace.tsx`, `BuilderSelectedActions.tsx`. **Antecedente comprobado en documento:** `docs/web-services-contextual-inspector.md`. **QA pendiente.** |
| Suscripciones y consumos | La vista web muestra llamadas nacionales, traducción, recargas, plan y desglose técnico en distintas tarjetas. | El usuario puede no distinguir con rapidez qué saldo corresponde a cada servicio. | Una vista de saldo disponible por servicio, estado del plan y acceso secundario a desgloses, sin alterar números ni cobros. | P2 | **Código:** `app/vista-app/page.tsx` (panel `minutes`). **Pendiente datos de cuenta de prueba.** |
| Cuenta y ajustes | La web incluye selector de idioma y varias preferencias; parte de las etiquetas de las pantallas siguen escritas directamente en español. iOS usa otra composición visual. | Inconsistencia de idioma, jerarquía y componentes. | Agrupar primero cuenta, idioma y plan; secundarios bajo ajustes; terminar cobertura de cadenas de ambas plataformas. | P2 | **Código:** `app/vista-app/page.tsx`, `components/InterfaceLanguagePicker.tsx`, `apps/ios/App.tsx`, `lib/i18n/messages.json`. **Pendiente prueba bilingüe.** |

## Corrección entregada

- **Web:** `app/vista-app/page.tsx`: el dock ahora muestra nombres visibles traducidos con claves existentes `common.home`, `common.services`, `common.calls`, `common.translator`, `common.account`, manteniendo nombre accesible y estado presionado.
- **Estilos web:** `app/vista-app/vista-app.module.css`: dock de cinco elementos con botón de llamadas al mismo nivel, etiquetas de una línea y tamaños compactos.
- **Llamadas web:** se añadieron nombres visibles y bilingües en las pestañas de Teclado, Historial y Contactos, con mayor tamaño de toque, usando cadenas existentes del catálogo de idiomas.
- Commits de código: navegación `a259afeca3d3b95c838447a7d7adc00b4a658e66` y `f7cb567dddea51fc338af02caa57847d51f31f0c`; pestañas de Llamadas `c004f94fb79d5d61b80af8eaa0bb8be7ff5d64aa` y `257d060a20242f78d4a388c43e73007664b398fe`.
- Comparación contra `6e2be0a0e7e092e5f605fa5e6d06805b742ee8fb`: **solo dos archivos**; no cambios en lógica, APIs, permisos, telefonía, facturación, base de datos, iOS o documentos ajenos.
- **Vercel preview READY** para `f7cb567`: https://smartjob-3zc8i7378-valdys-projects-b97fc7a6.vercel.app/vista-app
- **No afirmado como comprobado:** vista autenticada, navegación manual, contraste medido, 360/390/430 px ni dispositivo iPhone. READY verifica compilación web y despliegue, no experiencia.

## Base visual a consolidar

**No crear una segunda librería:** antes identificar `app/vista-app/vista-app.module.css`, `app/vmv-mint.css`, `app/globals.css` y el estilo React Native de `apps/ios/App.tsx`. Comparten intenciones de tarjetas redondeadas y superficies claras, pero contienen capas de mint/lavanda y reglas de navegación repetidas.

Propuesta: mapear **fondo**, **superficie**, **texto fuerte**, **texto secundario**, **borde**, **foco**, **acción primaria**, **éxito**, **precaución** y **error**, más espaciado, radios, objetivos táctiles y tipografía. Mantener los nombres existentes y migrar gradualmente, en una pantalla representativa antes de generalizar. El estado debe acompañarse de texto, no solamente color.

## Pendientes priorizados

1. **P1 · QA visual web:** abrir preview con una cuenta de prueba y verificar dock, pestañas de llamadas, textos ES/EN, enfoque de teclado, estados y anchos 360/390/430 px. Comparar capturas antes/después si existen.
2. **P1 · iOS:** revisar con el responsable de `apps/ios/App.tsx` el dock de iconos sin texto y las tarjetas «Próximamente». No confundir integración web con función nativa.
3. **P1 · AI Agents:** confirmar resumen y reglas de configuración con el responsable, sin modificar telefonía o datos.
4. **P1 · Marketing e Idioma:** revisar traducción de UI y progresión de los tres recorridos principales, respetando trabajo concurrente.
5. **P1 · Web Services:** pruebas autenticadas de edición contextual, guardado, publicación, teclado y móvil; no duplicar implementación existente.
6. **P2 · Cuenta / planes:** comprimir jerarquía y distinguir saldos y consumos por servicio.
7. **P2 · QA transversal:** estados vacíos, carga, error, foco, contraste, navegación predecible, persistencia y pruebas de idioma.

**Coordinación:** documento para Director y demás responsables; no se ha establecido comunicación directa con otros chats y no se ha publicado manualmente a producción.
