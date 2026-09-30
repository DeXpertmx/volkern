# Benchmark UI/UX Hospitality — plataforma de referencia → Volkern

> Análisis de 7 capturas de la plataforma de un competidor (editor de
> alojamiento estilo Airbnb + inbox de mensajes + calendario multi-propiedad
> con precios) y cómo aplicarlas a nuestro módulo
> (`app/dashboard/hospitality/`). Fechas de análisis: 2026-09-30.

## 0. Qué hace bien la plataforma de referencia (síntesis)

1. **Todo es una tarjeta + panel lateral.** La ficha del alojamiento es una
   lista de tarjetas (Dirección, Distancias, Mapa personalizado, Indicaciones…)
   donde cada tarjeta muestra el **valor actual como resumen** ("2B Calle
   General Castaños, 40, 11201, Algeciras"). Pulsar abre un panel derecho
   (no un modal a pantalla completa) con footer fijo Cancelar/Guardar.
2. **El calendario es el centro de operaciones y de pricing a la vez.** Cada
   celda día×unidad muestra **precio por día (120 €) + aforo (👥 2)**; los días
   pasados van sombreados; las reservas son píldoras multicolores por canal con
   icono del canal; el clic abre un panel de reserva **con contexto financiero
   completo** (Pagado/Pendiente/Total, presupuesto con tarifa diaria + gastos de
   limpieza + política, cobros, saldo pendiente).
3. **El inbox trae la reserva al lado.** Tres paneles: conversaciones (con
   canal, rango de fechas y badge Reservada), hilo de chat con respuestas
   rápidas/adjuntos/IA, y panel derecho con **toda la reserva** (huésped,
   idioma, ETA llegada/salida, importes, WhatsApp, notas editables).
4. **Edición de ubicación de nivel Booking/Airbnb**: dirección con mapa Google
   embebido (Mapa/Satélite/fullscreen), distancias por tipo de transporte con
   toggle km/millas, mapa personalizado subible (drag & drop), indicaciones
   multi-idioma con editor de texto enriquecido.

---

## 1. Captura por captura → nuestro estado → hueco

### 1.1 Ficha del alojamiento (sidebar agrupada + tarjetas con resumen)

| En la captura | Nuestro módulo hoy | Hueco |
| --- | --- | --- |
| Sidebar agrupada en 3 bloques: *Detalles del alojamiento* (Descripción, Fotos, Ubicación, Contacto, Marcadores, Cumplimiento), *Configuración de reserva* (Precios, Disponibilidad, Políticas, Tarifas de temporada), *Canales* (Sincronizar ajustes) | Editor de propiedades con Vista global, chips, portada y `detalleAlojamiento` (sprint anterior); páginas separadas para tarifas/bloqueos/políticas | **Media**: la navegación agrupada tipo "ficha" es más clara que menús planos; mapear nuestras secciones a ese modelo de agrupación |
| Cada tarjeta muestra el valor actual como texto de resumen | Nuestros modales no siempre resumen el valor vigente al cerrar | **Baja**: mostrar resumen bajo cada tarjeta (dirección, nº fotos, política activa…) |

### 1.2 Ubicación — dirección con mapa

| En la captura | Nuestro módulo hoy | Hueco |
| --- | --- | --- |
| Formulario País/Dirección/CP/Ciudad/Estado + **mapa Google embebido** con marcador | `HospitalityProperty` **ya tiene** `direccion`, `ciudad`, `estadoProvincia`, `pais`, `cp`, `latitud`, `longitud` | **El modelo está completo; falta la UI**: sección Ubicación en el editor con mapa embebido y geocoding (el picker fija `latitud/longitud`) |

### 1.3 Distancias a transporte

| En la captura | Nuestro módulo hoy | Hueco |
| --- | --- | --- |
| Toggle km/millas + 6 distancias tipadas (Aeropuerto, Autobús, Metro, Tren, Autopista, Puerto) con icono y helper de decimales | Nada equivalente | **Nueva pieza**: `distancias Json` en la propiedad (`{aeropuertoKm, autobusKm, metroKm, trenKm, autopistaKm, puertoKm, unidad: 'km'|'millas'}`). Se publica en la ficha/booking engine |

### 1.4 Mapa personalizado (imagen propia)

| En la captura | Nuestro módulo hoy | Hueco |
| --- | --- | --- |
| Área drag & drop para subir imagen de mapa propio | No existe | **Nueva pieza**: `mapaPersonalizadoUrl` (reusar el pipeline de subida de fotos del editor). Útil para rutas de llegada dibujadas a mano |

### 1.5 Indicaciones multi-idioma

| En la captura | Nuestro módulo hoy | Hueco |
| --- | --- | --- |
| Editor de texto enriquecido con selector de idioma (Español…) | No existe en la propiedad | **Nueva pieza**: `indicaciones Json` (`Record<locale, html>`); el webhook/comunicaciones ya gestionan idioma de huésped (`guestData.language`), así que el consumo natural es el email de llegada y la ficha pública |

### 1.6 Inbox de mensajes con contexto de reserva

| En la captura | Nuestro módulo hoy | Hueco |
| --- | --- | --- |
| 3 paneles: lista de conversaciones (canal + fechas + badge), hilo con composer (adjuntar, respuestas rápidas, **generar con IA**), panel derecho con la reserva completa (idioma, ETA, importes, WhatsApp, notas) | Plantillas de comunicación CRUD + instancias WhatsApp + notificaciones in-app; **no hay inbox unificado** | **Pieza grande (P2)**: consolidar conversaciones por reserva. Los cimientos existen: plantillas ≈ respuestas rápidas, WhatsApp ya integrado. El panel de contexto puede reusar el panel de reserva del calendario |

### 1.7 Calendario multi-propiedad con precios por día

| En la captura | Nuestro módulo hoy | Hueco |
| --- | --- | --- |
| Filas = alojamientos (con foto e id), celdas = **precio/día + aforo**, pasados sombreados, píldoras por canal, selector "Todos los alojamientos" | Planning semanal por unidad con píldoras por canal (`channelStyle`), leyenda, bloqueos, vista Mes y Operaciones; selector de propiedad con "Todas" | **Sin precios ni aforo por celda** (P0): la tarifa ya existe en `HospitalityRatePlan` (tarifa, rangos) → renderizar precio/día y `👥 capacidad` bajo la píldora. Foto de la propiedad como avatar de fila (`property.fotos[0]`) |
| "+" para crear reserva desde la barra | No hay alta rápida desde la cuadrícula | **P1**: botón que abre alta manual con fechas preseleccionadas (validación de disponibilidad ya existente) |

### 1.8 Panel de reserva con contexto financiero

| En la captura | Nuestro módulo hoy | Hueco |
| --- | --- | --- |
| Estado + origen (#id, creado el, **desde Airbnb**), alojamiento + huéspedes, fechas + noches, **Pagado/Pendiente/Total** en 3 columnas, presupuesto con tarifa diaria + **gastos de limpieza** + política + condiciones, **cobros** con saldo, notas editables | Panel del planning: canal, estancia, huésped, importe único (`amountAfterTax`), solicitudes, check-in/out, tareas | **Enriquecer (P0/P1)**: `hospitality_payments` ya existe → resumen Pagado/Pendiente/Total; limpieza como línea (rate plan / tarifa); notas de la reserva; idioma y ETA si el `guestData` del canal los trae |

---

## 2. Plan de mejora priorizado

### P0 — alto valor, bajo riesgo (sin migraciones)

1. **Precios por día y aforo en el Planning** (`calendar/page.tsx`):
   - Precio: resolver por unidad el plan aplicable a la fecha (rangos del
     `HospitalityRatePlan` / `tarifaBase` de la unidad como fallback) y pintar
     `120 €` bajo la celda libre; en celdas ocupadas se puede omitir.
   - Aforo: capacidad publicada de la unidad (`capacidadMaxima`) junto al precio.
   - Días pasados sombreados (comparar `d.key < todayKey`).
2. **Panel de reserva financiero**: añadir al panel del planning un bloque
   `Pagado / Pendiente / Total` consultando los pagos de la reserva (o
   ampliar el payload de `/api/hospitality/reservations/[id]`).
3. **Avatar de propiedad en las filas** del planning (primera foto de
   `property.fotos`).

### P1 — necesitan migración pequeña o API nueva

4. **Sección Ubicación en el editor** (mapa embebido + geocoding + guardado de
   `latitud/longitud`). Campos ya en el modelo.
5. **Distancias + indicaciones + mapa personalizado**: `distancias Json`,
   `indicaciones Json` y `mapaPersonalizadoUrl` en `HospitalityProperty`
   (una migración aditiva), UI de tarjetas + panel lateral como la captura,
   consumo en comunicaciones (email llegada) y booking engine.
6. **Alta de reserva desde celda** del planning (preselección de fechas/unidad,
   valida disponibilidad, crea `pending` o hold).

### P2 — apuestas mayores

7. **Inbox unificado con contexto de reserva** (conversaciones por reserva,
   canal email/WhatsApp/plataforma, respuestas rápidas desde plantillas,
   composer con IA opcional). Reutilizar el panel de reserva del planning.
8. **Navegación de ficha agrupada** (sidebar 3 bloques) para el editor de
   propiedades, con resúmenes por tarjeta.

## 3. Notas de marca y coherencia

- Las capturas muestran logos de Booking/Airbnb: en nuestro producto, el
  nombre de canal es interno (el planning es superficie interna, vale
  `channelStyle`), pero **nunca** en superficies visibles al huésped
  (regla de marca del contrato de conectividad).
- El idioma de la UI del benchmark coincide con el nuestro (es-MX/es);
  mantener los mismos rótulos que ya usamos (Planning, Mes, Operaciones).
- Copiar **patrones**, no píxeles: nuestro design system (Card/Button/Dialog,
  `channelStyle`, `PRESENTACION_BLOQUEO`) manda.

## 4. Fuentes en el código

- Planning: `app/dashboard/hospitality/calendar/page.tsx` (grid, panel de
  reserva, bloqueos, operaciones) · `lib/hospitality/calendar.ts` (layout,
  ocupación).
- Tarifas: `app/dashboard/hospitality/tarifas/page.tsx` (planes por unidad).
- Modelo: `prisma/schema.prisma` → `HospitalityProperty` (ubicación completa,
  `fotos Json`, `detalleAlojamiento Json`), `HospitalityRatePlan`,
  `HospitalityPayment`.
- Editor de propiedades: componentes del sprint anterior (Vista global,
  chips, portada con fondo, drag & drop de fotos).
