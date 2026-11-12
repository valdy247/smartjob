# VMV Business · Contactos → Llamada con VMV
Fecha: 2026-11-11 · Rama `feat/vmv-smart-call-control-center`

## Mejora lista en web y código iOS
La agenda antes solo permitía editar y borrar contactos. Ahora cada contacto nacional guardado tiene una acción **Llamar** independiente de **Editar**. Al pulsarla:
1. El usuario pasa a la pestaña Teclado.
2. El número de ese contacto se rellena automáticamente; aparece su nombre.
3. **No se inicia ninguna llamada sin confirmar**. El botón del teclado abre la confirmación existente con nombre y número antes de invocar el mismo endpoint protegido de Twilio.
4. La llamada usa el Caller ID del número VMV, no `tel:` ni el número personal.
5. El backend sigue exigiendo sesión, línea, saldo nacional y elegibilidad. No se cambió el backend ni se redujeron las salvaguardias.
6. Si el teléfono no corresponde a formato nacional estadounidense, la acción queda deshabilitada; contactos internacionales siguen pudiendo guardarse y editarse.

### Archivos
- Web: `app/vista-app/ContactBook.tsx`, `app/vista-app/DialPad.tsx`, `app/vista-app/page.tsx`, `app/vista-app/vista-app.module.css`.
- Nativo: `apps/ios/ContactsPanel.tsx`, `apps/ios/DialPad.tsx`, `apps/ios/App.tsx`.

No se modificó Home, Web Services, AI Agents, Marketing, Supabase ni Twilio.

### Verificación
- La actualización web se compiló en Vercel con el commit `d5e5b810dda60418a327b70d4a16f42301b2f8d1` (READY).
- La rama compartida recibe cambios simultáneos de otros equipos. En despliegues posteriores hubo un error de TypeScript en `app/vista-app/ai-agents/AgentSetupWizard.tsx`, líneas 133, 135 y 148: `SetStateAction<0|1|2|3>` recibió valores `number`. No fue ocasionado por Contactos; comunicarlo al equipo AI Agents.
- Aún pendiente: prueba real de llamada de extremo a extremo, build iOS/TestFlight. Un despliegue web READY no confirma compilación nativa.
