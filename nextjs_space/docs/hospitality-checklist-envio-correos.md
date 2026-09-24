# Checklist de envío — los dos correos de Hospitality (pasos 1.1 y 1.2)

> Un solo sitio para ejecutar el envío HOY sin abrir el runbook. Los
> recordatorios corren desde el día de envío. Al marcar cada casilla, anotar
> la fecha real en §9 del runbook (`docs/hospitality-ruta-claves-reales.md`).

---

## Correo 1 — Cliente (paso 1.1): precondiciones Ministerio

Fuente: [`hospitality-email-precondiciones-cliente.md`](./hospitality-email-precondiciones-cliente.md)

| # | Acción | Estado |
|---|--------|--------|
| 1.1.1 | Abrir el documento y copiar el cuerpo (desde `**Asunto:**` hasta «Un saludo», SIN las notas internas del final) | ☐ |
| 1.1.2 | Rellenar `[nombre]` (saludo) y `[Firma]` | ☐ |
| 1.1.3 | Enviar por el correo comercial de siempre. **Sin adjuntos** (no lleva secretos; las credenciales del punto 2 ya se pide que lleguen por el canal seguro) | ☐ |
| 1.1.4 | **Al enviar**: marcar el paso 1.1 del runbook + fecha en §9 | ☐ |
| 1.1.5 | **Recordatorio** a los 7 días naturales si no hay respuesta: una línea encima del hilo + oferta de la llamada «pantalla a pantalla» | ☐ (fecha: ____ ) |

---

## Correo 2 — Proveedor de conectividad (paso 1.2): 36 preguntas

Fuente: [`hospitality-email-proveedor-conectividad.md`](./hospitality-email-proveedor-conectividad.md)

| # | Acción | Estado |
|---|--------|--------|
| 1.2.1 | Abrir el documento y copiar el cuerpo (desde `**Subject:**` hasta «Best regards», SIN las notas internas del final) | ☐ |
| 1.2.2 | Rellenar los **3** `[name]` (saludo + firma + cierre) y el rol en la firma | ☐ |
| 1.2.3 | **Adjuntar** `docs/hospitality-connectivity-contract-externo.md` tal cual (133 líneas, en inglés, ya expurgado y verificado: cero material interno). **NO adjuntar** el contrato interno | ☐ |
| 1.2.4 | Destinatario: contacto de soporte/ventas del proveedor + copia técnica nuestra. En inglés | ☐ |
| 1.2.5 | **Al enviar**: marcar el paso 1.2 del runbook + fecha en §9 | ☐ |
| 1.2.6 | **Recordatorio** a los 5 días hábiles citando SOLO las preguntas A y B (las bloqueantes) | ☐ (fecha: ____ ) |
| 1.2.7 | **Cuando respondan**: pasar la respuesta por `npx tsx scripts/preflight-conectividad.ts --pegado "URL \| ID de socio \| usuario \| contraseña"` ANTES de tocar el servidor; con el resultado verde, configurar y avisar para el día H | ☐ |

---

## Reglas transversales (de los bloques de preparación de cada email)

- Las notas internas de cada documento **no se copian nunca** al correo.
- Ningún secreto viaja en estos correos: las credenciales (punto 2 del cliente;
  Basic Auth del proveedor) llegan después, por el canal seguro acordado.
- El nombre comercial del proveedor de conectividad no aparece en material de
  cliente; en el correo al proveedor sí se habla de su API con naturalidad.
- Ambos envíos son independientes: se pueden enviar el mismo día; el proveedor
  no espera al cliente ni viceversa.

---

## Plantilla de recordatorio — Cliente (día 7)

> Responder **encima del mismo hilo**. Se copia tal cual salvo la fecha entre
> corchetes. Sin adjuntos, sin nuevos pedidos: solo reabrir el hilo y bajar la
> fricción ofreciendo la llamada.

**Asunto:** Re: Alta de la plataforma — últimos pasos para comunicar los partes de viajeros al Ministerio

Hola [nombre]:

Te escribo por si se nos había perdido el correo de la semana pasada — te lo
vuelvo a dejar resumido aquí abajo. Son los datos que solo vosotros podéis
solicitar para que los partes de viajeros puedan comunicarse al Ministerio:

1. El alta en la Sede Electrónica y las credenciales de **pruebas** del
   servicio de comunicaciones.
2. Los tres códigos del establecimiento (arrendador, aplicación y
   establecimiento; una pareja por propiedad si hay varias).
3. El documento técnico **XSD** que os entreguen con el alta — este es el que
   nos falta para terminar por nuestra parte.

Con eso montamos la prueba en un día. Si alguno de los pasos de la Sede
Electrónica se hace lío, lo vemos juntos por pantalla compartida en una llamada
de media hora — dime cuándo te viene bien y te lanzo la invitación.

Un saludo,
[Firma]

*(Debajo queda el correo original completo.)*

---

## Plantilla de recordatorio — Proveedor (día 5 hábil)

> Responder **encima del mismo hilo**, en inglés. Se copia tal cual salvo la
> fecha entre corchetes. Solo cita **A y B** (lo que nos bloquea) y las deja
> contestables inline sin reabrir el adjunto.

**Subject:** Re: Volkern (PMS) — channel manager integration: A and B (the two blocking questions)

Hi [name]:

Following up on our email from [fecha de envío] — no rush on the rest, but
**questions A and B are the only ones blocking our go-live**, so we'd appreciate
answers to those first. Inline, so you can reply in place:

**A. Access (3 short answers):**
1. Production base URL, byte-for-byte (we need the `/api/v2/cm` prefix in writing).
2. Our partner ID (the `{pms}` segment), or the date you will issue it.
3. Production Basic Auth username + password (separate from sandbox), and your
   rotation procedure.

**B. Mapping (2 short answers):**
7. Should `hotelCode` be the OTA hotel ID or an ID your platform issues?
12. Are the `roomCode` / `rateplanCode` values from `property_details` the same
    codes your webhook sends in bookings, and are they **stable** over time?

(The full 36-question list and the integration contract are in the thread below.)

With A and B we can configure the first property and push to your sandbox the
same day. Happy to take any of these live on a short call if that's easier.

Best regards,
[name]
[role] · Volkern

*(Debajo queda el correo original completo, con el adjunto ya entregado.)*
