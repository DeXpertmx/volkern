# Volkern Hospitality — Booking Engine, Payments y Finanzas

**Documento de arquitectura y fases (FASE 3)**
Fecha: 2026-09-11 · Estado: decisiones aprobadas, implementación por fases

Complementa al *Plan Maestro de Desarrollo — Volkern Hospitality v1.0*. Donde este
documento y el Plan Maestro se contradigan, gobiernan las decisiones aquí registradas
porque fueron tomadas explícitamente con el responsable del producto.

---

## 0. Decisiones aprobadas

| # | Decisión | Elección |
| --- | --- | --- |
| 1 | Modelo de cobro de las reservas del tenant | **Stripe Connect**, el tenant es el comerciante de fondos. Volkern puede cobrar una tarifa de plataforma. |
| 2 | Ubicación del Booking Engine | **Sección propia (14 secciones)**, con su configuración, previsualización y enlaces públicos. |
| 3 | Alcance de Finanzas (primera entrega) | **Rentabilidad por reserva + cobros**, reutilizando el ERP de Volkern para gastos, impuestos y facturación. |

### Reglas no negociables derivadas de las decisiones

1. **El Booking Engine NO tiene motor propio.** No crea disponibilidad ni reservas por su
   cuenta: usa el **Reservation Engine** y el **Availability Engine** centrales de
   Hospitality. Una reserva de la web entra exactamente al mismo flujo que una de OTA
   (Aiosell) o una manual.
2. **Un solo origen de disponibilidad.** No puede existir disponibilidad distinta para
   Booking, la web, el planning o los canales. Todo consumidor lee el mismo motor.
   **Prohibido** calcular disponibilidad por fuera de `lib/hospitality/availability.ts`
   (hay una guardia en tests que lo vigila).
3. **Stripe Connect, no cuenta única.** El dinero de una reserva pertenece al tenant.
   Volkern no actúa como intermediario de fondos.
4. **Nada de un segundo sistema financiero.** Gastos, impuestos, facturación y nómina se
   reutilizan del ERP (`lib/finance/`). Hospitality añade únicamente lo específico de
   reservas: líneas, pagos y rentabilidad.
5. **Trazabilidad total.** Cada pago, comisión y gasto queda ligado a
   `tenantId` y, cuando aplique, `propertyId`, `unitId` y `reservationId`.
6. **El proveedor de conectividad nunca es visible** al cliente final (regla de marca ya
   vigente).

---

## 1. Estructura del menú (14 secciones)

| Área | Sección | Estado |
| --- | --- | --- |
| **Experiencia** | Inicio | existe |
| | Puesta en marcha | existe |
| **Venta** | Planning | existe |
| | Reservas | existe |
| | Tarifas | existe |
| | **Booking Engine** | **nuevo** |
| **Operación** | Operaciones | existe |
| | Propiedades | existe |
| **Cliente** | Huéspedes | existe |
| | Comunicaciones | existe |
| | Automatizaciones | existe |
| **Dinero** | **Finanzas** | **nuevo** |
| **Inteligencia** | Dashboard | existe |
| | **Reportes** | **nuevo** |

Check-in/out, mantenimiento e integraciones siguen siendo **funcionalidades dentro de las
áreas**, no elementos de menú.

---

## 2. Arquitectura

```
                       RESERVATION ENGINE
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   OTA (Aiosell)      Direct Booking          Manual
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ↓
                     AVAILABILITY ENGINE
                              │
              ┌───────────────┴───────────────┐
              ↓                               ↓
          Aiosell                        Website
              ↓
     Booking / Airbnb / OTA
```

Y alrededor de cada reserva, siempre por eventos:

```
Reservation ──┬── CRM
              ├── Planning
              ├── Operations
              ├── Communications
              ├── Automations
              └── Finance  ──→ Stripe Connect (cobro del tenant)
```

**Regla de oro:** el Reservation Engine es el único que escribe reservas y el Availability
Engine el único que calcula disponibilidad. Todo lo demás consume sus eventos.

---

## 3. Modelo de datos (primera entrega)

### 3.1 Bloques de calendario (Calendar Blocks)

Lo que ocupa una unidad no siempre es una reserva. `HospitalityUnitBlock` incorpora
`tipo` para distinguir:

| tipo | Significado |
| --- | --- |
| `propietario` | Bloqueo del propietario (uso propio) |
| `mantenimiento` | Unidad fuera de servicio por incidencia |
| `administrativo` | Bloqueo administrativo / cierre comercial |

Reserva, limpieza y mantenimiento ya existen como entidades propias. Los cuatro tipos
**restan disponibilidad por el mismo motor**.

### 3.2 Líneas de la reserva — `HospitalityReservationItem`

Permiten construir el desglose que pide el propietario:

| Concepto | Importe |
| --- | --- |
| Alojamiento | €600 |
| Limpieza | €60 |
| Extras | €40 |
| **Ingreso bruto** | **€700** |

Campos: `tenantId`, `reservationId`, `propertyId`, `unitId`, `tipo`
(`alojamiento|limpieza|extra|otro`), `concepto`, `cantidad`, `importeUnitario`,
`importeTotal`, `moneda`.

### 3.3 Pagos — `HospitalityPayment`

Resuelven *Pagado / Pendiente / Parcial / Reembolsado*:

Campos: `tenantId`, `reservationId`, `propertyId`, `unitId`, `importe`, `moneda`,
`metodo` (`stripe|transferencia|efectivo|manual|otro`), `estado`
(`pendiente|pagado|parcial|reembolsado|fallido`), `referenciaExterna`,
`stripePaymentIntentId`, `fechaPago`, `notas`.

### 3.4 Cuenta de cobro del tenant — `HospitalityPaymentAccount`

Stripe Connect por tenant: `tenantId`, `provider` (`stripe`),
`stripeAccountId`, `estado` (`sin_conectar|pendiente|activo|restringido`),
`chargesEnabled`, `payoutsEnabled`, `moneda`, `pais`.

### 3.5 Rentabilidad

El resultado que ve el propietario:

```
Ingreso bruto                 €700
Comisión OTA                  -€105
Comisión pasarela             -€20
Gastos imputados              -€25
────────────────────────────────────
Ingreso neto                  €550
Margen                       78,57%
Cobrado                       €700
Pendiente                       €0
```

Nota de nomenclatura: **€700 es ingreso bruto** y **€550 es ingreso neto**. No se usa la
expresión "ingreso bruto después de gastos".

La comisión OTA ya llega desde el webhook (`HospitalityReservation.commission`), de modo
que la mayor parte de la rentabilidad es un **cálculo derivado**, no esquema nuevo.

---

## 4. Fases

### FASE 3.A — Cimientos de dinero y disponibilidad
- [ ] `tipo` en `HospitalityUnitBlock` + selector en el planning y leyenda.
- [ ] Modelos `HospitalityReservationItem`, `HospitalityPayment`,
      `HospitalityPaymentAccount` + migración.
- [ ] Módulo puro de rentabilidad y estado de cobro + tests.
- [ ] Guardia de "un solo motor de disponibilidad".

### FASE 3.B — Finanzas
- [ ] Sección **Finanzas**: por reserva, desglose, comisiones, pagos, pendiente, neto y margen.
- [ ] Vista de cobros (pagado / pendiente / parcial / reembolsado) y por canal.
- [ ] Enlace con el ERP para gastos e impuestos (sin duplicar entidades).

### FASE 3.C — Stripe Connect
- [ ] Alta de cuenta Connect por tenant (onboarding KYC) y su estado.
- [ ] Cobro de la reserva directa contra la cuenta **del tenant**.
- [ ] Registro del pago y conciliación con la reserva.

### FASE 3.D — Booking Engine (sección propia)
- [ ] Configuración: propiedades publicadas, moneda, política, anticipo.
- [ ] Previsualización de la experiencia de reserva.
- [ ] Reserva pública: fechas → huéspedes → disponibilidad (motor central) → precio → datos → pago.
- [ ] Enlaces públicos y embeds.
- [ ] La reserva entra al flujo común: disponibilidad, CRM, planning, automatizaciones, finanzas.

### FASE 3.E — Reportes
- [ ] Operación: ocupación, ADR, RevPAR, estancia media, no-shows, cancelaciones, limpiezas, incidencias.
- [ ] Ventas: reservas e ingresos por canal, reservas directas, antelación media.
- [ ] Finanzas: bruto, comisiones, gastos, cobros, pendientes, reembolsos, neto, margen.
- [ ] Por propiedad, con exportación.

---

## 5. Criterios de aceptación de la fase

1. Una reserva del Booking Engine es indistinguible de una de OTA en planning, disponibilidad,
   CRM, operaciones, automatizaciones y finanzas.
2. Bloquear una unidad (propietario, mantenimiento o administrativo) resta disponibilidad en
   el mismo motor y se comunica a los canales.
3. El desglose de una reserva cuadra: líneas = ingreso bruto = neto + comisiones + gastos.
4. El dinero de una reserva directa llega a la cuenta Stripe del tenant, no a la de Volkern.
5. Ningún módulo calcula disponibilidad por fuera del Availability Engine.
