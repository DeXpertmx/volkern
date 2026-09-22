# Ensayo E2E del Booking Engine público

**Fase**: 3.D del [plan de Booking Engine + Payments](./hospitality-booking-payments-plan.md) · **Última ejecución**: 21 de septiembre de 2026 (**160 comprobaciones en verde**, dos corridas consecutivas)

Este documento describe el ensayo de punta a punta del booking engine: qué
comprueba, cómo se ejecuta y qué incidencias reales destapó en su primera
ejecución (porque un ensayo que nunca falla no está ensayando nada).

## Qué es

Un recorrido completo contra un **servidor de desarrollo real**, sin mocks:

1. **Publica una propiedad de prueba** por las APIs de gestión que usa el
   dashboard, en el orden real: propiedad → unidades → tarifas → estado
   «conectada».
2. **Reserva por la API pública**, la misma que consume `/booking/[slug]`:
   catálogo, cotización con el Availability Engine central, restricciones de
   venta, creación de la reserva e idempotencia.
3. **Deja vencer una retención**: crea un hold `pending` por la API real de
   gestión y comprueba que **bloquea** la venta pública (la página no ofrece la
   unidad y reservar esas fechas responde 409). Le envejece la fecha de creación,
   corre el **barrido real de holds**
   (`GET /api/cron/hospitality-holds-expirados`) y verifica que la unidad
   **vuelve a venderse**: la cotización la ofrece otra vez y una reserva pública
   nueva entra de verdad.
4. **Repite el ciclo en inglés**: sirve la página con `?lang=en`, reserva
   **como lo hace el navegador** (cotiza con el POST interno, envía el formulario
   al POST público) y comprueba que el idioma viaja con la reserva
   (`guestData.idioma`) — lo que leerá la confirmación automática para
   escribirle al huésped en inglés.
5. **Recorre el ciclo real del registro de viajeros (MIR)**: configura el
   arrendador por la API del producto, reserva desde la página pública sin los
   documentos del huésped, comprueba que el barrido deja el parte en
   `datos_incompletos` **sin llamar al Ministerio**, completa los datos por el
   enlace de check-in del huésped, y verifica que el alta viaja (sobre SOAP,
   ZIP+Base64, con su lote) y que la consulta del lote lo deja **   aceptado con su
   código de comunicación**. Todo contra un **mock local del Servicio de
   Hospedajes**: ningún servicio del Ministerio se toca (ver *El mock del
   Ministerio*, más abajo).

   El bloque recorre además los dos desenlaces que **no** son un parte correcto,
   porque son los que se confunden entre sí: un **rechazo** (el servicio leyó el
   parte y lo devolvió con errores: el hotel corrige el dato) y una **caída del
   servicio** (el parte no llegó: el hotel reintenta, y los datos del huésped no
   tienen nada que ver). En el segundo el mock responde **503 sin SOAP** a
   propósito: es la forma más habitual de caerse y la que más fácilmente se
   guardaba como «el Ministerio rechazó este parte».
6. **Recorre el ciclo completo de las preguntas personalizadas del check-in (4f)**:
   el hotel crea su pregunta obligatoria por la API real del producto, el huésped
   la responde en su enlace de check-in, el operador la ve en la lista de
   reservas con el TEXTO de la pregunta y el CSV de recepción lleva una columna
   por pregunta. Corre siempre (no necesita el mock del Ministerio): el parte
   oficial ni se entera de que estas preguntas existen.
7. **Verifica el recordatorio de la pre-llegada (4g)**: dos reservas con
   check-in **mañana** (la ventana exacta del cron) y la pregunta obligatoria
   sin responder; se dispara el **cron real** `/api/cron/hospitality-checkin-due`
   y se comprueba el **email que el servidor envía de verdad** (capturado por el
   mock local): el huésped ES recibe la pregunta en español y el EN —reserva real
   por `?lang=en`— en inglés, cada uno con su enlace al formulario, sin llaves
   `{{}}` sin renderizar ni restos del otro idioma; y **repetir el cron no
   duplica el envío** (guard por AuditLog).
8. **Verifica el planning**: consulta exactamente la misma API y la misma
   ventana que la página del planning, y comprueba que las reservas del ensayo
   (la española y la inglesa) están ahí, una sola vez cada una, con su canal,
   fechas, importe y huésped.
9. **Limpia** lo que creó.

## Cómo se ejecuta

```bash
npm run test:e2e:booking          # arranca next dev en 3098, ensaya y limpia
PORT=3097 npm run test:e2e:booking
E2E_KEEP=1 npm run test:e2e:booking   # conserva los datos para mirarlos a mano
E2E_MIR_PORT=4713 npm run test:e2e:booking   # fija el puerto del mock (por defecto: uno libre)

# Solo el ciclo del registro de viajeros: sin E2E_MIR_ENDPOINT el bloque se omite
# (el ensayo no configura el arrendador ni llama al Ministerio sin esa señal).

# Con un servidor ya levantado:
BASE_URL=http://localhost:3000 node scripts/e2e-booking-engine.mjs --keep
node scripts/e2e-booking-engine.mjs --cleanup   # borra lo que dejó un --keep
```

El ensayo es idempotente: trabaja con los códigos `E2E-BE`, `E2E-BE-A` y
`E2E-BE-B`, así que una ejecución limpia los restos de la anterior.

La API key que usan los pasos de gestión es **temporal**: el script la crea con
permisos mínimos, caduca en una hora y la elimina al terminar (también en el
camino de error). No se guarda ni se imprime.

## Qué comprueba

| Bloque | Comprobaciones |
|--------|----------------|
| Publicación | La propiedad nace `activa`; sin publicar la API pública responde 404; publicada responde 200 |
| Catálogo | Solo las unidades vendibles; la tarifa publicada es la del rate plan (no la tarifa base) |
| Cotización | Noches del rango §8; precio = noches × tarifa; tarifa por noche expuesta; estancia mínima del plan; fechas invertidas → 400 |
| Reserva | 201 con referencia `BE-…`; total recalculado en el servidor; sin cuenta Stripe Connect se crea sin pago en línea |
| Idempotencia | El mismo `idempotencyKey` devuelve la misma reserva sin duplicar |
| Overbooking | El solape en la misma unidad responde 409 |
| Hold que caduca solo | La ventana se configura por propiedad (1 h por la API real); con el hold vivo la cotización da `ocupada` y el POST responde 409; el barrido lo caduca; queda `cancelled` con su traza de auditoría; la cotización vuelve a ofrecer la unidad y una reserva pública nueva entra con 201; repetir el barrido no caduca nada más |
| Contrapruebas del barrido | Un hold **con pagos registrados** (envejecido de sobra) y otro **dentro de su ventana** siguen `pending`: el barrido no se lleva por delante una decisión humana ni una retención joven |
| Planning | Las reservas del ensayo en la ventana del planning, canal «Directa», confirmadas, con la unidad, las fechas, el importe y el huésped correctos — incluida la línea de la reserva en inglés |
| Ciclo en inglés | La página `?lang=en` muestra el motor en inglés: etiquetas, días de la semana, «Unit», importe en-US y CTA «View availability»; la reserva se envía como el navegador (sin `guestData` manual) y nace con `idioma: "en"` en `guestData` |
| Preguntas personalizadas del check-in (4f) | El hotel crea su pregunta obligatoria por la API real (opción única con opciones definidas); el huésped la responde en su enlace de check-in y la respuesta se guarda con la reserva; la lista de reservas y el CSV la muestran **con el texto de la pregunta** (no el id); la baja lógica de la pregunta la saca del formulario sin perder las respuestas existentes; y el parte oficial no cambia ni un byte |
| Recordatorio de pre-llegada (4g) | Con la pregunta obligatoria sin responder y el check-in en la ventana real de 24 h del cron, el email que el servidor envía de verdad nombra la pregunta en el idioma del huésped (ES nombra en español, la reserva EN —real por `?lang=en`— en inglés) con el enlace directo al formulario; sin llaves `{{}}` sin renderizar ni restos del otro idioma; y **repetir el cron no duplica el envío** (guard por AuditLog: 2ª pasada → 0 emails nuevos) |
| Registro de viajeros (MIR): configuración | El arrendador se configura por la API real; el estado confirma que el tenant puede comunicar, **no** devuelve la contraseña y deja ver que el alta de reservas de hospedaje (RH) sigue pendiente del XSD oficial; la propiedad guarda su código de establecimiento |
| Registro de viajeros: parte incompleto | La reserva entra por la página pública sin documentos y nace con su enlace de check-in; el barrido del cron la ve, la deja en `datos_incompletos` con la traza de lo que falta (documento, nacimiento y dirección) y **no sale ni una petición al Ministerio** |
| Registro de viajeros: el aviso de la pantalla de reservas | La lista real de reservas marca esa misma reserva como «le falta el parte» y distingue el caso de **cero fichas de viajero** («sin datos de ningún viajero») del de campos por revisar; cuando el parte queda aceptado, **deja de avisar** |
| Registro de viajeros: check-in del huésped | El enlace abre el formulario y le dice qué falta; el huésped completa los datos de su grupo; el parte sale **en ese momento** (la estancia ya empezó) sin que el hotel lo pulse |
| Registro de viajeros: alta ante el servicio | La petición llega una sola vez, con HTTP Basic, sobre SOAP (operación A, tipo PV), con la solicitud en ZIP+Base64, el código de establecimiento y los datos que aportó el huésped; la traza guarda el lote que devolvió el servicio |
| Registro de viajeros: lote aceptado | El barrido consulta el lote (la operación es asíncrona) y el parte queda **aceptado con su código de comunicación**; la consulta viaja con el lote exacto del alta |
| Registro de viajeros: parte rechazado | Una segunda reserva comunica un documento que el validador del producto acepta y el servicio rechaza: el lote se resuelve con errores, la lista de reservas marca el parte como **rechazado** (no como «faltan datos»), con el **motivo** del servicio, el **campo a corregir** y el ámbito —y sin arrastrar el `0` del alta como código del rechazo. Corregido el dato desde la pantalla, el parte se reenvía en el momento y queda **aceptado**: el aviso desaparece |
| Registro de viajeros: parte abandonado | Con la traza del rechazo en el estado real del abandono —intentos agotados **y** fuera de la espera del backoff—, la lista avisa de que el barrido ya no lo va a reintentar solo, y el barrido **no manda ni una petición más** (el tope de intentos frena aunque la espera ya hubiera pasado). La corrección manual del dato sigue siendo la salida: reenvía, y el parte queda aceptado |
| Registro de viajeros: abandono en el panel de estado | La pasada que deja de reintentar publica cuántos partes ha abandonado y **por tenant, con su nombre** (lo que pinta el panel de estado de crons), y la pasada del rechazo —todavía con intentos por gastar— no los cuenta: rechazado no es lo mismo que abandonado |
| Registro de viajeros: abandono en el panel DEL HOTEL | El mismo abandono, en las pantallas del tenant: la API del registro publica cuántos partes no se reintentan, **cuál es** (con su motivo y su ámbito, no solo un número) y la tasa del ciclo del parte; y el dashboard de Reportes expone el mismo dato. Corregido el parte, las dos superficies dejan de contarlo y vuelven a contarlo como aceptado |
| Registro de viajeros: caída del servicio (parte SIN ENTREGAR) | Con el mock devolviendo **503 en texto plano** (el servicio no contesta, no «rechaza»): el parte queda en `error` —no en `rechazado`— con el motivo de la no-entrega y sin código de retorno, la lista de reservas lo dice por su nombre («no llegó», nunca «el Ministerio lo rechazó») y no acusa a ningún dato del huésped; el panel del hotel lo cuenta como envío que no llegó mientras se reintenta y el panel de estado lo publica **por su causa** (falta de respuesta, no rechazo). Agotados los intentos, el barrido deja de intentarlo aunque el servicio ya esté de vuelta, **y manda el email de aviso al hotel** — capturado en el mock (`EMAIL_E2E_ENDPOINT`): asunto con el total, cuerpo con la referencia de la reserva y su causa («sin respuesta del servicio») —; con el servicio de vuelta el hotel reenvía y el parte queda aceptado, y el aviso desaparece |
| Registro de viajeros: sin duplicar | Un segundo barrido **no** reenvía el parte: lo que está en vuelo se consulta, no se duplica, y no queda nada por resolver |

## El mock del Ministerio: puerto libre y sonda de identidad

El bloque del registro de viajeros no puede hablar con el Ministerio de verdad,
así que el ensayo levanta un **mock local** (loopback) que responde como el
Servicio de Hospedajes: acepta el alta asíncrona con su lote y devuelve el
resultado al consultarlo. El servidor de desarrollo se apunta ahí con
`MIR_E2E_ENDPOINT`, el único override que el módulo honra fuera de producción y
contra loopback (el módulo lo vuelve a comprobar: ningún otro host pasa).

El **email** sigue la misma disciplina con `EMAIL_E2E_ENDPOINT`: el aviso de
partes sin reintentar que manda el barrido llega a una ruta `/email` del mismo
mock (queda registrada y el ensayo la aserta) en vez de salir por Resend o por
el SMTP del tenant. Sin esto, el ensayo enviaría correos REALES con las
credenciales del entorno; con esto, nunca salen de casa — y las guardias del
override son las mismas: en producción se ignora y un valor fuera de loopback
lanza en vez de desviar el correo a un tercero.

Un puerto fijo para ese mock es una trampa que costó una tarde entender, y por
eso quedó escrita aquí: **si otro proceso ya responde en ese puerto, el servidor
habla con él y el ensayo lee un registro de peticiones que no es el suyo**. El
síntoma es de los que mienten: el alta aparece, la consulta del lote no, y aun
así el parte queda aceptado — porque el resultado lo resolvió un mock ajeno con
las mismas respuestas grabadas. El ensayo salía en rojo por una comprobación y
en verde por las demás, que es la peor forma de fallar.

Dos guardias lo cierran:

- **El puerto lo elige el sistema.** El wrapper pide un puerto libre y se lo pasa
  igual al servidor de desarrollo y al mock; `E2E_MIR_PORT` sigue mandando si el
  ensayo se lanza a mano. Nada de un 4620 fijo que en una máquina con corridas
  previas puede estar ocupado.
- **El mock se identifica antes de usarse.** Cada respuesta del mock lleva
  estampado un testigo de la corrida (`mir-e2e-run:<pid>-<aleatorio>`) y, tras
  escuchar, el mock se envía una **sonda a sí mismo** y exige reconocerse en la
  respuesta y en su propio registro. Si responde otro, o si el puerto está
  ocupado (`EADDRINUSE`), el ensayo **falla de entrada con un mensaje accionable**
  en vez de medir contra un doble. La sonda no cuenta como petición del ensayo.
- El wrapper además **libera los dos puertos** (servidor y mock) antes de
  arrancar y mata el **grupo de procesos** del servidor al terminar: `npx next
dev` es un lanzador, y matar solo al lanzador dejaba vivo al `next-server` real,
  que sobrevivía a la corrida con el mock de la anterior.

## Cómo se deja vencer un hold sin esperar una hora

La ventana de retención se cuenta en horas, así que un ensayo que esperase de
verdad tardaría una hora por ejecución. Lo que hace el bloque 4 es lo único que
se puede hacer con honestidad: **configurar la ventana por la API real**
(`holdHoras: 1` en la propiedad de ensayo) y **retrasar la fecha de creación**
del hold con Prisma, que es exactamente como se ve un hold olvidado desde ayer.
La semilla de la fecha es la misma excepción que el resto del script ya usa para
preparar y limpiar datos: el flujo que se mide (crear el hold, bloquear la venta,
liberarla, venderla) va entero por HTTP.

Dos detalles deliberados:

- El barrido que se dispara es **el real y es global**: si la base local tuviera
  otros holds vencidos, también los caducará. Por eso la comprobación es
  `caducados >= 1` y no `=== 1`, y el bloque lo avisa al empezar.
- La contraprueba del hold **con pagos** también se envejece. Si no, el barrido
  ni lo miraría (no llega al prefiltro) y el ensayo celebraría un barrido que
  nunca llegó a evaluar la regla: lo que lo salva tiene que ser el pago.

Al terminar, el bloque **restaura la ventana** de la propiedad (24 h) y la
limpieza borra además las trazas de auditoría de esos holds: son `AuditLog` sin
clave ajena, así que sobrevivirían al borrado de la propiedad y seguirían
contando en la métrica de «holds abandonados» de Reportes.

## Cómo verlo a mano

Con `--keep`, el script imprime al final:

- **Página pública**: `/booking/{propertyId}` — el flujo fechas → disponibilidad
  → datos → confirmación.
- **Planning**: `/dashboard/hospitality/calendar` — la reserva aparece en la
  unidad reservada, dentro de la semana en curso.
- **Reservas**: `/dashboard/hospitality/reservas` — búsqueda por el email del
  huésped del ensayo.
- **Registro de viajeros**: `/dashboard/hospitality/registro-viajeros` — la tarjeta roja de
  *partes sin reintentar* (aparece solo si el ensayo dejó alguno): referencia, motivo del
  Ministerio y la acción que toca.
- **Reportes**: `/dashboard/hospitality/reportes` — los KPIs de *holds abandonados* y de
  *partes sin reintentar*
  (con las trazas del ensayo ya limpias, vuelve a su valor previo).

## Qué encontró la primera ejecución (17 sep 2026)

El ensayo hizo su trabajo: destapó dos fallos que los tests existentes no veían
porque miraban piezas sueltas y no el recorrido completo.

**1. La cotización no aplicaba las restricciones del rate plan.**
La página ofrecía una unidad para una estancia de 1 noche cuando su plan exige
2, y el POST la rechazaba después con un 409. La causa: la API pública cotizaba
la disponibilidad sin pasar las restricciones del plan, mientras que la creación
de la reserva sí las aplicaba. Arreglado en el módulo puro
(`cotizarEstancia` acepta las restricciones **por unidad**, porque la cotización
pública evalúa varias unidades con planes distintos a la vez) y el helper
`restriccionesDeRatePlan` normaliza la fila de Prisma en un único sitio.
*Guardia*: test de módulo (las restricciones de la unidad mandan sobre el plan
por defecto) + test de API (la cotización y el POST coinciden en el mismo caso).

**2. La página pública no podía completar una reserva.**
La cotización identifica la unidad con `unitId` y el catálogo con `id`; la
página leía `id` en ambos. Consecuencia real en el navegador: todas las unidades
aparecían «Elegida», el formulario del huésped no salía y el POST viajaba sin
unidad. Arreglado normalizando la respuesta en el único punto donde entra la
cotización.
*Guardia*: `tests/hospitality-booking-page.test.tsx` renderiza la página real y
completa el flujo hasta la confirmación, comprobando que el POST lleva el id de
la unidad elegida y que el importe por noche se pinta. Es la lección de fondo:
**una guardia que solo lee el código fuente no ve un desajuste de campos**;
hacen falta tests que rendericen y ejerciten el flujo.

De paso quedó a la vista que la ficha de la unidad mostraba `0.00/noche` porque
la cotización no exponía la tarifa por noche; la API ahora la devuelve y hay
test de API y de render para las dos cosas.

## Decisiones del entorno de ensayo

- **La propiedad se publica poniendo el estado `conectada` directamente.** El
  camino oficial (Puesta en marcha §31) exige un proveedor de conectividad
  externo y sus tres pruebas en éxito; en local no hay PMS al que llamar. El
  estado «conectada» es lo único que la API pública mira, así que el ensayo
  publica por su API de propiedades y deja constancia aquí.
- **No hay pago en línea** porque el tenant de ensayo no tiene cuenta Stripe
  Connect; el ensayo verifica precisamente que la venta no se rompe por eso
  (`paymentUrl: null`). El cobro con Connect tiene sus propios tests con mocks
  (`tests/hospitality-stripe-connect.test.ts`).
- **Los datos del ensayo se conservan solo con `--keep`.** Por defecto se
  limpian: la propiedad arrastra unidades, tarifas, reservas, líneas y pagos por
  cascade, y el script borra además el contacto del huésped y la API key.
- **El wrapper se hace dueño de sus puertos.** Antes de arrancar libera el
  puerto del servidor y el del mock (mata a quien escuche ahí), y al terminar
  mata el grupo entero del servidor de desarrollo, para no dejar `next-server`
  huérfanos que compartan el directorio `.next` y contesten a la corrida
  siguiente. Aun así, si vas a mirar el resultado a mano con `--keep`, lo más
  limpio es usar `BASE_URL` contra un servidor que ya tengas levantado.
