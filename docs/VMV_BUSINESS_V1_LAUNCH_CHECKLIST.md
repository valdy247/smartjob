# VMV Business — Checklist maestro de lanzamiento V1

**Estado:** checklist de trabajo, no declaración de funcionalidad probada.
**Repositorio:** `valdy247/smartjob`
**Rama única de integración V1:** `release/vmv-business-mvp-v1`
**Base de código de la rama:** `feat/vmv-smart-call-control-center` al crearla, no la `main` antigua.
**Regla de lanzamiento:** NO fusionar ni desplegar a producción sin build, QA E2E y autorización explícita.
**Convención:** `[x]` solo evidencia verificable; `[ ]` falta trabajo o verificación. P0 bloquea lanzamiento; P1 puede esperar si se excluye expresamente del alcance. Actualizar al completar cada tarea con commit/prueba.

## 0. Preparación y decisiones [P0]

- [x] Crear `release/vmv-business-mvp-v1` desde la rama moderna, conservando `main` intacta.
- [x] Guardar plan de alcance en `docs/vmv-business-mvp-v1-plan.md`.
- [x] Decidir seis módulos visibles: Web Services, AI Agents, Video Studio (incluye Pilot), Smart Quote, Marketing, Ads Studio.
- [x] Decidir exclusiones V1: Smart Call, Traductor e Instagram Connect como servicios independientes.
- [x] Decidir Video Studio solo para **crear videos** (no crear imagen, editar foto/video, música, efectos o cambio de voz posterior).
- [x] Decidir puerta de aprobación: generar imágenes → revisión humana → **todas aprobadas** → animación, voz, montaje y guardado automáticos en la nube.
- [ ] P0: auditar todo el inventario de rutas/APIs/bases de datos, feature flags, tareas programadas, flujos de cobro y servicios de producción.
- [ ] P0: definir la política exacta de créditos, precios Turbo/Alta, minutos personalizados y regeneraciones; validar margen ante facturas reales de proveedores.
- [ ] P0: fijar alcance de telefonía en AI Agents: ocultar funciones dependientes de Smart Call sin romper los agentes de atención web.
- [ ] P0: acordar criterios de aceptación de cada módulo y casos de prueba reales por cuenta/rol.

## 1. Shell, acceso y navegación V1 [P0]

- [ ] Separar login/perfil/onboarding de `useSmartCallAccount` y de las peticiones Twilio/minutos en el Home.
- [x] Home V1 actualizado sobre el diseño anterior (saludo, hero con cohete, tarjetas, Mi Negocio y navegación inferior); seis servicios visibles y sin Smart Call/Traductor/Instagram Connect. Compilación Preview READY en commit 84773818 (falta QA funcional en navegador).
- [ ] Retirar Smart Call, Traductor e Instagram Connect del catálogo, home, búsqueda, accesos rápidos, onboarding, recomendaciones y menús.
- [ ] Ocultar/retirar pantallas telefónicas, traductor y enlaces profundos de primera versión; guardar código/datos y preservar webhooks compartidos hasta auditar.
- [ ] Reasignar todos los enlaces de video existentes de Home, Servicios, Pilot y AI Agents a una **única** entrada Video Studio.
- [ ] Actualizar Cuenta: perfil, negocios, opciones, sesión y avisos sin referencias a servicios pospuestos.
- [ ] Revisar registro/inicio de sesión, recuperación de contraseña, creación del primer negocio, roles, sesiones y cierre de sesión.
- [ ] Probar navegación móvil, botón atrás, deep links, selector de idioma, estados vacíos y errores de permisos.

## 2. Video Studio — wizard único [P0]

- [ ] Inicio **Crear / Historial**, sin opciones de creación/edición de imágenes ni otros productos.
- [ ] Tema: nichos y opción de tema libre.
- [ ] Público: opciones útiles, perfiles y selección persistida.
- [ ] Estilo animado con previews: Stickman, Cartoon 2D, Cartoon 3D, Plastilina y un estilo adicional ilustrado; **sin humanos fotorrealistas** en V1.
- [ ] Duración: 15, 30, 60, 120, 180 segundos y personalizada con límites de costo/capacidad.
- [ ] Idioma del video y verificación de idioma del texto y de la voz.
- [ ] Selector de voces reales disponibles de ElevenLabs y OpenAI según idioma, muestras auditables, voz escogida guardada por ID correcto; no inventar opciones.
- [ ] Subtítulos sí/no; texto cronológicamente ligado a cada escena.
- [ ] Tendencias: YouTube, Facebook, Instagram, TikTok o **Continuar con mi idea**.
- [ ] Tres tendencias REALES por plataforma seleccionada solo cuando haya acceso verificable a fuentes y previews; vista previa 9:16, **Ver tendencia** (abre original), **Proponer idea** (plan original editable). Si una plataforma no está disponible, indicar que no lo está, sin fabricar tendencias.
- [ ] Plan sugerido completo y editable: idea, estructura narrativa, guion/diálogo, escenas, acciones, referencias de personajes y estilo.
- [ ] Calidad Turbo/Alta: precio proporcional en créditos visible antes del gasto, duración y diferencias verificadas por proveedor.
- [ ] Resumen con lápiz para editar cada apartado, autorización de gasto y botón final **Generar por X créditos**.
- [ ] Validar consistencia de personajes/estilo en imágenes y clips; avisar si falla la verificación.

## 3. Storyboard y aprobación antes de animar [P0]

- [ ] Crear en backend proyecto durable, IDs de escenas, versiones, parámetros del wizard y estado de trabajo.
- [ ] Generar y persistir guion + imágenes de escenas en almacenamiento privado, sin depender de la pestaña abierta.
- [ ] Mostrar fotogramas verticales, texto y acción de cada escena; modificar guion/acción por escena sin destruir escenas válidas.
- [ ] Regenerar una imagen con cotización proporcional y **confirmación explícita** del nuevo gasto.
- [ ] Aprobar/desaprobar imagen individual; opción **Aprobar todas**; cambios relevantes invalidan solo la aprobación de la escena afectada.
- [ ] Puerta **awaiting_image_approval** obligatoria: **ninguna animación inicia con imágenes sin aprobar**.
- [ ] Recuperar el proyecto y estado de aprobación después de cerrar/reabrir la web, cambiar de dispositivo o renovar sesión.

## 4. Generación asíncrona real en la nube [P0 — bloqueador principal]

- [ ] Seleccionar y desplegar un worker persistente (o cola + consumidores) fuera del ciclo de vida de la pestaña/navegador; documentar proveedor, límites, supervisión y recuperación.
- [ ] Persistir jobs, eventos, escena actual, heartbeat, lease, reintentos y estado; impedir trabajos perdidos al reiniciar servidores.
- [ ] Al aprobar todas las imágenes, realizar preflight de capacidades/créditos y encolar **una sola vez** mediante clave idempotente.
- [ ] Animar los fotogramas aprobados con Seedance/otro proveedor **realmente habilitado** en Turbo y Alta; no habilitar por etiqueta sin pruebas.
- [ ] Guardar cada clip aprobado/generado de forma privada e independiente; reanudar desde la escena fallida sin repetir escenas correctas.
- [ ] Soportar 24–36 escenas para videos de 2–3 minutos y duración personalizada dentro del límite, con tiempos de espera y costos razonables.
- [ ] Generar narración seleccionada en el idioma correcto; sincronizar guion/voz con cada escena y duración final.
- [ ] Montar automáticamente clips, voz y subtítulos en un MP4 9:16 sin música ni efectos añadidos en V1.
- [ ] Validar MP4: video no congelado, audio audible, duración, resolución, secuencia, sincronía y archivo decodificable.
- [ ] Porcentaje real persistido y calculado por etapas/escenas (guion, imágenes, espera de aprobación, clips, voz, montaje, verificación, almacenamiento); ETA estimada separada, no falsa precisión.
- [ ] Estados claros: planificación, imágenes, esperando aprobación, en cola, animando, voz, montaje, verificando, terminado, error recuperable o cancelado.
- [ ] Probar **cierre del navegador durante imágenes y durante animación**, reabrir horas después, recuperar job y descargar el video final sin intervención humana.
- [ ] Al terminar, guardar MP4 privado y mostrarlo en Historial y pantalla de reproducción/descarga.

## 5. Créditos, límites y seguridad económica [P0]

- [ ] Crear o validar monedero real, ledger transaccional, compras, reservaciones, consumo, reembolsos y conciliación sin saldos ficticios.
- [ ] Definir matriz por duración (15/30/60/120/180/custom) y calidad Turbo/Alta, imágenes adicionales y regeneraciones; **30 créditos / 30 s Turbo** es propuesta, no precio comercial aprobado.
- [ ] Mostrar desglose antes de cargar créditos, incluso primera creación de imágenes y reintentos.
- [ ] No cobrar dos veces por recargar la página, aprobar dos veces, reintentar un webhook o recuperar una escena conservada.
- [ ] Manejar falta de créditos, límites de costo por cuenta/día, errores de proveedor, trabajos cancelados y reembolso parcial verificable.
- [ ] Verificar políticas de compras/proveedor de pago, recibos, disputas y privacidad; no usar Stripe en vivo sin decisión de precios y consentimiento.
- [ ] Medir costos efectivos por trabajo y reconciliarlos contra las facturas/proveedores antes de publicar precios.

## 6. Los otros cinco módulos [P0]

### Web Services
- [ ] Alta/edición/guardado/publicación real de sitios; verificar dominio, SSL, editor, versiones y rollback.
- [ ] Comprobar solicitudes, permisos, páginas públicas, integraciones con AI Agents y que el sitio sobreviva a reinicios.
- [ ] Probar creación y publicación de principio a fin con negocio de prueba.

### AI Agents
- [ ] Consolidar agente principal y flujos de atención web, ventas, servicios/reservas y productos sin pantallas Smart Call V1.
- [ ] Verificar conexiones con Web Services, Smart Quote y Video Studio; sin duplicar asistentes de video.
- [ ] Probar privacidad, autorización por negocio, contenido no inventado, traspaso humano y actividad auditable.

### Smart Quote
- [ ] Verificar formulario, cálculo, edición, impuestos/depósitos si corresponden, propuesta, guardado y envío controlado.
- [ ] Comprobar integración con agente y dueño, histórico y permisos; no marcar cobrado sin recibo real.

### Marketing
- [ ] Confirmar creación de estrategias, campañas, calendario, solicitudes y métricas vinculadas a datos reales.
- [ ] Verificar integración con negocio, web, agentes, videos y medición de leads/conversiones con datos atribuibles.

### Ads Studio
- [ ] Preparar anuncios con cuenta/creativos/público, presupuesto y flujo de revisión.
- [ ] Garantizar cero publicación y cero gasto automático; validar estados de Meta/conexiones y mensajes honestos.
- [ ] Hacer E2E de borrador → revisión → resultado permitido, sin activar campañas durante QA.

## 7. Operaciones, seguridad y cumplimiento [P0]

- [ ] Revisión de secretos y variables por entorno (preview/producción), permisos mínimos, buckets privados y URLs firmadas.
- [ ] Políticas RLS Supabase y aislamiento por `owner_id`/empresa en API, cola, proyectos, historial y pagos.
- [ ] Rate limits, antiabuso, cuotas, revisión de uploads y protección contra descargas no autorizadas.
- [ ] Migraciones reproducibles, backup y restauración probada, recuperación ante fallos, plan de rollback.
- [ ] Logs con IDs de correlación, alertas por jobs detenidos, latencia, costos y errores de proveedores sin imprimir secretos.
- [ ] Términos de uso, privacidad, retención y borrado de datos, derechos de uso de tendencias y recursos de voz/imagen/video; revisar antes de lanzamiento abierto.
- [ ] Soporte y mensajes claros para cobros, tiempos de espera, errores y archivos.

## 8. QA, Preview y salida a producción [P0]

- [ ] Mantener la rama `release/vmv-business-mvp-v1` como única integración de la V1; revisar commits de otras ramas antes de incorporarlos.
- [ ] Ejecutar pruebas existentes relevantes + `npm run typecheck` y `npm run build` sin regresiones.
- [ ] Incorporar tests automáticos del wizard, gate de aprobación, idempotencia, ledger, worker, reintentos y biblioteca.
- [ ] Desplegar Preview de esta rama y confirmar estado READY, proyecto y commit exactos.
- [ ] Ejecutar casos E2E reales de cada módulo con usuarios autorizados, móvil/escritorio, español/inglés y baja conectividad.
- [ ] Ejecutar **prueba crítica**: crear video → revisar imágenes → aprobar todas → cerrar la web → worker termina voz + montaje → abrir historial → reproducir y descargar.
- [ ] Prueba de duración larga 120/180 s, varios trabajos simultáneos, fallos de proveedor y límites de gasto.
- [ ] Revisar accesibilidad, velocidad de carga y menús sin accesos a Smart Call/Traductor/Instagram Connect.
- [ ] Preparar lista de bloqueadores detectados, resolverlos y volver a probar sin marcar pasos por simples supuestos.
- [ ] Aprobar checklist GO/NO-GO con evidencia, plan de reversión y presupuesto de beta.
- [ ] Obtener autorización explícita para fusionar/desplegar a producción; comprobar dominio, jobs, métricas y errores postlanzamiento.

**Evidencia Home:** diseño anterior reutilizado mediante `vista-app.module.css`, conservando clases `homeConcept`, `homeGrowHero`, `homeServiceTiles` y `homeBusinessArea`. Preview de código construido (READY). La aplicación completa sigue sin estar lista para producción.

## P1 — después de V1 (no bloqueantes si se ocultan)

- [ ] Smart Call como producto.
- [ ] Traductor.
- [ ] Instagram Connect independiente.
- [ ] Funciones avanzadas de edición de video, cambio de voz del MP4, música, efectos y video fotorrealista.
- [ ] Publicación automática de campañas/anuncios y futuras automatizaciones, solo con controles y permisos específicos.

## GO / NO-GO

**NO-GO** si falta cualquiera de estas condiciones:
1. No hay un worker real que continúe con el navegador cerrado.
2. Se anima una escena antes de que las imágenes estén aprobadas.
3. Se puede perder/doblar saldo por reintento o falta visibilidad de gastos.
4. El MP4 final no se puede descargar desde Historial.
5. Un módulo V1 visible falla su flujo E2E crítico.
6. Smart Call/Traductor/Instagram Connect siguen visibles como productos V1 o afectan la navegación.
7. No hay build Preview validado, logs suficientes, plan de rollback o permiso de lanzamiento.

**Evidencia a guardar al cerrar tarea:** commit/PR, prueba corrida, entorno, fecha, resultado y responsable.

> **Nota sobre el plan previo:** el nombre provisional "Imagen/Video" y la idea de generar imágenes como producto independiente quedan SUPERADOS por el alcance confirmado: **Video Studio V1 solo crea videos**. La generación de imágenes de storyboard sigue siendo un paso interno.
