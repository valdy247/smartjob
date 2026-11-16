# VMV Business · Beta iPhone para Valdy y Mayuli (noviembre de 2026)

## Alcance aprobado
- **Primero dos personas**: propietario y su esposa. NO invitar a los otros 10 testers todavía.
- Código fuente: rama `feat/vmv-ios-preview-beta` basada en la rama de trabajo `feat/vmv-smart-call-control-center`.
- App: VMV Business **0.4.5 (10)** / `com.valdy247.smartjob`, mismo proyecto EAS que el piloto.
- El perfil **preview** abre como pantalla principal la web responsive EXACTA del deployment
  `https://smartjob-n60sd49pz-valdys-projects-b97fc7a6.vercel.app/vista-app`.
- La versión web queda fijada a ese deployment para que la primera ronda tenga un estado reproducible.
  Si se corrigen fallos web, actualizar el deployment fijado en `apps/ios/eas.json`
  y generar otra build (o usar una URL de rama validada solo tras un QA separado).
- Un pequeño botón «⋯» dentro de la pantalla abre acciones (atrás, recargar, «Nativo»).
  Permite probar también los controles iOS, sin dibujar un segundo teléfono o doble menú de navegación.

## La integración es híbrida, no una reescritura total a React Native
- Las pantallas del Preview web se renderizan con `react-native-webview` 13.15.0 (compatible con Expo SDK 54).
  Por ello tienen el mismo diseño, estado y funcionalidades web con conexión a internet.
- Se conserva el SDK Twilio Voice / PushKit / CallKit nativo y el overlay `CallScreen` para llamadas reales.
  **Esto no demuestra** recepción, traducción de audio, permisos de micrófono en WebView ni configuración del IVR.
- La autenticación nativa y la del WebView son **independientes**: iniciar sesión primero en la app nativa
  y luego en el Preview web dentro de ella. No transferir credenciales o sesiones en URLs.
  El WebView usa sesión temporal privada; puede pedir iniciar sesión nuevamente en reinicios.
- La pestaña `Nativo` sirve como respaldo para probar el teléfono y el traductor nativos.
- El API de teléfono nativo sigue anclado al piloto existente de Smart Call y NO al Preview web.
  Cambios en UI web **no** modifican automáticamente la ruta activa de Twilio.

## Antes de llegar al grupo de 10
1. Resolver permisos Expo/Apple del proyecto EAS. El build 13-nov falló antes de compilar:
   `Entity Not Authorized: AppleAppIdentifierEntity` durante `Failed to set up credentials`.
   La cuenta usada podía lanzar un build, pero carecía de permiso READ para el identificador Apple.
   Acceder con el propietario de las credenciales o pedir al propietario Expo que habilite su lectura.
   No crear un bundle ID distinto ni reemplazar certificados sin conocer el actual.
2. Confirmar que los **dos** iPhone estén registrados en el perfil ad hoc iOS de Expo.
   Registrar ambos **antes** de compilar; si se registra otro después, hay que actualizar
   el provisioning profile/recompilar.
3. Compilar y firmar **Preview internal** de `apps/ios`, nunca desde la raíz del repo,
   con el EAS project id ya existente (NO ejecutar `eas init` ni crear otro proyecto).
4. Entrar en la app y luego en el sitio web incrustado con sus respectivas cuentas.
5. Documentar fallos de navegación, login, pagos de prueba, diseños, datos de cuentas
   y estado de cada módulo. Guardar capturas y reproducir el problema.
6. Realizar controles de privacidad, seguridad y aislamiento de cuentas:
   cada una ve solo sus datos. Nunca cambiar el número real de Twilio/desvío
   ni activar billing en vivo durante esta ronda.
7. Probar llamadas reales SOLO si el propietario valida ruta, permisos, saldo de prueba
   y disponibilidad del piloto. La tarea pendiente de sincronizar los switches de
   AI Agents/Traducción con el webhook Twilio NO está resuelta.
8. Corregir los problemas confirmados, hacer nuevo build interno y repetir QA.
   Solo después decidir distribución TestFlight para los 10 testers.

## Pasos desde la computadora (Terminal / PowerShell)
En el repositorio que ya tienes:

```bash
git fetch origin
git switch feat/vmv-ios-preview-beta
git pull --ff-only origin feat/vmv-ios-preview-beta
cd apps/ios
npm install
npx expo install --check
npx eas-cli whoami
```

Si Expo no muestra la cuenta autorizada, iniciar sesión con `npx eas-cli login`.
Confirmar que tiene acceso de lectura y firma de la app Apple de `smart-job`.

Después, **para cada iPhone**, registrar ad hoc desde un dispositivo:

```bash
npx eas-cli device:create
```

Cuando ambos estén registrados y las credenciales iOS estén resueltas:

```bash
npx eas-cli build --platform ios --profile preview
```

Se genera un enlace privado de instalación iOS si EAS termina correctamente.
No hay build iniciado todavía para esta rama. Si el build falla, enviar el
log de la etapa exacta (sin secretos ni tokens) antes de crear credenciales nuevas.

## Pruebas guiadas de la pareja
- Instalar en ambos iPhone, abrir, cerrar, volver a abrir y validar que no se bloquee.
- Iniciar sesión nativamente y también en la web interna; confirmar el negocio correcto.
- Recorrer Inicio, servicios, AI Agents, Marketing, Web Services, cuentas y «Probar llamada».
- Verificar diseño responsive (sin mock de teléfono), scroll, menús, teclado y tamaño de texto.
- Probar actualizar, retroceder y pasar a «Nativo» por el botón ⋯.
- Revisar carga de catálogo, guiones, botones, subida de archivos, micrófono y permisos;
  anotar cuáles solo funcionan en navegador externo o requieren configuración adicional.
- **No** habilitar llamadas en vivo, traducción real ni cobros si no están comprobados.
- Comprobar que al entrar con otra cuenta no aparecen datos anteriores.

## Registro simple de problemas
| Pantalla | Acción | Esperado | Observado | Captura | Prioridad |
|---|---|---|---|---|---|
| AI Agents | Probar llamada | Respuesta corta | Ejemplo: no responde | Adjuntar | Alta |

## Decisión al finalizar
Segunda build corregida para la pareja → validación de navegación/permisos →
compilación de distribución TestFlight con Apple autorizado → primeros 10 invitados.
No considerar el READY de Vercel ni una compilación web como un iOS firmado y probado.
