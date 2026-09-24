# Día H real — ensayo contra el proveedor de conectividad (receta operativa)

> **Para qué existe este documento**: el día que lleguen las credenciales
> reales del proveedor, este día se ejecuta siguiendo esta guía de arriba a
> abajo, sin decidir nada en caliente. Es la versión del ensayo del simulador
> (`hospitality-dia-h-simulador.md`) contra el destino verdadero, con las
> diferencias, los riesgos y el criterio de salida de cada paso.
>
> **Precondición absoluta**: la respuesta del proveedor ya pasó por el
> preflight en verde:
>
> ```bash
> npx tsx scripts/preflight-conectividad.ts --pegado "URL | ID de socio | usuario | contraseña"
> ```
>
> Si el preflight no está en verde, no se empieza: un espacio de más en la
> contraseña sería un 401 indistinguible de «credenciales malas».

## 0. Qué cambia respecto al ensayo del simulador

| Aspecto | Simulador (ya probado, 34/34) | Proveedor real (este día) |
| --- | --- | --- |
| Base URL | `http://127.0.0.1:4510/api/v2/cm` | La que manden, byte a byte (se valida en el preflight) |
| Códigos | Los que el simulador inventa (`mi-hotel`, rooms `executive`…) | Los que publique **su** `property_details`: se **copian**, nunca se adaptan |
| Errores | Documentados y deterministas | Pueden diferir: cada 4xx/5xx nuevo se registra en el runbook antes de seguir |
| Impacto | Local, tirado al terminar | Los pushes van a su plataforma; los datos que se empujen existen |
| Limits | Ninguno | Rate limit/quota desconocidos (pregunta 6 del email) — se asume conservador |
| Webhook entrante | Lo dispara el simulador | Lo dispara SU cola: no controlamos el momento ni los reintentos |

**Principio del día**: tocar producción **lo mínimo**, en este orden, y
revertir cada paso si no da exactamente lo esperado. Nada de «a ver si pasa».

## 1. Preparación (30 min, antes de tocar nada del proveedor)

- [ ] Respuesta del proveedor en verde por preflight (URL, partner id, Basic Auth).
- [ ] Resolver las dudas A/B con lo que digan: si `hotelCode` es el Hotel ID
  de la OTA o un código suyo (pregunta 7) — condiciona el paso 4.
- [ ] Tenant de homologación «Homologación MIR» operativo (ya existe;
  `cmue9dkb0002fn001amk4pbg5`).
- [ ] Propiedad de prueba en ese tenant con su unidad, y el paso 4 del wizard
  (conectividad) sin configurar todavía.
- [ ] Hablar con el proveedor de la **ventana**: que sepan que hoy empujamos
  datos de prueba a su sandbox (si nos confirman que sigue activo, pregunta 4
  del email; si no hay sandbox, saltar directo a la propiedad real de prueba
  con el hotel de acuerdo).
- [ ] Registro abierto del runbook (§9) para anotar cada resultado.

## 2. Guardar credenciales y comprobar el catálogo (15 min)

1. En `/dashboard/hospitality` del tenant de homologación → paso 4
   (conectividad): pegar los valores **normalizados** que dio el preflight.
   El panel valida lo mismo antes de guardar; si algo se queja aquí, parar y
   revisar — no se guarda nada a la fuerza.
2. **«Probar conexión»**: debe llamar a `property_details` y responder verde.
   Si falla aquí, es el primer dato real: mirar el código HTTP y el mensaje
   (el panel ya distingue causa: credenciales / red / otro).
3. **Cotejar el catálogo con lo que dice el proveedor**: abrir el JSON que
   devuelve `property_details` (queda en el log de sincronización) y anotar
   los valores reales de `hotel_id`, `room_id`, `rateplan_id`, y si publica
   `min_occ`/`max_occ`. **Estos valores son la verdad** — ni los del
   simulador ni los del ejemplo del contrato.

**Criterio de salida**: catálogo visible y entendible; código de hotel y
rooms copiados a mano para el paso siguiente.

## 3. Mapping externo (paso 5 del wizard) (10 min)

- [ ] Crear el vínculo de la unidad de prueba con los códigos EXACTOS del
  catálogo (`hotelCode` + `roomCode` + `rateplanCode`).
- [ ] **Verificación**: en el detalle del vínculo, los tres códigos deben
  coincidir byte a byte con lo que el catálogo publicó. Un espacio aquí es el
  fallo silencioso clásico: el push va, la reserva del canal no encuentra
  mapping y no hay reserva.
- [ ] Anotar en el runbook qué códigos se vincularon.

**Criterio de salida**: vínculo activo guardado, códigos cotejados.

## 4. Push de inventario y tarifas (15 min)

1. Desde el panel de la propiedad, lanzar el push de inventario y el push de
   tarifas para la unidad de prueba (rango corto: 7 días).
2. **Verificación en su lado** (la que de verdad cuenta): si el proveedor
   tiene un portal para el hotel o para el partner, mirar ahí que el
   inventario/tarifa aparezcan. Si no hay portal, pedir confirmación
   explícita por email/chat: «¿veis el push de hoy para el hotel X?»
3. Registrar en el runbook: hora, rango enviado, confirmación del proveedor.

**Criterio de salida**: el proveedor confirma haber recibido los datos (o el
portal los muestra). Un 200 nuestro sin confirmación suya NO es éxito.

## 5. Reserva de prueba por el canal (el momento clave) (30 min + espera)

Aquí la iniciativa es **del proveedor**: su cola debe empujar un `book` a
nuestro webhook. Dos vías posibles (elegir con el proveedor en la ventana):

- **Vía sandbox**: si su sandbox sigue activo y el hotel de prueba está
  conectado, pedirles que disparen un `book` de prueba.
- **Vía OTA real**: con el canal conectado (Booking.com por autoservicio,
  pregunta 15 del email), hacer una reserva real barata en el canal y esperar
  a que llegue por el webhook.

Mientras llega:

- [ ] El webhook tiene que registrar el evento aunque la reserva **no** se
  cree (por ejemplo, si el roomCode no coincide): comprobar en el panel de
  incidencias que aparece, y no dar por perdido el evento.
- [ ] Si llega un `book` con `rooms[]` con más de una habitación: está
  previsto — se rechaza entero y queda como incidente `multi_habitacion` para
  partirlo a mano (ver contrato, §2.3). No improvisar: abrir el panel y
  seguir la receta de partida.

**Criterio de salida**: la reserva existe en el PMS, en la unidad correcta,
con el importe y la divisa que mandó el canal, y el enlace de check-in
funciona (200). Igual que en el ensayo del simulador, pero con datos vivos.

## 6. Idempotencia, modify y cancel (15 min)

- [ ] Pedir (o provocar) un `modify` de la misma reserva y verificar que
  reemplaza el estado completo (fechas, importe, huéspedes) sin duplicar.
- [ ] Provocar un `cancel` y verificar que la reserva se cancela y la unidad
  vuelve a estar vendible.
- [ ] Repetir el `cancel` (o el `book`) exactamente igual: debe responder
  idempotente, sin segunda reserva ni segundo cargo.

**Criterio de salida**: los tres verbos se comportan como en el simulador.
Cualquier divergencia aquí es hallazgo para el runbook antes de seguir.

## 7. Reconciliación (siguiente corrida del cron, o a mano)

- [ ] Esperar la corrida diaria (04:00/07:00) o dispararla a mano con
  `CRON_SECRET`: `GET /api/cron/hospitality-reconcile`.
- [ ] Verificar que el log de reconciliación refleja la reserva de prueba en
  el estado que de verdad tiene (cancelada si se canceló, activa si no), y
  que **no** genera divergencias falsas.
- [ ] Si aparece una divergencia, es exactamente el caso para el que está
  diseñada: se revisa en el panel de conectividad (sección 14, `ausentes`) y
  decide una persona, nunca el cron.

**Criterio de salida**: reconciliación en verde y sin divergencias inexplicadas.

## 8. Cierre del día (15 min)

- [ ] Rellenar el §9 del runbook con: hora de cada paso, códigos usados,
  confirmaciones del proveedor, hallazgos nuevos (respuestas de error no
  documentadas, límites, campos distintos).
- [ ] **Decidir** con el proveedor la ventana del día de homologación real
  (paso 2.4: matriz de 18 casos con `scripts/homologacion-mir.mjs`).
- [ ] Limpieza: si la propiedad de prueba fue efímera, dejarla como esté — el
  tenant de homologación está aislado y no afecta a producción.

## Qué hacer si algo falla (los cuatro fallos esperables)

1. **`property_details` da 404** → el `hotelCode` no existe en su lado, o la
   URL lleva un tramo de más/menos. Volver al preflight con la respuesta
   byte a byte y contrastar con lo que diga el proveedor.
2. **El push da 200 pero el proveedor no ve nada** → probablemente el
   `hotelCode` del push apunta a otro hotel (p. ej. el de la OTA frente al
   suyo). Revisar el mapping y el partner id en la URL.
3. **La reserva del canal no llega al webhook** → lo más probable es el
   mapeo: que la habitación de la OTA no esté mapeada en el proveedor
   (preguntas 9–11 del email), o que Expedia solo tenga activado uno de los
   dos interruptores (pregunta 17). Pedir al proveedor que confirme el estado
   del canal, no reintentar a ciegas.
4. **La reserva llega con `roomCode` desconocido** → el catálogo cambió o el
   canal usa códigos propios. No se adivina: la reserva se queda como
   `sin_mapping` y se corrige el vínculo con los códigos nuevos (contrato,
   §2.4), reenviando el evento desde el panel de incidencias.

## Después del día H

Si todo en verde: **día de homologación real** (paso 2.4 del runbook: la
matriz de 18 casos) y, con el Ministerio respondiendo, el paso 2.2 (XSD).
Este ensayo no sustituye a la homologación: la deja en condición de que el
día real sea ejecutar una receta, no descubrir un sistema.
