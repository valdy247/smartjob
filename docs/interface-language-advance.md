# Internacionalización — avance para Valdy y Director

Este avance usa la base incorporada en los commits `15de6f4`, `c8ef5e3`, `e81b699`, `489a2a4`, `8dd375e` y `a9b9095` de la misma rama. No se creó otro catálogo ni otra preferencia de cuenta. No hubo comunicación directa con otros chats: los cambios se integraron leyendo Git.

## Implementado

- Catálogo único: `lib/i18n/messages.json`; 297 claves completas por idioma. Tipos y comprobación de claves literales y variables.
- Preferencia única: `auth.users.user_metadata.ui_language`; almacenamiento local `vmv_ui_language`. Metadato de presentación editable por el usuario, nunca utilizado para autorización. Sin migraciones, cambios RLS ni credenciales privilegiadas.
- Controlador común `lib/i18n-preference.ts` utilizado por el proveedor web y el hook nativo existente. Prioridad de cuenta; inicialización de cuentas antiguas solo si falta el valor; segunda lectura antes de inicializar; escrituras serializadas; descarte de lecturas obsoletas; cambio inmediato; error visible si falla el guardado.
- Resolución antes de mostrar la interfaz. Si falla la lectura de una cuenta, muestra reintento en lugar de presentar otro idioma. Relectura al volver a la pestaña/app; sincronización entre pestañas web.
- Registro web: cuatro pasos, validaciones, SMS, estados, confirmación y accesibilidad; guarda `ui_language` separado de `owner_language` y `customer_language`. Selección local del visitante y parámetro de idioma al abrir el registro desde iOS.
- Acceso y recuperación web: textos y errores comprensibles; los avisos guardan claves para cambiar de idioma inmediatamente.
- Selector de país: modal, búsqueda, estado vacío y accesibilidad; nombres regionales mediante `Intl.DisplayNames`, conservando ISO y prefijos.
- Selector en cuenta y ajustes de `/vista-app`, además de los selectores de cuenta/registro/nativo ya incorporados en la rama.
- Adaptación Metro para importar el catálogo/controlador desde la raíz sin mover el proyecto.
- Las webs publicadas por clientes (`/sites/*`) quedan fuera del proveedor de idioma de VMV para respetar su contenido.

## Validación

- `npm run i18n:check`: catálogo y referencias literales completas.
- `npm run i18n:test`: 17 pruebas del controlador: variantes regionales, prioridad, visitante, inicialización única, recarga, segundo dispositivo simulado, cierre/inicio de sesión, cambio de cuenta, concurrencia, almacenamiento lento/bloqueado y fallos de red/guardado.
- `npm run typecheck`: pasó antes de integrar los últimos commits de Web Services. La verificación final queda bloqueada por los errores externos detallados abajo.
- `npm run build`: compilación Next.js y 52 pruebas del puente completadas antes de la última integración remota. El último `next build` falla por los errores de tipos externos de Web Services. No se declara compilación final aprobada.
- Comprobación TypeScript aislada del hook nativo compartido: sin errores.
- `npm run typecheck` en `apps/ios`: bloqueado por error previo `BusinessServicesPanel.tsx(101,237): TS1005 ')' expected`, presente en el SHA inicial. No se modificó ese módulo.
- Prueba visual automatizada: pendiente. Chromium no está instalado y la descarga del navegador falló. No se ejecutaron escenarios completos de registro real, inicio de sesión real, pagos ni sincronización con dos dispositivos reales.
- No se crearon cuentas de prueba en servicios reales ni se modificaron idiomas de voz, precios, monedas o saldos.

## Pendiente — no declarar cobertura completa

1. Migrar Home, Smart Call, AI Agents, Web Services, Marketing, suscripciones/pagos y demás componentes con textos incrustados. Los selectores ya existen, pero esos módulos aún pueden mostrar español al elegir inglés.
2. Completar onboarding/activación, errores de APIs, modales y estados restantes de la app nativa.
3. Localizar correos transaccionales: verificar plantillas externas de Auth y los emisores del repositorio; el metadato por sí solo no cambia las plantillas del proveedor.
4. Mapear al español las etiquetas externas del catálogo O*NET. Los títulos oficiales externos, nombres geográficos, nombres de usuarios y códigos no se traducen automáticamente; este punto no equivale a cobertura terminada del formulario.
5. Revisar visualmente los dos idiomas a 390 px y escritorio; validar ambos registros, login/logout, cuentas existentes y dos dispositivos con una cuenta controlada.
6. Resolver el error previo del módulo nativo con su responsable antes de validar o distribuir un build completo de iOS.
7. Revisar el rendimiento SEO de las rutas públicas: la resolución de cuenta controla la visibilidad inicial. Los metadatos usan cookie/navegador en servidor y se actualizan en cliente; la preferencia de otra sesión no puede conocerse en servidor con el almacenamiento Auth actual.

## Archivos

- `lib/i18n.ts`, `lib/i18n/messages.json`, `lib/i18n-web.tsx`, `lib/i18n-preference.ts`.
- `components/AuthPanel.tsx`, `components/SignupWizard.tsx`, `components/CountryDialPicker.tsx`.
- `app/registro/page.tsx`. Los cambios simultáneos de `/vista-app` se conservaron íntegros desde la rama remota.
- `apps/ios/useInterfaceLanguage.ts`, `apps/ios/App.tsx`, `apps/ios/metro.config.js`.
- `scripts/check-i18n.mjs`, `scripts/interface-language.test.cjs`, `package.json`, `.github/workflows/interface-language-checks.yml` y este informe.

Rama obligatoria: `feat/vmv-smart-call-control-center`. El SHA final y el despliegue de preview se entregan en la respuesta de cierre. No se autorizó ni ejecutó promoción a producción.

## Mensaje concreto para Director — bloqueo de compilación compartida

Tras integrar `d506c7a` y `5749f55`, el chequeo final detecta errores externos a i18n:

- `app/vista-app/WebServicesStudio.tsx:271` y `:273`: un `string | boolean` llega al valor de campos que aceptan texto.
- `lib/web-services-site.ts:20`: el mapa de límites no contempla `inquiriesEnabled`.
- `lib/web-services-site.ts:42`: la incorporación del booleano hace incompatible la asignación genérica de texto (`string` a `never`).

El responsable de Web Services debe ajustar el tratamiento de `inquiriesEnabled` como booleano conservando los campos de texto. No se modificaron estos archivos desde i18n. Repetir tipos/build y validación visual después de su corrección. El SHA y estado de la preview se reportan explícitamente en la entrega; una preview fallida no constituye validación funcional.
