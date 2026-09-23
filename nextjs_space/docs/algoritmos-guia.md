# Guía de algoritmos de Volkern
## Qué hace cada uno, cómo funciona y en qué os ayuda

> Para quien usa el sistema (hotel, recepción, ventas) y para quien lo vende o lo presenta.
> Los detalles internos —funciones, constantes y pruebas— están en el anexo técnico
> `algoritmos-inventario.md`. Este documento se lee sin abrir una línea de código.

---

## Cómo leer esta guía

En Volkern llamamos **algoritmo** a toda regla o cálculo que el sistema hace por ti para
decidir algo: si una habitación está libre, cuánto se cobra, qué campo del parte está mal,
a quién hay que llamar hoy, si un cliente se nos está yendo.

Son de dos tipos, y conviene distinguirlos porque se comportan distinto:

| Tipo | Qué significa | Ejemplo |
|---|---|---|
| **🎯 Determinista** | Mismas entradas → mismo resultado, siempre. Se puede auditar y explicar | La ocupación de una noche, el importe de una penalización |
| **🤖 Con IA** | El modelo **propone**, el sistema **decide con límites**: valida rangos, exige confianza y deja registro | El cliente simulado del roleplay, el diagnóstico de un deal |

Y en cada ficha encontrarás cuatro cosas:

**Qué hace** · **Cómo funciona** (con un caso real) · **Qué gana quien lo usa** · **Qué gana la empresa**

---

## El recorrido de una reserva, de principio a fin

Esta es la historia completa. Cada paso lo cubre uno o varios algoritmos de la guía:

```
  EL HUÉSPED BUSCA          EL HOTEL OPERA                    EL NEGOCIO APRENDE
  ─────────────────         ────────────────                  ──────────────────
  1. Busca y ve precio      6.  Planning del día              10. Informes y KPIs
     (H2 · H4 · H5)            (H3 · H1)                          (H10–H13)
  2. Reserva y paga         7.  Check-in y datos del huésped  11. Reseñas y reputación
     (H6 · H7)                 (H16 · H17)                        (H18 · H19)
  3. La unidad se bloquea   8.  Parte de viajeros al          12. Formación del equipo
     (H1 · H2)                 Ministerio (H14 · H15)             (C1–C5)
  4. Llega el día           9.  Check-out, limpieza           13. Riesgo de perder
  5. Se queda o se va sola      (H8 · H9 · H20)                   clientes (C6–C10)
     (H8 · H9)
                             En todo momento: canales (H21), dinero (H22),
                             permisos (H23) y barridos automáticos (H24)
```

---

# PARTE 1 · Hospitality
### El sistema que hace funcionar un hotel

---

## BLOQUE A · Vender sin equivocarse

*Del precio que ve el huésped a la noche que queda bloqueada.*

---

### H1 · La vara de medir del estado de una reserva 🎯

**Qué hace.** Decide, para cada reserva, tres cosas con una sola regla: si **ocupa** la
habitación, si sigue **viva** y si **se movió hoy**. Y una sola regla para las tres, en
todo el sistema.

**Cómo funciona.** Una reserva cancelada o un no-show **no ocupan ni facturan** (esa
habitación vuelve a venderse); el no-show, en cambio, **sí llegó** —se cuenta como
movimiento del día aunque no ocupe—. Es la diferencia entre «¿bloquea la habitación?» y
«¿pasó algo con ella?».

**Qué gana quien lo usa.** Que el planning, los informes y las finanzas digan lo mismo.
Antes esta regla estaba copiada en una decena de sitios y de ahí salían variantes: un
informe excluía el no-show y otro no. Si dos pantallas dan ocupaciones distintas, el hotel
deja de fiarse del sistema y vuelve al Excel.

**Qué gana la empresa.** Una única fuente de verdad significa que las cifras que se
enseñan al cliente son defendibles. Es la base de todo lo demás: sin ella, cada informe es
una opinión.

**Dónde lo ves.** En toda la vertical: planning, dashboard, informes, finanzas.

---

### H2 · El motor de disponibilidad 🎯

**Qué hace.** Responde a la pregunta más importante del negocio: *¿esta habitación está
libre esa noche?* — y la responde **siempre** desde el estado interno de Volkern, sin
preguntar al canal.

**Cómo funciona.** Una noche está ocupada si existe una reserva **que produce** (H1) cuya
estancia la cubre. La regla fina es la que casi todo el mundo confunde:

```
Reserva del 10 al 15 de abril
→ ocupa las noches 10, 11, 12, 13 y 14
→ el día 15 (check-out) NO está ocupado: esa noche ya se puede vender
```

Un **no-show no bloquea** (nadie durmió allí, la habitación vuelve al mercado) y una
**salida anticipada libera** las noches que no se usaron. La disponibilidad de una unidad
es binaria: libre u ocupada, porque cada reserva se asigna a una unidad concreta.

**Qué gana quien lo usa.** Que la web, el planning y lo que se publica en Booking o Airbnb
digan lo mismo. Sin esto hay overbooking: la web cree una cosa, el canal otra.

**Qué gana la empresa.** El overbooking es el error más caro de un hotel (realojar a un
huésped cuesta dinero y reputación). Un motor único lo hace imposible por construcción, no
por cuidado.

**Dónde lo ves.** En la web de reservas, el planning, el calendario y la sincronización con
canales.

---

### H3 · El planning que se lee de un vistazo 🎯

**Qué hace.** Convierte reservas y habitaciones en el tablero que ve el hotel: una fila por
habitación, una columna por día.

**Cómo funciona.** Una reserva es **una barra continua**, nunca cinco bloques sueltos. Si
un huésped acorta su estancia, la barra se acorta sola y esas noches vuelven a estar libres
en el mismo tablero, sin que nadie recalcule nada.

**Qué gana quien lo usa.** Recepción ve de un vistazo quién entra, quién sale y qué hueco
queda. Es la pantalla que se mira cien veces al día.

**Qué gana la empresa.** Menos decisiones lentas y menos errores de asignación: el hueco se
ve, no se deduce.

**Dónde lo ves.** Hospitality → Calendario (vista semana / mes).

---

### H4 · El precio de la reserva directa 🎯

**Qué hace.** Calcula lo que cuesta una estancia en la web del hotel: noches × tarifa del
plan de tarifas activo, con sus reglas.

**Cómo funciona.** Cada plan puede exigir mínimo de noches, máximo o días concretos de
llegada y salida. Ejemplo: un plan de «puente» con mínimo 3 noches no ofrecerá una escapada
de dos. Y cada unidad cotiza con las reglas de **su** plan, porque la web ofrece varias a la
vez.

**Qué gana quien lo usa.** El precio que ve el huésped es exactamente el que se le cobra.
No hay «la web decía 200 y me habéis cobrado 260».

**Qué gana la empresa.** La reserva directa no paga comisión de canal. Cada punto de
conversión que gana la web propia es margen que se queda en el hotel.

**Dónde lo ves.** La página pública de reservas y el botón de reservar del dashboard.

---

### H5 · Los extras que suben el ticket 🎯

**Qué hace.** El huésped añade desayuno, late check-out o un traslado al reservar, y esos
extras entran en la misma cuenta que la habitación.

**Cómo funciona.** El precio **lo pone el servidor**, nunca el navegador del huésped: la
selección viaja como «quiero 3 desayunos del extra X» y el sistema lo resuelve contra el
catálogo activo del hotel. Lo que no está en el catálogo no se cobra (y se dice por qué),
y las cantidades están acotadas (de 1 a 10) para que nadie compre 999 desayunos por error.

**Qué gana quien lo usa.** Ingresos extra sin trabajo extra: no hay que facturar el desayuno
a mano ni cuadrarlo después.

**Qué gana la empresa.** Ticket medio más alto con el mismo número de reservas. Y como el
extra es una línea más de la reserva, la contabilidad sigue siendo una sola.

**Dónde lo ves.** El motor de reservas y la configuración de extras por propiedad.

---

### H6 · Cobrar a la cuenta del hotel, no a la nuestra 🎯

**Qué hace.** Cobra la reserva directa **contra la cuenta de pago del propio hotel**.

**Cómo funciona.** El sistema usa Stripe Connect: cuando el huésped paga, el dinero entra en
la cuenta del hotel, no en la de Volkern. Volkern no es intermediario de fondos. Si el hotel
todavía no ha conectado su cuenta, el sistema **no inventa un cobro**: marca la reserva como
pendiente y avisa de que no se puede cobrar online. La comisión de plataforma se puede poner
a cero, y con cero no se envía ninguna comisión al banco (mandar un cero sería declarar una
comisión que no existe).

**Qué gana quien lo usa.** El hotel cobra en su cuenta de siempre, con su contabilidad y sus
plazos. Nadie le retiene el dinero.

**Qué gana la empresa.** Es una objeción de venta que desaparece: «¿mi dinero va a pasar por
vosotros?» — No. Y no convierte a Volkern en una entidad financiera con obligaciones que no
quiere tener.

**Dónde lo ves.** Finanzas → cuenta de cobro, y el paso de pago del motor de reservas.

---

## BLOQUE B · No perder ni dinero ni inventario

*Lo que pasa cuando el huésped no llega, se va antes o nunca confirma.*

---

### H7 · La caducidad de los holds 🎯

**Qué hace.** Libera las reservas que se quedaron «pendientes» y nunca se confirmaron, para
que no bloqueen la habitación para siempre.

**Cómo funciona.** Una reserva pendiente es una **retención**: bloquea la habitación
mientras se decide. El sistema la caduca cuando pasa la ventana configurada por el hotel
(por defecto 24 horas). Dos detalles que evitan destrozos:

- **Si ya entró dinero, no caduca.** Anular un hold por el que ya se cobró destruiría un
  cobro real; eso lo decide una persona, no un barrido automático.
- **Queda registro de las dos cosas**: de cada hold que caduca y de cada uno que se salva.
  Con los dos, la tasa de abandono es exacta, no una estimación.

**Qué gana quien lo usa.** Una habitación «bloqueada por nadie» deja de ser un misterio a
las 24 horas. Y el operador ve cuántos holds se le escapan y en qué hotel.

**Qué gana la empresa.** Cada noche que un carrito abandonado bloqueaba era una noche
invendible. Es recuperar inventario sin tocar precios.

**Dónde lo ves.** El panel de estado de los barridos y las métricas de holds caducados.

---

### H8 · La salida anticipada, decidida con criterio 🎯

**Qué hace.** Decide qué significa que un huésped se marche antes de su fecha prevista.

**Cómo funciona.** El hotel elige una de dos políticas, **por propiedad**:

| Política | Qué pasa con las noches que no se usan | Cuándo conviene |
|---|---|---|
| **Cerrar la estancia** | Se borran del planning y de lo previsto; la reserva termina el día real | Hoteles que quieren el planning limpio y cobran la estancia completa |
| **Salida real** (recomendada) | Se guarda la fecha real de salida; las noches no usadas **vuelven a venderse** | Casi siempre: no se pierde lo planeado y la habitación vacía se vende |

La razón por la que importa: si un hotel cobra la estancia completa y borra las noches no
usadas, el ingreso medio por noche (ADR) **se infla** — mismos ingresos divididos entre
menos noches. La política «salida real» evita ese espejismo.

**Qué gana quien lo usa.** Recepción registra que el huésped se fue y las noches quedan
disponibles para vender, sin tocar la reserva a mano.

**Qué gana la empresa.** Inventario recuperado y métricas que no engañan a la dirección.

**Dónde lo ves.** Configuración de la propiedad y el check-out del planning.

---

### H9 · El no-show que cobra sin ocupar 🎯

**Qué hace.** Separa dos hechos que casi siempre se mezclan: la habitación que **nadie
ocupó** y el **cargo** que hay que emitir.

**Cómo funciona.** Un no-show **no ocupa** (la habitación vuelve al mercado esa misma noche)
pero **puede cobrar** según la política del hotel: nada, la primera noche o la estancia
completa. Si la reserva vino de un canal externo (Booking, Airbnb), manda el canal. El cargo
se emite **una sola vez**, como una línea de la propia reserva.

Detalle importante: la penalización **no es ingreso de alojamiento**. No entra en el ADR, ni
en el RevPAR, ni en las noches vendidas. Es un cargo de cancelación, y se informa aparte.

**Qué gana quien lo usa.** Deja de regalar la noche por una ausencia, y no tiene que
perseguir el cargo a mano.

**Qué gana la empresa.** Dos cosas: recupera parte del ingreso perdido y, sobre todo, sus
indicadores de rendimiento no se contaminan con dinero que no es de habitaciones.

**Dónde lo ves.** Detalle de la reserva y Finanzas (la penalización aparece en su propia
línea).

---

### H10 · ¿Gané dinero con esta reserva? 🎯

**Qué hace.** Calcula, para cada reserva, el bruto, las comisiones, los gastos, el neto, el
margen y **si está cobrada**.

**Cómo funciona.** El bruto es la suma de las líneas (habitación + extras). Al neto se le
restan comisiones de canal y gastos imputados. Y el estado de cobro **se deriva de los pagos
reales**, nunca se guarda a mano: así no puede aparecer «pagado» en una reserva que nadie
pagó.

**Qué gana quien lo usa.** La respuesta a la pregunta que ningún Excel responde bien:
*¿esta reserva de Booking al 18 % de comisión me deja dinero o me lo quita?*

**Qué gana la empresa.** Decisiones de canal y de precio basadas en margen, no en volumen.
Vender mucho a comisión alta puede ser peor que vender poco.

**Dónde lo ves.** Hospitality → Finanzas y el detalle de cada reserva.

---

### H11 · Los totales del negocio 🎯

**Qué hace.** Suma las reservas del período y las agrupa: total, por canal, por propiedad y
por estado de cobro. Con exportación a CSV.

**Cómo funciona.** Un solo módulo lee todos los datos de dinero, para que Finanzas y Reportes
no cuenten cosas distintas. Una reserva **cancelada o no-show no es una venta** (no suma
bruto), pero **si hubo pagos, el dinero se informa igual**: salió de verdad. Y cuando las
reservas están en monedas distintas, el sistema no elige una: agrupa por moneda y lo dice.

**Qué gana quien lo usa.** Sabe qué canal le trae dinero, qué propiedad rinde más y cuánto
tiene pendiente de cobro, sin montarlo en una hoja de cálculo.

**Qué gana la empresa.** Un propietario que ve por canal decide dónde pone sus habitaciones.
Es retención: el informe que justifica la cuota.

**Dónde lo ves.** Hospitality → Finanzas y Reportes (pestaña Ventas).

---

### H12 · Los indicadores del hotel 🎯

**Qué hace.** Calcula ocupación, ADR (ingreso medio por noche), RevPAR (ingreso por
habitación disponible), estancia media, cancelaciones, no-shows y antelación de reserva.

**Cómo funciona.** El detalle que los hace fiables: el ingreso de una reserva **se reparte
entre las noches que ocupa**. Si alguien paga 500 € por 5 noches, cada noche carga 100 €, y
con eso se calcula el ADR. Todos los informes usan la misma definición de «noche ocupada».

**Qué gana quien lo usa.** Compararse consigo mismo en el tiempo: ¿este mes lleno mejor que
el pasado a mejor precio?

**Qué gana la empresa.** Son los números con los que un hotel decide precios. Sin ellos, la
conversación de venta se queda en «¿tiene calendario?».

**Dónde lo ves.** Hospitality → Dashboard y Reportes.

---

### H13 · Los informes que se exportan 🎯

**Qué hace.** Genera los informes de operación, ventas, propiedades y financiero, y los saca
en CSV.

**Cómo funciona.** No reinterpreta nada: la noche ocupada es la misma definición de H12 y el
dinero viene de H11.

**Qué gana quien lo usa.** Lo lleva a su gestoría o a una reunión sin copiar pantallas.

**Qué gana la empresa.** Que el dato que sale del sistema sea el mismo que se enseña en
cualquier informe. Es credibilidad.

**Dónde lo ves.** Hospitality → Reportes.

---

## BLOQUE C · Cumplir con la ley sin trabajo manual

*El RD 933/2021, explicado sin jerga.*

---

### H14 · El parte de viajeros al Ministerio 🎯

**Qué hace.** Construye y envía la comunicación obligatoria de viajeros al Ministerio del
Interior (Servicio de Comunicación Hospedajes), **con el contrato oficial**, no con APIs de
terceros.

**Cómo funciona.** El sistema arma el XML exactamente como pide la especificación oficial
(versión 3.1.2), lo comprime en ZIP, lo codifica en Base64 y lo envía en un sobre SOAP al
endpoint del Ministerio —el de pruebas o el de producción, sin posibilidad de apuntarlo a un
tercero—. Un barrido automático lo hace cada hora, cumpliendo el plazo legal de 24 horas
**sin que nadie pulse un botón**.

Si el Ministerio rechaza el parte, el sistema no se queda en «error»: traduce el código de
rechazo a **qué campo hay que corregir**.

**Qué gana quien lo usa.** La obligación legal deja de ser una tarea de recepción. Antes, al
canal le llegaban nombre y poco más: una persona tenía que completar cada parte a mano.

**Qué gana la empresa.** Cumplimiento sin depender de intermediarios, y una respuesta clara
ante la pregunta «¿esto cumple con Hacienda y con Interior?». Es una barrera de entrada al
sector.

**Dónde lo ves.** Hospitality → Registro de viajeros.

---

### H15 · El parte que se reintenta solo y avisa cuando se rinde 🤖 + 🎯

**Qué hace.** Gestiona los reintentos de un parte que falló, decide cuándo darse por vencido
y avisa al hotel —por email y en pantalla— cuando ya no lo va a reintentar solo.

**Cómo funciona.** Hasta **5 intentos**, esperando cada vez el doble:

```
1.er fallo → espera 1 hora
2.º fallo  → espera 2 horas
3.er fallo → espera 4 horas
4.º fallo  → espera 8 horas
5.º fallo  → 16 horas  →  ABANDONADO: aviso al hotel
```

Esa espera creciente evita machacar al Ministerio si está caído, y cada pasada del barrido
aterriza a una hora ligeramente distinta (jitter) para no golpear siempre al mismo minuto.
Cuando un parte se abandona, el aviso no dice «error»: dice **qué corregir**.

**Qué gana quien lo usa.** El hotel sabe que hay una estancia que el Ministerio no ha
recibido y exactamente qué falta, sin leer logs ni abrir reserva a reserva.

**Qué gana la empresa.** Un incumplimiento legal que se autodetecta y se comunica es cien
veces menos peligroso que uno silencioso.

**Dónde lo ves.** Registro de viajeros, Reportes y el email de aviso.

---

### H16 · Los datos del huésped, completos sin llamarle 🎯

**Qué hace.** Determina qué le falta al viajero para que su parte salga completo, y se lo
pide **al huésped** en el proceso de reserva o de check-in.

**Cómo funciona.** Normaliza documentos y fechas, y hereda los datos del titular: quien
reserva no tiene que repetir sus datos por cada acompañante. Admite hasta 30 viajeros por
reserva.

**Qué gana quien lo usa.** El parte nace completo y sale solo; recepción no persigue
documentos por teléfono.

**Qué gana la empresa.** Menos trabajo manual en el hotel (objeción habitual: «¿esto me da
más trabajo?») y menos partes rechazados.

**Dónde lo ves.** El check-in online y la pantalla de reservas.

---

### H17 · Las preguntas del hotel al huésped 🎯

**Qué hace.** El hotel pregunta al huésped lo que necesita saber (hora de llegada, matrícula,
mascotas…) y el sistema mide si los recordatorios consiguen respuesta.

**Cómo funciona.** La regla es tajante: estas preguntas y sus respuestas **son del hotel y
nunca viajan en el parte** al Ministerio, porque ese formato es cerrado —un campo de más
rechazaría la comunicación entera—. La hora de llegada, cuando el huésped la da, **manda
sobre la convención de las 15:00** en la hoja de limpieza.

**Qué gana quien lo usa.** Información operativa real (saber a qué hora llega alguien cambia
la planificación del día) sin arriesgar el cumplimiento legal.

**Qué gana la empresa.** Personalización sin desarrollo a medida para cada hotel.

**Dónde lo ves.** Configuración de preguntas y el formulario del check-in.

---

## BLOQUE D · Reputación e idioma

---

### H18 · La reseña, del huésped a la web 🎯

**Qué hace.** Pide la reseña al huésped tras el check-out, la somete a moderación del hotel
y publica en la web solo lo aprobado. Además importa las reseñas históricas de las OTAs.

**Cómo funciona.** Entre 24 y 72 horas después del check-out, el sistema envía un enlace
personal (en español o inglés) para puntuar y comentar. La reseña nace **pendiente**: el
hotel decide si se publica. La web pública solo muestra las publicadas, y la media se
calcula **solo con ellas** —sin reseñas no se enseña un 0 engañoso—. Las reseñas históricas
se importan desde un CSV de la OTA y nacen publicadas, porque ya pasaron su filtro; una
huella digital evita que subir el mismo fichero dos veces duplique nada.

**Qué gana quien lo usa.** Una web que no arranca vacía y un flujo de reputación que no hay
que copiar a mano de Booking.

**Qué gana la empresa.** Las reseñas mueven la conversión directa. Y el hotel ve la evolución
por propiedad y por canal, para saber si sus mejoras sirven.

**Dónde lo ves.** Hospitality → Reseñas y la web pública del motor.

---

### H19 · Dos idiomas de verdad 🎯

**Qué hace.** Atiende la web, el formulario de reseñas y los emails al huésped en español e
inglés.

**Cómo funciona.** El idioma por defecto es **siempre el español**: un enlace antiguo o
corrupto nunca deja la página en un idioma indeterminado. Un huésped que reservó en inglés
recibe sus comunicaciones en inglés. Y la regla técnica que lo hace sostenible: **un texto
nuevo no compila hasta que sabe decirse en los dos idiomas**.

**Qué gana quien lo usa.** El huésped internacional no se pierde en el momento de pagar, que
es donde más duele.

**Qué gana la empresa.** Un hotel de costa o de ciudad con clientela extranjera convierte
mejor. Es una venta directa contra OTAs.

**Dónde lo ves.** La web pública (`?lang=en`), el check-in y los emails automáticos.

---

## BLOQUE E · El día a día de recepción

---

### H20 · La lista del día y la hoja de limpieza 🎯

**Qué hace.** Saca la lista de llegadas y salidas en CSV para recepción y una hoja
imprimible para housekeeping, con las unidades, horarios y notas.

**Cómo funciona.** El CSV usa el formato que abre Excel sin líos (BOM UTF-8 y punto y coma).
Incluye una columna por cada pregunta del hotel, así que recepción ve las respuestas sin
abrir reserva a reserva. La hoja de limpieza resume las tareas por unidad —no las duplica—
y usa la hora de llegada que dio el huésped cuando existe; si no, la convención del hotel
(15:00 llegada / 11:00 salida).

**Qué gana quien lo usa.** Recepción trabaja sobre papel o en su Excel de siempre, y
housekeeping recibe una hoja con casillas para marcar lo que ya limpió.

**Qué gana la empresa.** Adopción. Un sistema que obliga a cambiar de rutina se abandona; uno
que imprime la hoja que ya usaban, no.

**Dónde lo ves.** Exportar desde reservas e imprimir la hoja de housekeeping.

---

## BLOQUE F · Hablar con los canales

---

### H21 · La capa de conectividad 🎯

**Qué hace.** Cinco algoritmos que mantienen al día la conversación con Booking, Airbnb y
demás: empujar disponibilidad y precios, traer reservas, detectar lo que se quedó sin
aplicar y **explicar los fallos**.

**Cómo funciona.**

| Pieza | Qué resuelve |
|---|---|
| **Sincronización** | Cada cambio de reserva o de unidad empuja inventario y tarifas al canal. Sin reintentos ciegos: cada fallo queda con su causa |
| **Reconciliación diaria** | Compara con el canal y detecta reservas que no llegaron, cambios no aplicados y cancelaciones perdidas |
| **Incidencias** | Cuando un webhook no puede registrar una reserva porque el código de habitación no coincide, la deja como incidencia y propone el vínculo |
| **Causa del fallo** | 401/403 → «credenciales rechazadas»; 5xx o timeout → «sin respuesta del servicio». Se arreglan distinto, así que se dicen distinto |
| **Saneado** | Los errores del proveedor pueden reflejar credenciales: se ocultan antes de mostrarse o guardarse |

**Qué gana quien lo usa.** Sabe qué pasó y qué hacer: «reconecta tus credenciales» no es lo
mismo que «el proveedor está caído, espera».

**Qué gana la empresa.** Es la pieza que convierte un PMS en un sistema conectado. Y su
calidad se mide en incidencias resueltas, no en funciones.

**Dónde lo ves.** Hospitality → Conectividad y el panel de estado.

---

## BLOQUE G · La plataforma que lo sostiene

---

### H22 · El dinero siempre en la moneda correcta 🎯

**Qué hace.** Decide en qué moneda se escribe cada cosa y cómo se muestra el dinero en toda
la plataforma.

**Cómo funciona.** La divisa se busca por orden: primero el dato real, luego la unidad o el
inventario, luego la moneda configurada del hotel. **La última opción es un valor de
seguridad, nunca una elección.** Ese orden evita el peor error posible: crear una tarifa o
un cobro en pesos para un hotel español.

**Qué gana quien lo usa.** Los importes son los suyos, con su formato y su símbolo.

**Qué gana la empresa.** Vender en varios países sin que cada despliegue sea un riesgo
contable.

**Dónde lo ves.** En todas las pantallas con importes.

---

### H23 · Permisos que se entienden 🎯

**Qué hace.** Decide quién puede hacer qué, **por capacidad** («puede gestionar finanzas»,
«puede editar reservas») y no por el nombre del rol.

**Cómo funciona.** Si un hotel llama «Anfitrión» a su rol, sigue pudiendo cobrar y editar.
Además, la interfaz no ofrece botones que vayan a fallar: si no tienes la capacidad, la
acción no se muestra.

**Qué gana quien lo usa.** No hay callejones sin salida: el botón que se ve, funciona.

**Qué gana la empresa.** Cada hotel configura sus roles con sus nombres sin que el sistema se
rompa. Y el usuario no se frustra con errores de permiso.

**Dónde lo ves.** Toda la gestión de equipo y las acciones del dashboard.

---

### H24 · El estado de los trabajos automáticos 🎯

**Qué hace.** Muestra, en un panel, qué barridos automáticos existen, cuándo corrieron por
última vez, con qué resultado y cuándo toca el siguiente.

**Cómo funciona.** Es un registro en memoria del proceso: al reiniciar se reinicia el
contador (una decisión consciente: muestra el estado real del sistema vivo).

**Qué gana quien lo usa.** Ver de un vistazo si los holds, los partes y las sincronizaciones
están corriendo, sin abrir logs.

**Qué gana la empresa.** Soporte proactivo: se detecta un barrido caído antes de que el
cliente llame.

**Dónde lo ves.** Panel de administración → estado de los crons.

---

# PARTE 2 · Familia comercial
### El sistema que hace mejores a los vendedores y avisa antes de perder un cliente

---

## BLOQUE H · Formar al equipo

*Enseñar a vender sin quemar clientes reales.*

---

### C1 · El cliente simulado (roleplay) 🤖

**Qué hace.** La IA se pone en el papel de un cliente **concreto y real** del que ya tenemos
historial, y el vendedor practica con él antes de la llamada de verdad.

**Cómo funciona.** El sistema coge las últimas notas e interacciones de ese lead y construye
su «gemelo digital»: sus preocupaciones, su lenguaje, su estado. El vendedor escribe su
argumento y la IA responde como lo haría ese cliente —en formato de chat o llamada—,
indicando además qué tipo de objeción ha puesto (precio, confianza, tiempo…) y con qué
ánimo.

**Qué gana quien lo usa.** Un comercial nuevo se equivoca con la IA, no con un cliente que
vale miles de euros. Y practica la conversación exacta que va a tener.

**Qué gana la empresa.** Un vendedor que llega a la llamada real con la objeción ya ensayada
cierra más. Y no se pierde ningún cliente por ser el primer intento de alguien.

**Dónde lo ves.** Ficha del lead → Simulador de negociación.

---

### C2 · La dificultad que sube sola 🤖

**Qué hace.** Cuando un vendedor ya es bueno, el cliente simulado se vuelve mucho más duro.

**Cómo funciona.** Si su mejor puntuación supera 85, se activa el «modo leyenda»: el cliente
llega ocupado, de mal humor, interrumpe, cuestiona el retorno de la inversión sin piedad y
avisa de que tiene una oferta más barata. Si no, el modo estándar plantea objeciones
normales sobre precio, tiempo e implantación.

**Qué gana quien lo usa.** El bueno no se aburre y el nuevo no se frustra: cada uno entrena
en su nivel.

**Qué gana la empresa.** El entrenamiento no se estanca en el vendedor estrella, que es
justo el que más puede mejorar.

**Dónde lo ves.** El simulador, automáticamente.

> **Nota honesta:** el modo difícil estaba roto sin que se notara: miraba el récord del
> hotel entero en una columna donde nunca podía estar, así que nadie entrenaba en su
> nivel real. Corregido — ahora cada vendedor escala según SU mejor puntuación — y si
> alguien practica sin sesión, el modo es estándar: nunca se usa el récord de otro.

---

### C3 · El informe de la sesión (post-mortem) 🤖

**Qué hace.** Evalúa la práctica terminada y da una nota de cierre, el argumento más fuerte,
un punto de mejora y la técnica que usó el vendedor.

**Cómo funciona.** La IA analiza la conversación con cuatro criterios: manejo de objeciones,
aporte de valor (¿habló de beneficios o solo de características?), técnica de cierre y
escucha activa. Devuelve una puntuación de 0 a 100 y consejos accionables. Si el vendedor
bate su récord con una evaluación real, se le avisa a él y **al equipo entero** (un «choque
esos cinco»); si la IA no pudo puntuar la sesión (caída o respuesta ilegible), la práctica
se guarda igual pero **no se celebra**: el récord solo se rompe con una nota de verdad.

**Qué gana quien lo usa.** Feedback inmediato y concreto, en vez de esperar a que un
supervisor se siente un día a escuchar llamadas.

**Qué gana la empresa.** Un supervisor puede ver 50 sesiones sin escuchar 50 llamadas.
Y la cultura de mejora continua se vuelve visible.

**Dónde lo ves.** Al terminar la simulación.

---

### C4 · El manual vivo de ventas (Playbook) 🤖

**Qué hace.** Cuando una sesión es excelente, la respuesta ganadora entra automáticamente en
el manual de ventas del equipo.

**Cómo funciona.** Si la puntuación llega a 90, el sistema guarda la objeción, la respuesta
que funcionó, la técnica y la puntuación. Todo eso aparece en la Academia como **Living
Playbook**: el conocimiento deja de ser de una persona y pasa a ser del equipo. Un vendedor
nuevo no empieza de cero: empieza con los argumentos que ya funcionaron.

**Qué gana quien lo usa.** El que llega nuevo aprende de los mejores sin esperar formación
presencial.

**Qué gana la empresa.** Onboarding más rápido y discurso consistente: todo el equipo cuenta
la misma historia con las mejores palabras.

**Dónde lo ves.** Academia → Living Playbook.

> **Nota honesta:** la clasificación por tema era la mejora más clara de esta familia y
> ya está hecha: el tema se deduce de lo que se dijo en la sesión, siempre igual ante la
> misma conversación (antes salía al azar). La deduplicación también está cerrada: si dos
> sesiones tratan la misma objeción (el sistema la reconoce aunque esté escrita con otras
> palabras: mayúsculas, tildes o signos), el manual conserva UNA lección, no dos casi
> iguales.

---

### C5 · El ranking de cerradores 🤖

**Qué hace.** Es un CONCURSO con ediciones mensuales: cada mes arranca de cero, el top 10
del mes se ve en pantalla y al acabar el mes el ganador queda congelado para siempre con
su corona.

**Cómo funciona.** El ranking que ves es SOLO del mes en curso: practicar este mes mueve
el marcador, lo de agosto no cuenta para septiembre. Cuando el mes termina, la primera
persona que mira el ranking congela la edición: el sistema cierra el mes con las sesiones
de ese mes, corona al ganador y lo añade a la lista de «Ediciones cerradas». Un mes sin
práctica no corona a nadie.

**Qué gana quien lo usa.** Competición sana y reconocimiento público: practicar tiene
recompensa visible.

**Qué gana la empresa.** El responsable de ventas identifica de un vistazo a sus mejores
cerradores y a quién necesita refuerzo.

**Dónde lo ves.** Academia → **Ranking de Cerradores**, justo encima del manual de
lecciones (Living Playbook).

> **Nota honesta:** faltaba lo más importante — que alguien lo viera, y que fuera un
> concurso de verdad. Las dos cosas ya están: el ranking vive en la Academia y es una
> liga mensual con reinicio — quien llega tarde puede ganar, porque la historia acumulada
> ya no pesa. A igual media, sube quien más sesiones completó: la constancia empata con
> el golpe de suerte.

---

## BLOQUE I · No perder al cliente

*Detectar el riesgo antes de que sea una baja.*

---

### C6 · La salud de cada oportunidad 🎯

**Qué hace.** Puntúa de 0 a 100 cada oportunidad de venta y la clasifica: **sana**, **en
aviso**, **crítica** o **zombi**.

**Cómo funciona.** Empieza en 100 y resta:

| Señal | Cuánto resta | Por qué |
|---|---|---|
| **Estancamiento** | hasta 40 | 5 puntos por cada día parado más allá del séptimo |
| **Falta de actividad** | hasta 40 | sin contacto, 40; luego 8 por día desde el tercero |
| **Incumplir el plazo** | 20 | el plazo depende de la prioridad (5, 10 o 20 días) |

Con menos de 50 ya es crítica y con menos de 30, «zombi»: una oportunidad que nadie mueve y
nadie cierra. El sistema la recalcula para todas las oportunidades activas.

**Qué gana quien lo usa.** La oportunidad que llevaba 20 días parada deja de ser invisible.
El comercial ve dónde poner la energía hoy.

**Qué gana la empresa.** Se detecta la pérdida **antes** de perderla. Es la diferencia entre
un CRM que guarda datos y uno que avisa.

**Dónde lo ves.** Panel comercial y briefing del día.

---

### C7 · El vigilante del pipeline 🎯

**Qué hace.** Revisa todas las oportunidades, avisa por Telegram de las críticas y las
etiqueta solo.

**Cómo funciona.** Si una oportunidad está crítica, vale más de 5.000 y no se ha avisado en
las últimas 24 horas, manda una alerta —con el valor, el nombre y la salud— para que no haya
aviso duplicado todos los días. Además etiqueta automáticamente las mejores («caliente») y
las peores («zombi»).

**Qué gana quien lo usa.** El aviso llega al móvil de quien puede hacer algo, no se queda en
un panel que hay que recordar mirar.

**Qué gana la empresa.** El riesgo medido se convierte en acción. Un sistema que solo mide y
no avisa no salva ninguna venta.

**Dónde lo ves.** Alertas de Telegram y las etiquetas de las oportunidades.

---

### C8 · El entrenador de la oportunidad 🤖

**Qué hace.** Analiza una oportunidad concreta y devuelve la estrategia: cómo está el ánimo
del cliente, qué le duele, qué hacer a continuación, qué responder a cada objeción y cuánto
riesgo hay de que desaparezca sin decir nada.

**Cómo funciona.** La IA lee las notas, las actividades, el contacto y la empresa, y propone
un plan paso a paso. La probabilidad de «desaparecer» (ghosting) es la señal más valiosa:
el cliente que deja de contestar es el que se pierde sin que nadie se entere.

**Qué gana quien lo usa.** Llega a la llamada con un plan y con los contra-argumentos
preparados, en vez de improvisar.

**Qué gana la empresa.** Un vendedor medio rinde como uno bueno: la estrategia del mejor
queda a disposición de todos.

**Dónde lo ves.** Ficha de la oportunidad.

> **Nota honesta:** el riesgo de desaparición lo estima la IA y hoy nadie comprueba si
> acierta. La mejora pendiente es medirlo contra lo que pasa después. De camino, la
> guardia destapó y corrigió un agujero: la ficha de la oportunidad se consultaba por id
> a secas, así que quien conociera el identificador de otra empresa podía leer su
> estrategia; ahora cada consulta lleva la empresa en el filtro.

---

### C9 · El piloto automático con freno 🎯

**Qué hace.** Ejecuta las acciones que propone la IA **solo cuando el hotel lo ha autorizado
y la confianza es alta**; si no, las deja como sugerencia para que las apruebe una persona.

**Cómo funciona.** Si la confianza es 0,7 o más, el sistema puede crear la tarea, redactar el
borrador o escalar la oportunidad. Si es menor, **sugiere y espera**. Y toda decisión —la
ejecutada y la sugerida— queda registrada con su razonamiento, para poder explicar de dónde
salió.

**Qué gana quien lo usa.** Automatiza lo aburrido (crear una tarea de seguimiento) sin
entregar decisiones delicadas a una máquina.

**Qué gana la empresa.** Productividad sin pérdida de control. Y el registro de decisiones es
oro para mejorar el sistema: se aprende de lo que el humano acepta y rechaza.

**Dónde lo ves.** Configuración del hotel (piloto automático) y el historial de decisiones IA.

---

### C10 · El briefing de la mañana 🤖

**Qué hace.** Prepara cada mañana a quién hay que llamar primero, con los motivos.

**Cómo funciona.** Ordena las oportunidades por salud y pide a la IA que resuma las
prioridades y los riesgos del día.

**Qué gana quien lo usa.** Empieza el día con la lista hecha, no delante de una tabla de 200
líneas.

**Qué gana la empresa.** El tiempo del comercial se va en vender, no en decidir a quién
llamar.

**Dónde lo ves.** Panel comercial, a primera hora.

---

## BLOQUE J · La salud del negocio

---

### C11 · La tasa de abandono de clientes 🎯

**Qué hace.** Calcula cuántos clientes se van, la tasa de cancelación y el valor de vida de
un cliente (LTV).

**Cómo funciona.** Compara los clientes activos al principio del período con los que se
quedaron, y con esa tasa calcula cuánto vale de media un cliente a lo largo del tiempo.

**Qué gana quien lo usa.** *(Es un indicador interno de la plataforma, no se enseña al
hotel.)*

**Qué gana la empresa.** Es el termómetro del negocio: si el abandono sube, crecer cuesta
más que retener.

**Dónde lo ves.** Métricas internas.

> **Nota honesta:** hoy mide el pasado, no predice. Un paso natural —y muy valioso— es
> detectar **qué cliente está en riesgo** por su forma de usar el sistema, antes de que
> cancele.

---

### C12 · El riesgo de perder a un compañero 🎯

**Qué hace.** Estima el riesgo de que un empleado deje la empresa, cruzando su carga de
trabajo con su implicación.

**Cómo funciona.** Analiza la carga de proyectos y el compromiso, y clasifica a cada persona
en riesgo alto, medio o bajo, ordenando el equipo por gravedad.

**Qué gana quien lo usa.** El responsable ve a quién se le está quemando antes de que
presente la dimisión.

**Qué gana la empresa.** En un negocio de servicios, perder a una persona clave cuesta más
que perder un cliente. Esto es gestión preventiva, no una encuesta de clima.

**Dónde lo ves.** Informes de recursos humanos.

---

### C13 · La puerta de práctica 🎯

**Qué hace.** Cuando una oportunidad entra en riesgo crítico, el sistema no solo avisa:
exige practicar la conversación con ese cliente concreto antes de permitir contactarlo, y
abre la puerta en cuanto la práctica alcanza una puntuación suficiente.

**Cómo funciona.** El vigilante de la salud detecta la oportunidad crítica y la marca:
«práctica requerida». Desde ese momento, las llamadas, citas e interacciones con el
cliente están bloqueadas — no como castigo, sino como preparación obligada. En la ficha
aparece un aviso ámbar con el botón «Practicar ahora»: el simulador abre la conversación
con el gemelo digital de ESE cliente. Cuando la sesión alcanza 70 puntos o más, la marca
desaparece, el bloqueo se levanta y queda constancia en la línea de tiempo.

**Qué gana quien lo usa.** El comercial no se lanza a una llamada perdida: llega con la
conversación ensayada y con el ánimo real del cliente. La exigencia es única y clara:
70 puntos y a vender.

**Qué gana la empresa.** El ciclo completo de mejora funciona solo: detectar riesgo →
practicar → vender mejor. La oportunidad crítica, que antes era solo una alerta que
podía ignorarse, tiene ahora un camino obligado de recuperación.

**Dónde lo ves.** Ficha de la oportunidad (aviso ámbar) → Practicar ahora.

> **Nota honesta:** el 70 es un punto de partida razonable, no un número calibrado con
datos. El sistema ya registra lo necesario para ajustarlo: práctica, puntuación y qué
pasó después con la oportunidad.

---

# Resumen: qué gana cada uno

### Lo que gana el hotel que lo usa

| Gana | Con qué algoritmos |
|---|---|
| **No vender dos veces la misma noche** | H1, H2, H21 |
| **No perder noches por olvidos** | H7, H8, H9 |
| **Cobrar bien y a la cuenta correcta** | H4, H5, H6, H10, H11, H22 |
| **Decisiones con números fiables** | H12, H13 |
| **Cumplir la ley sin trabajo extra** | H14, H15, H16, H17 |
| **Convertir mejor y cuidar la reputación** | H18, H19 |
| **Que recepción y limpieza trabajen a su manera** | H20, H23, H24 |

### Lo que gana el equipo de ventas

| Gana | Con qué algoritmos |
|---|---|
| **Practicar sin quemar clientes** | C1, C2, C3 |
| **Aprender de los mejores** | C4, C5 |
| **Saber a quién llamar hoy** | C6, C7, C10 |
| **Llegar con la estrategia hecha** | C8, C9 |
| **Recuperar oportunidades en riesgo practicando** | C13 |

### Lo que gana la empresa (Volkern)

| Gana | Cómo |
|---|---|
| **Producto que se defiende solo** | Cada regla tiene una única definición: no hay cifras contradictorias que discutir |
| **Cumplimiento como barrera de entrada** | El registro de viajeros con el contrato oficial del Ministerio |
| **Retención** | Informes por canal y propiedad, y reseñas que mueven la conversión directa |
| **Escalabilidad del equipo comercial** | El conocimiento queda en el Playbook, no en las personas |
| **Menos churn** | El riesgo se detecta antes (C6, C7), no cuando el cliente ya se fue |
| **Vender en varios países** | La moneda sale de los datos (H22), no de un valor por defecto |

---

# Estado real: qué está probado y qué no

Es la parte que conviene saber antes de prometer nada.

| Familia | Algoritmos | Con pruebas | Situación |
|---|---|---|---|
| **Hospitality** | 24 | 114 ficheros de prueba | Maduro. Cada regla tiene su guardia |
| **Familia comercial** | 13 | **89** (C3: 19 · C6: 32 · C7: 12 · C9: 8 · C13: 18) | El ciclo del riesgo y su evaluador de práctica tienen red; el resto sigue sin ella |

Lo que esto significa en la práctica: en Hospitality, un cambio que rompe una regla hace
saltar un aviso automáticamente. En la parte comercial, la salud de la oportunidad (C6),
el freno del piloto automático (C9), la puerta de práctica (C13), el cliente simulado
(C1), el informe de la sesión (C3), el manual de lecciones (C4) y el ranking en pantalla
(C5) ya tienen esa red; la pieza menos terminada es la calibración del riesgo de
desaparición (C8) — el filtro del modo difícil (C2) quedó corregido y con pruebas propias.

**Las cinco mejoras con más retorno**, en orden:

1. **Poner pruebas al resto de la familia comercial** (C10, C11,
   C12). El gemelo del roleplay (C1), la escalada del modo difícil (C2), el scoring del
   roleplay (C3), la cosecha al Playbook (C4), el ranking (C5), los de más riesgo (C6,
   C9), el entrenador (C8) y el ciclo del riesgo completo (C7, C13) ya están cubiertos.
2. **Medir si las predicciones aciertan — la salud de la oportunidad ya está
   instrumentada**: cada recálculo deja una instantánea con su score y, al cerrar el
   deal, el desenlace queda marcado; el informe de calibración compara ambos y calcula
   precisión y recall del corte actual y de cortes alternativos. Queda acumular muestra
   (el semáforo pide ≥100 deals cerrados por tenant) y calibrar el riesgo de
   desaparición del entrenador (C8), que aún no mide sus aciertos.
3. ~~**Terminar el Playbook** (C4): clasificar por contenido, no por aproximación.~~
   **Hecho**: la lección se clasifica por lo que se dijo en la sesión (precio, retorno,
   cierre, confianza, técnica) de forma determinista, guarda la objeción real del
   cliente en vez de una frase fija, y **deduplica**: lecciones muy parecidas entran
   una sola vez (huella por tema + objeción normalizada, única por tenant).
4. ~~**Montar el ranking en pantalla y darle ediciones** (C5)~~ → **Hecho**: la Academia
   enseña el concurso completo — liga mensual con reinicio, ganador congelado por edición
   y el historial de ganadores visible.
5. **Conectar la formación automática — ya hecho con la puerta de práctica (C13):** el
   sistema detecta el riesgo, lanza la exigencia de practicar con los datos del cliente y
   levanta el bloqueo al alcanzar la puntuación mínima. El ciclo «detectar riesgo →
   practicar → vender mejor» existe; queda por calibrar el 70 con datos de desenlace.

Para el detalle técnico de cualquiera de estos puntos (funciones exactas, constantes,
defectos concretos y qué instrumentar), el anexo `algoritmos-inventario.md` tiene una ficha
por algoritmo.
