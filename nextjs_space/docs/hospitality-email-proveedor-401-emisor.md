# Correo al proveedor — su emisor de webhooks entra con un par Basic distinto (401)

> **Contexto interno (NO enviar).** Desde la reconfiguración del 7-oct (credenciales
> restauradas al partner real + sonda al hotel real `75fdbbce2e`; hasta entonces
> estábamos en su sandbox), **cada push entrante del emisor del proveedor muere en un 401**:
>
> | Cuándo (UTC) | Motivo persistido | Usuario | Contraseña | `usuarioHuella` | `huella` |
> |---|---|---|---|---|---|
> | 2026-10-08 12:57:36Z | `credenciales_no_coinciden` | 7 caracteres | 11 caracteres | `fb41fd6bdba9` | `79c4b7658cf0` |
> | 2026-10-09 16:18:06Z | `credenciales_no_coinciden` | 7 caracteres | 11 caracteres | `fb41fd6bdba9` | `79c4b7658cf0` |
>
> Fuente: `connectivity_providers.configuracion.ultimoRechazoWebhook` (lo que pinta
> Administración → Conectividad como «último rechazo»). El par que **nosotros**
> guardamos mide 19 / 8 caracteres y **es válido en su API**: con él nuestros pushes
> devuelven `200 {"success": true}` y la sonda `property_details` responde 200 (probado
> hoy contra el servicio real). O sea: el emisor no está usando el par que emitimos
> nosotros, sino otro.
>
> Hechos que sostienen la cronología: `hospitality_webhook_events` **no tiene ni un
> evento del hotel real** (los 11 de la tabla son del `sandbox-pms`, hasta el 28-sep);
> el health-check pasó de `sandbox-pms` OK (30-sep) a 400 del 1-oct al 6-oct, 403 el
> 7-oct 07:28 y OK con `75fdbbce2e` desde el 7-oct 07:50. Los dos 401 del emisor son
> **posteriores** a esa reconfiguración.
>
> **Nunca enviar**: el par guardado, el ID de socio, ni las longitudes ni las huellas de
> NUESTRO par (el correo se queda en «nuestro par es otro y sigue siendo válido en su
> API»). Las huellas que sí se citan son las del par **que llegó** (el suyo): no revelan
> nada nuevo —se calculan a partir de un valor que ellos ya tienen— y son justo lo que
> permite comparar sin que ningún secreto viaje.
>
> **Por qué no publicamos la huella de nuestro par.** La huella es SHA-256 truncado de
> un secreto corto: publicarla permitiría *confirmar por fuerza bruta* contraseñas
> candidatas. En el intercambio propuesto ellos mandan la huella de SU par y nosotros
> comparamos en casa y respondemos «coincide / no coincide»: nadie expone su valor.
>
> **Dónde comparar nosotros, en casa.** El valor de referencia se lee del panel
> (Administración → Conectividad, bloque del último rechazo) o directo de
> `connectivity_providers.configuracion.ultimoRechazoWebhook`; para el par que SÍ
> queremos que usen, calcular `sha256(usuario)…[:12]` y `sha256(usuario:password)…[:12]`
> con el par descifrado dentro del contenedor, sin imprimirlo. El sobre de este correo
> es el mismo que el del resto del hilo con el proveedor (el del paso 1.2); la respuesta
> esperada es «coincide/no coincide», no una captura.
>
> **Contrapartida técnica ya escrita**: [`hospitality-webhook-emisor-guia.md`](./hospitality-webhook-emisor-guia.md)
> (guía del emisor, en español) documenta la receta de huellas, los seis `motivo` del 401
> y los reintentos; este correo no la adjunta —el hilo va en inglés— pero es la fuente
> interna de todo lo que aquí se le cuenta.
>
> **La comparación ya está hecha (9-oct, solo lectura, contra producción).** El par
> guardado, descifrado dentro del contenedor y sin imprimirse en ningún momento
> (`docker exec … node` con el script de abajo): **usuario 19 caracteres, contraseña 8**,
> y sus dos huellas son **distintas** de `fb41fd6bdba9`/`79c4b7658cf0`. O sea: no es «el
> mismo par mal codificado o con un espacio» — llegan **7/11** y hashes distintos, así que
> es **otro par**. El arreglo es de su lado y no hay nada que rotar por nuestra parte.
>
> Las huellas de NUESTRO par **no se escriben en este documento a propósito**: son
> SHA-256 truncado de un secreto de 8 caracteres —la contraseña es corta— y con esa
> huella en un repo filtrado se confirmarían candidatas por fuerza bruta en segundos. Se
> recalculan cuando hagan falta con la consulta de abajo (nunca se imprimen los valores).
>
> ```bash
> # solo lectura; imprime SOLO longitudes y huellas de lo guardado
> docker exec -i <contenedor_app> node <<'JS'
> const c=require('crypto');const {PrismaClient}=require('@prisma/client');
> const k=Buffer.from((process.env.ENCRYPTION_KEY||'').padEnd(32,'0').slice(0,32));
> const d=t=>t&&(()=>{const p=t.split(':');const x=c.createDecipheriv('aes-256-cbc',k,Buffer.from(p[0],'hex'));return Buffer.concat([x.update(Buffer.from(p.slice(1).join(':'),'hex')),x.final()]).toString('utf8')})();
> const h=(...p)=>c.createHash('sha256').update(p.join(':')).digest('hex').slice(0,12);
> (async()=>{const p=new PrismaClient();for(const r of await p.$queryRawUnsafe('SELECT "usernameEnc","passwordEnc",configuracion FROM connectivity_providers')){const u=d(r.usernameEnc),w=d(r.passwordEnc);console.log(JSON.stringify({usuarioLen:u&&u.length,passwordLen:w&&w.length,usuarioHuella:u&&h(u),huella:u&&w&&h(u,w),ultimoRechazoWebhook:r.configuracion&&r.configuracion.ultimoRechazoWebhook}))}await p.$disconnect()})()
> JS
> ```
>
> Medido el 9-oct 2026 con esa consulta: `usuarioLen 19 · passwordLen 8` y ambas huellas
> **distintas** de las del rechazo persistido
> `2026-10-09T16:18:06.672Z · usuarioLen 7 · passwordLen 11 · fb41fd6bdba9 · 79c4b7658cf0`.
> La **longitud ya decide sola**: 19/8 no es 7/11, y los dos juegos de huellas tampoco
> coinciden. Si alguna vez hiciera falta comparar huella a huella, se recalcula con la
> consulta de arriba y se coteja sin volcarla aquí.

---

**Subject:** Reservation webhooks from your emitter are rejected with 401 — the Basic Auth pair does not match (hotel `75fdbbce2e`)

Hi [name],

Since **7 October** we are not receiving any reservation from your side for our
production hotel `75fdbbce2e` (`Ciudad Patio Cuarenta`). Every inbound POST to our
webhook is being **rejected with HTTP 401**, and I can tell you exactly why without
either of us sharing a secret.

## 1. What we see on our side

Our receiver is:

```
POST https://volkern.app/api/hospitality/webhook/reservations
Authorization: Basic base64(utf8(username:password))
Content-Type: application/json
```

Two delivery attempts were rejected, both with the same reason
(`credenciales_no_coinciden` — the arriving pair is not the one we hold):

| When (UTC) | HTTP | Reason | Username length | Password length |
|---|---|---|---|---|
| 2026-10-08 12:57:36Z | 401 | pair does not match | 7 | 11 |
| 2026-10-09 16:18:06Z | 401 | pair does not match | 7 | 11 |

A 401 response body carries a `diagnostico` object with no secrets in it, so you can
check it from your own logs at any time:

```json
{
  "success": false,
  "error": "No autorizado",
  "diagnostico": {
    "motivo": "credenciales_no_coinciden",
    "esquema": "basic",
    "usuarioLen": 7,
    "passwordLen": 11,
    "usuarioHuella": "fb41fd6bdba9",
    "huella": "79c4b7658cf0"
  }
}
```

**How to compute the fingerprints** (any language, one line of code):

- `usuarioHuella` = first 12 hex characters of **SHA-256 of the username**, UTF-8, no salt
- `huella` = first 12 hex characters of **SHA-256 of `username:password`**, UTF-8, no salt

Example: `sha256("alice:secret").slice(0, 12)`.

So: **`sha256(username + ":" + password)` truncated to 12 hex chars = `79c4b7658cf0`** is
what your emitter is currently sending. The pair we hold and hand over as the inbound
credential is a **different** one — and it is a valid pair on your API: our inventory,
rate and catalog calls with it return `200`/`200 {"success": true}`. That is the whole
picture: the credentials of the **webhook emitter** are not the ones we issued for it,
and both pairs are not the same value with a stray space or a bad encoding either — the
fingerprints differ. That value is not a new secret to send around: it is the same one
traveling in the `Authorization` header of **every call we make to you**, so your side
already has it on record — this is a configuration mismatch on the emitter, not a
credential we must exchange.

## 2. What needs to change on your side

1. **Set the Basic Auth pair of the reservation webhook emitter to the pair we issued
   at onboarding** — the same pair your API already accepts from us on every outbound
   call (`/update/{partner-id}`, `/update-rates/{partner-id}`, `/data/{partner-id}`,
   `/property_details/...`). Easy self-check: that exact value is the one you will find in
   the `Authorization` header of our outbound calls on your side — all our calls use it,
   and so does the check we do when a webhook arrives. If your emitter holds anything
   else, that is the whole bug. If you no longer have it, tell me and I will re-send it
   through the secure channel we used for the first delivery — please do **not** send
   credentials by email.
2. **Check how your emitter builds the header** (in case you change the value but the
   request still arrives wrong). The value must be
   `Basic ` + base64 of the UTF-8 string `username:password`, in a single header, with
   no line breaks and no extra spaces. Our side accepts `Basic` in any case
   (RFC 7235) and tolerates a base64 payload split across lines, but it rejects —
   with its own reason in the `diagnostico` — a missing header (`sin_cabecera`),
   another scheme (`esquema_no_basic`), a value that does not decode as
   `username:password` (`cabecera_malformada`, `sin_separador`) and credentials encoded
   in anything other than UTF-8 (`encoding_no_utf8`).
3. **Confirm the change without exposing anything.** After updating the emitter, compute
   the two fingerprints of the pair you configured and send them to me. I will compare
   them with ours in-house and reply "match" or "no match" — I will not publish ours,
   because a 12-hex fingerprint of a short password can be used to confirm guesses
   offline, and none of us needs that. A quick sanity check on your side first: if you
   still get a 401 after the change, the `usuarioHuella` in the response must **change**
   (today it is `fb41fd6bdba9`); if it comes back identical, the request is not leaving
   your system with what you configured.
4. **Do not retry a 401.** A wrong pair will keep failing; retrying it only adds noise.
   Our contract keeps retries with backoff for `404` (the booking may still be on its
   way) and for `500`/`503` (we always send `Retry-After`), never for `400`/`401`.

## 3. Impact and mitigation on our side

A lost webhook is not a lost reservation: our daily sweep calls
`POST /data/{partner-id}` with `{"type": "reservation", "hotelCode": "75fdbbce2e", …}`
and recovers what never arrived. That is how we already imported the booking.com
reservation `5084548141` (guest arriving 9 October) after your 401s — but it arrives up
to 24 hours late, and a late reservation is a room sold twice. Fixing the emitter
restores the real-time path, which is the one we want.

Happy to run a live test window with you: send a `book` (and its `cancel`) for a marked
test booking and we will confirm receipt, then delete it from our side.

## 4. For the record, no action needed: `startDate`/`endDate` in Fetch Reservations

While diagnosing the above we measured the date filter of `POST /data/{partner-id}` with
`type: "reservation"` against your live service (hotel `75fdbbce2e`, a booking made on
8 October for a 9–11 October stay):

| `startDate` → `endDate` | Reservations returned |
|---|---|
| `2026-10-08` → `2026-10-08` | the booking |
| `2026-10-08` → `2026-11-08` | the booking |
| `2026-10-09` → `2026-10-09` | `[]` |
| `2026-10-09` → `2026-11-08` | `[]` |

So the range filters by **booking date** (`bookedOn`), not by stay dates. We have adapted
our sweep to look backwards (30 days), so nothing is needed from you — but if that is not
the intended behaviour, or if you ever change it, please tell us: our reconciliation
window depends on it.

Thanks,
[Name] — Volkern
