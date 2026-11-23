# Starter · 150 minutos nacionales (especificación pendiente de activación)

La propuesta comercial VMV Business establece **Starter: 150 min de llamadas nacionales** y **20 min de traducción inglés-español** (catálogo de traducción existente).

La UI de configuración de idiomas solo acepta inglés y español y debe forzar idiomas distintos. Cambiar el idioma del cliente selecciona automáticamente el opuesto para el negocio y viceversa; validación de servidor ya rechaza selecciones iguales.

El vínculo **Ver planes** en Smart Call lleva a la página bilingüe del sitio corporativo de prueba.

## No implementado aún
- No existe ledger/balance para llamadas nacionales. El backend de producción permite actualmente llamadas directas con suscripción válida sin cuota separada de 150 min. El piloto puede tener restricciones adicionales.
- El saldo de traducción no se debe usar ni descontar por llamadas normales.
- No hay paquete Stripe de minutos nacionales ni precio autorizado.
- Falta decidir la unidad facturable y el tratamiento de entrantes, salientes, devoluciones, fragmentos de minuto y ciclos de renovación.
- Antes de vender Starter con 150 min se debe implantar el contador transaccional, enforcement de llamadas y pruebas de concurrencia.

No afirmar que las 150 min sean un saldo real en la pantalla de la cuenta hasta que el backend y los webhooks lo apliquen correctamente.
