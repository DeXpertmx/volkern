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
