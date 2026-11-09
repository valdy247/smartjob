# VMV Call: traducción en persona

## Inicio
- Solo saludo y tarjetas Llamadas traducidas y Traducción en persona.
- En pantallas móviles estándar la web ajusta las tarjetas a una vista fija. En dispositivos compactos permite scroll para evitar recortes.
- Idiomas, número y verificación siguen en Ajustes, no en Inicio.

## Interprete por turnos
- Seleccionar Iniciar conversación hablada o Escribir mensajes.
- Antes de traducir el asistente pregunta con quién vas a hablar y el tema, y puede formular hasta dos preguntas adicionales según las respuestas. Omitir entra directamente.
- Modo hablado: una esfera con las dos banderas. Pulsar para grabar y soltar para transcribir, detectar idioma y traducir. La transcripción ocupa el centro y ajusta el tamaño del texto.
- Modo escrito: cuando hay tres palabras y evidencia suficiente aparece un indicador preliminar de idioma, sin enviar el mensaje. El idioma definitivo se detecta en el servidor al traducir.
- No hay grabación permanente de conversaciones. La función requiere informar a la otra persona y aceptar el procesamiento de voz y texto.
- Frases con números o cantidades conflictivos requieren revisión antes de reproducirse.
- Es traducción por turnos, no interpretación simultánea continua: espera transcripción, modelo y audio.

## Servicios
- /api/interpreter: endpoint autenticado con cuota diaria, entrevista contextual y traducción automática ES/EN.
- /api/voice/transcribe: ElevenLabs si está configurado; de lo contrario, AI Gateway con token autorizado.
- TTS: voz de ElevenLabs cuando esté disponible, en otro caso voz de navegador o Expo Speech.
- En iPhone, expo-audio graba M4A y expo-speech narra. Requiere nuevo instalador iOS 0.4.0 (5).
- La compilación correcta no prueba la recepción de micrófono o volumen en un iPhone físico.

## QA
1. En Safari/iPhone, conceder micrófono, mantener pulsado, decir frase española, soltar y validar traducción inglesa; luego invertir idiomas.
2. Verificar negaciones, precios y cantidades; la reproducción debe detenerse ante inconsistencias.
3. Probar Omitir y bloqueo por falta de consentimiento.
4. Responder una, dos y tres preguntas de contexto, confirmar que el modelo finaliza.
5. Probar detección de idioma al escribir, y traducción únicamente tras enviar.
6. Revisar teclado, pantalla corta y notch en iPhone.
7. Validar límites de crédito y credenciales de AI Gateway en Preview.
8. La telefonía, billing y desvíos de llamadas quedan intactos.
