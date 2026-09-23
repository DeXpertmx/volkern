# Email al hotel — precondiciones para homologar con el Ministerio (Seshospedajes)

> Listo para copiar, personalizar el saludo y enviar. Sin jerga técnica.
> Contexto para nosotros: sin los puntos 1–4 no se puede probar NADA — cualquier
> envío solo demostraría que las credenciales no valen. Por eso van primero.

---

**Asunto:** Alta de la plataforma — últimos pasos para comunicar los partes de viajeros al Ministerio

Hola [nombre],

La plataforma ya está desplegada y probada de punta a punta con el simulador del servicio de Hospedajes del Ministerio del Interior. Para dar el último paso —comunicar los partes de viajeros reales con el sistema oficial— necesitamos que nos consigáis unas credenciales y datos que solo vosotros podéis solicitar. Os detallo todo en una sola lista para que lo resolváis de una vez:

**1. Registro en la Sede Electrónica del Ministerio.**
Hay que darse de alta como titular del establecimiento en la Sede Electrónica del Ministerio del Interior (sede.interior.gob.es → sección de Hospedajes). Quien la haga debe ser el titular o representante legal del negocio, con certificado digital.

**2. Credenciales del servicio de comunicaciones.**
Con el alta os asignan las credenciales para comunicar partes: un identificador de usuario y su clave para el servicio web. Pedidnos **la versión de PRUEBAS (homologación)** primero y las de producción después de validar. Enviádnoslas por vuestro canal seguro de siempre — nunca por email plano.

**3. Los tres códigos del establecimiento.**
- Código de **arrendador** (identifica al titular).
- Código de **aplicación** (identifica al programa que comunica).
- Código de **establecimiento** (identifica cada propiedad).
Si tenéis más de una propiedad, necesitamos la pareja de códigos de cada una.

**4. El documento técnico de especificación (XSD) que os entregue el Ministerio.**
Cuando os den de alta os entregan la documentación del servicio, incluido el fichero XSD del alta de reserva de hospedaje. **Este documento es imprescindible y no podemos sustituirlo**: define el formato exacto de una de las comunicaciones. Sin él, esa comunicación no puede implementarse — solo con todos los demás pasos quedaríamos al 90 %.

**5. Dos o tres estancias de prueba.**
Para validar, necesitamos reservas de prueba: huéspedes reales o ficticios con documentos válidos (DNI/NIE/pasaporte), fechas de entrada y salida y un teléfono de contacto. Pueden ser reservas que ya os hayan hecho o inventadas para la ocasión.

**6. Una mañana con el ordenador libre.**
La validación con el servicio de pruebas del Ministerio es rápida, pero conviene tenerla agendada: esa mañana configuramos el sistema con vuestras credenciales, enviamos los partes de prueba y comprobamos que el Ministerio los acepta. Si algo falla, lo corregimos ahí mismo.

**7. Confirmar quién firma la firma digital.**
Las comunicaciones van firmadas digitalmente con el certificado del establecimiento. Necesitamos saber qué certificado usáis (el del titular que usasteis en el punto 1) y que estará disponible el día de la prueba.

---

Qué pasa en cada lado cuando lo tengáis:

- **Vosotros**: nos hacéis llegar los puntos 1–4 (y agendamos el 5–7).
- **Nosotros**: configuramos la plataforma en modo pruebas, enviamos los partes de ejemplo al Ministerio y os enseñamos el resultado: qué se envió, qué respondió y cómo lo veréis vosotros en el panel del día a día.

Si tenéis cualquier duda sobre cómo pedir cualquiera de estos puntos en la Sede Electrónica, llamadnos y lo vemos juntos pantalla a pantalla.

Un saludo,
[Firma]

---

## Notas internas (NO enviar — para el equipo)

- **Orden no negociable**: los puntos 1–4 son prerrequisitos duros. El 4 (XSD) es el único que bloquea código propio: el namespace del alta de reserva de hospedaje (`NS_ALTA_RESERVA`) solo puede rellenarse con el documento delante — está a propósito a `null` en `lib/hospitality/registro-viajeros.ts` y la guardia exige que vaya con su procedencia documentada.
- **Canal de las credenciales**: solo por el canal seguro que usemos ya (no por email plano). Nosotros las guardamos cifradas por tenant en `HospitalityMirConfig` — jamás en el repo.
- **Dónde queda esto en la ruta**: es el paso **1.1** del runbook `docs/hospitality-ruta-claves-reales.md`. Al enviarlo, marcar el paso y registrar la fecha en §9.
- **Vía paralela (no depende del Ministerio)**: la reunión con el proveedor de conectividad — checklist ya redactado en `docs/hospitality-checklist-reunion-conectividad.md`.
- Si el hotel pregunta por plazos: el día de validación es medio turno; sin los 4 primeros puntos no hay fecha posible.
