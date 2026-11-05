# CRM Ventas — de la firma a la puesta en marcha

**Qué hacer, en qué orden y con qué criterio para que un cliente que contrata Volkern esté vendiendo con el CRM en dos semanas**

Fecha: **2026-10-31** · Autor del inventario: ingeniería de producto Volkern

> **Regla del documento.** Cada afirmación sobre lo que el producto hace hoy se apoya en el
> fichero que la sostiene, y va citado. Cuando algo no existe, se dice «no existe» y no se
> disfraza de roadmap. Este documento **no** es un plan comercial: es la secuencia de
> implementación y la lista de lo que hoy la bloquea.

## Cómo se ha verificado

| Fuente | Qué se leyó |
|---|---|
| Embudos y etapas | `lib/pipelines.ts` (etapas por categoría, límites por plan), `app/api/pipelines/route.ts`, `app/api/pipeline/stages/` |
| Importación | `lib/import/import-service.ts`, `import-clients.ts`, `import-catalog.ts`, `import-accounting.ts`, `pgc-mapper.ts`, `app/api/import/*`, `components/import/ImportWizard.tsx` |
| Otras puertas de datos | `app/api/contacts/import/route.ts`, `app/api/leads/import/route.ts`, `app/api/catalogo/import/route.ts` y su pantalla `app/dashboard/catalogo/page.tsx` |
| Módulos y personalización | `app/api/tenant/modules/route.ts`, `app/api/admin/tenants/[id]/modules/route.ts`, `lib/onboarding-modules.ts`, `lib/tenant-modules.ts`, `components/hubs/ConfiguracionDashboard.tsx` |
| Alta | `lib/provisioning/tenant-provisioner.ts` (tenant en trial de 14 días, módulos por vertical, canales) |
| Contabilidad | `lib/accounting/initializer.ts`, `lib/accounting/plans/catalog.ts` (PGC NORMAL/PYMES/MICRO + sector), `app/api/accounting/slots/route.ts`, `app/api/accounting/taxes/*` |
| Estado del CRM | [`crm-ventas-documento-tecnico.md`](./crm-ventas-documento-tecnico.md) (27-oct-2026, 533 pruebas del módulo en verde) y [`PENDIENTES.md`](./PENDIENTES.md) |
| Riesgos vecinos | [`marketing-documento-tecnico.md`](./marketing-documento-tecnico.md) §12 (acciones del canvas que fallan) |

---

## 0. La respuesta en una frase

El CRM no falla por falta de módulos —tiene más de los que un cliente usa en el primer año—.
Falla porque **el cliente no sabe qué tiene encendido, la importación está partida en cuatro
caminos (dos sin pantalla) y nadie ha definido qué significa «esto ya está listo»**. La solución
no es otro módulo: es una senda de siete fases con **puerta de salida medible**, una sola mesa de
datos y un checklist que se firma. Eso es lo que hay en este documento.

> **Relación con la alta guiada.** Lo que sigue es la senda **manual**, la que se puede ejecutar
> hoy. El objetivo de producto es que la conduzca un asistente que primero entiende al cliente
> (qué hace, qué le duele, qué quiere controlar, qué KPI persigue), después propone módulos con
> motivo, deja elegirlos, prepara la personalización y analiza los datos antes de importarlos:
> [`alta-guiada-por-ia.md`](./alta-guiada-por-ia.md). Las dos sendas comparten las mismas puertas
> de salida, para que la guía automática no invente un criterio distinto de «ya está listo».

---

## 1. El problema, tal como lo vive el cliente

Las cinco preguntas del cliente, traducidas a trabajo de implementación:

| Lo que dice el cliente | Lo que realmente está pidiendo | Dónde se resuelve hoy |
|---|---|---|
| «No sé qué módulos me funcionan» | Un inventario honesto de lo encendido, lo apagado y lo que aún no está terminado | `Configuración → Módulos` (PATCH `/api/tenant/modules`, con núcleo protegido y auditoría) + §2 de este documento |
| «No sé cómo personalizarlo» | Qué se toca sin código y qué no | §7: módulos, embudos, catálogo, roles, marca, moneda. **No** hay campos propios en oportunidades |
| «No sé configurar cada módulo» | Un orden de configuración y un responsable por módulo | §3, fases F2 y F4 |
| «No sé hacer mis embudos bien» | Criterio de diseño de etapas, no un Kanban bonito | §5: 1 embudo por ciclo de venta, 4–6 etapas, probabilidad = conversión histórica |
| «No sé cómo meter mis datos» | Una sola puerta para leads, clientes, empresas, proveedores, productos y saldos | §4: hoy hay cuatro caminos y dos huecos duros |

**El fallo de fondo es de producto, no del cliente.** La pantalla `/dashboard/importar` promete
«clientes, contabilidad o servicios» (`app/dashboard/importar/page.tsx`), pero el asistente
**no permite elegir qué se importa**: el tipo sale de la detección automática de plantillas
Sage/Microdata, y **no existe plantilla de catálogo**, así que la opción «servicios» es
inalcanzable desde la interfaz (medido: `ALL_TEMPLATES` en `import-service.ts` solo contiene
clientes, asientos y saldos de Sage y Microdata). Un cliente que sube su Excel de servicios
acaba importando **clientes** sin enterarse.

---

## 2. Qué módulos funcionan de verdad (semáforo)

Leyenda: 🟢 funciona y está probado · 🟡 funciona con una condición que hay que decir en voz alta ·
🔴 no está y no se debe vender como si estuviera.

| Pieza | Estado | Evidencia / condición |
|---|---|---|
| Embudos múltiples y etapas propias | 🟢 | `lib/pipelines.ts`; CRUD en `/api/pipelines` y `/api/pipeline/stages/[id]` + `reorder` |
| Oportunidades, salud del deal, HOT/ZOMBIE | 🟢 | `docs/crm-ventas-documento-tecnico.md` §6; 32 ficheros de prueba del módulo |
| Cotizaciones desde catálogo, PDF, enlace público, aceptación con código | 🟢 | §7 del documento técnico; la aceptación responde 428 hasta verificar email/WhatsApp |
| Contrato y orden de venta desde cotización | 🟢 | `contratos/from-cotizacion`, `ordenes-venta/[id]/facturar` (idempotentes) |
| Previsión (tres números), metas, tiempo de ciclo | 🟢 | `/dashboard/ventas/pronosticos`, `/api/deals/forecast` |
| Deal Coach, briefing de la mañana, autopiloto | 🟢 con límite | La IA solo ejecuta con autopiloto activo **y** confianza ≥ 0,7; por debajo queda como sugerencia |
| Catálogo de productos/servicios con import | 🟢 | `app/dashboard/catalogo` → `/api/catalogo/import` (alias de columnas, 20 MB, control de límite de plan) |
| Módulos on/off por el propio cliente | 🟢 | `PATCH /api/tenant/modules`: núcleo protegido, `TenantFeature` + `auditLog` |
| **Importar servicios desde `/dashboard/importar`** | 🔴 | El tipo `catalog` no se puede seleccionar ni detectar (§4) |
| **Importar proveedores** | 🔴 | No existe ruta ni plantilla; `Supplier` solo se crea a mano en `/dashboard/compras/proveedores` |
| **Importar oportunidades abiertas** | 🔴 | No existe import de `Deal`; migrar 300 oportunidades = 300 altas o API/MCP |
| **Campos personalizados en oportunidades/leads** | 🔴 | `customFieldValues` solo existe en `CatalogoItem`; `Lead`/`Deal`/`Contact` tienen `tags`, nada más |
| Compuerta de práctica | 🟡 | Bloquea bien, pero devuelve un 423 que apunta a `/api/training/roleplay`, ruta que no existe (§12.4 del técnico) |
| Automatizaciones con acciones de marketing | 🟡 | Trece acciones del canvas fallan por modelos inexistentes (`marketing-documento-tecnico.md` §12). **No** encenderlas en la demo |
| Sincronización de saldos contables | 🟡 | Importa, pero no cuadra y clava el 1 de enero (§4) |
| Firma electrónica cualificada (eIDAS) | 🔴 | Hay sello y hash encadenado; no hay proveedor de firma cualificada |
| Cobro y comisiones dentro del CRM | 🔴 | El CRM cotiza y cierra; el dinero se mueve en el ERP |

### Comprobación obligatoria el día 0

El plan del tenant tiene que ser **un plan que exista en el código**. En producción quedaron
valores (`growth`, `enterprise`) que `getPlanConfig` no reconoce: devuelven precio 0 y **caen en
silencio a los límites de Esencial** (`docs/PENDIENTES.md`, punto 3 de sep-2026). Si el cliente
contrató Profesional y su `plan` no es `crm_profesional`, verá 1 embudo en vez de 10 y no habrá
error que lo explique. Se revisa en el alta, no en la primera queja.

---

## 3. La senda: siete fases con puerta de salida

Duración de referencia para una empresa de 5–20 personas con cartera viva: **10–15 días
laborables**. Autónomo o equipo de 3: 4–6 días. Despacho contable con slots: 1–2 días por cliente.

| Fase | Cuándo | Qué se cierra | Quién |
|---|---|---|---|
| F0 · Pre-alta | D-5 → D0 | Plan, vertical, moneda, usuarios, canales | Comercial + soporte |
| F1 · Diagnóstico | D0 → D2 | Mapa de datos y decisiones de embudo | Implementador + dueño del proceso |
| F2 · Configuración base | D1 → D3 | Módulos, roles, catálogo fiscal, marca | Implementador |
| F3 · Carga de datos | D2 → D5 | Empresas, contactos, catálogo, proveedores, cartera abierta | Cliente + implementador |
| F4 · Embudos | D3 → D5 | Etapas con criterio de salida y probabilidad | Responsable comercial |
| F5 · Contabilidad | D4 → D8 | PGC, impuestos, saldos de apertura, primera factura | Contable / asesoría |
| F6 · Capacitación | D7 → D9 | Cada rol hace su tarea real sin ayuda | Implementador |
| F7 · Go-live | D10 → D24 | Semana 1 vigilada y revisión a 14 días | Éxito del cliente |

### F0 · Pre-alta (antes de firmar)

- Vertical y **nivel de CRM** (Esencial / Profesional / Avanzado) escritos en el contrato, no deducidos.
- Moneda del tenant (`moneda`) y país fiscal. El provisioner cae a `MXN` si no se envía: **mandarla siempre**.
- Número de embudos que va a necesitar, comparado con el tope del nivel (1 / 10 / 25).
- ¿Quién factura? Si factura una asesoría por sus clientes, la figura es **slot contable**, no un tenant normal.

**Puerta de salida:** tenant creado en trial de 14 días, administrador con acceso verificado,
plan válido comprobado, moneda correcta. **Alarma:** el cliente entra y ve «1 embudo» cuando
compró Profesional.

### F1 · Diagnóstico (D0–D2)

Una reunión de 90 minutos y una hoja. Se pregunta, en este orden:

1. **De dónde salen hoy los leads** y cuántos hay abiertos de verdad (no los del Excel de 2019).
2. **Qué se vende**: productos, servicios o ambos, con precios y si llevan IVA distinto.
3. **Cómo se cierra**: ¿cotización firmada? ¿contrato? ¿orden de compra del cliente? Eso decide qué módulo se enciende.
4. **Quién toca el CRM**: nombres, rol y qué no debe ver.
5. **Quién lleva la contabilidad** y con qué programa (Sage, Microdata, otro) — define la plantilla de importación.
6. **Qué herramienta dejan** y hasta cuándo pagan: la fecha de corte es la fecha de go-live.

**Puerta de salida:** hoja de una página con los seis puntos y los huecos aceptados por escrito
(«no migramos histórico cerrado», «no importamos proveedores, los damos de alta al primer pedido»).

### F2 · Configuración base (D1–D3)

| Qué | Dónde | Criterio |
|---|---|---|
| Módulos encendidos/apagados | Configuración → Módulos (`/api/tenant/modules`) | Quedan activos solo los del contrato; el núcleo no se puede apagar |
| Usuarios y roles | `/dashboard/equipo` y `/dashboard/equipo/roles` | Cada usuario entra y ve **solo** lo suyo (probar con un comercial) |
| Datos fiscales del emisor | Configuración fiscal del tenant | NIF, dirección, serie de numeración |
| Catálogo fiscal | `/api/accounting/taxes/vat` y `/api/accounting/taxes/irpf` | Tipos de IVA que el cliente usa de verdad (no los 21/10/4 por defecto y ya) |
| Marca | Branding del tenant (o del despacho, si es slot) | Logo y color en PDF de cotización |
| Canales (WhatsApp/Telegram) | Integraciones | Si el contrato incluye avisos, el chat de administración queda vinculado (§Telegram) |

**Puerta de salida:** un usuario de cada rol entra, ve su menú y **no** ve el del otro.

### F3 · Carga de datos (D2–D5)

El orden importa y no es negociable (§4): **empresas → contactos → catálogo → proveedores →
cartera abierta → saldos contables**. Cada bloque se importa, se cuenta y se firma el recuento
(«esperábamos 412 contactos, han entrado 412, 3 rechazados por email duplicado»).

**Puerta de salida:** recuento firmado por bloque y los rechazos justificados uno a uno.

### F4 · Embudos (D3–D5)

Se configura en `/dashboard/pipeline` con las reglas de §5. Lo que **no** se hace en esta fase:
cargar el histórico ganado/perdido de los últimos tres años. Se carga la cartera abierta y se
empieza a medir desde cero.

**Puerta de salida:** embudo con 4–6 etapas, cada una con criterio de salida escrito, etapa final
con motivo obligatorio, y ≥10 oportunidades reales dentro.

### F5 · Contabilidad (D4–D8)

Detalle en §6. **Puerta de salida:** asiento de apertura que **cuadra a cero** (comprobado a mano
si hace falta, ver §4), una factura de prueba emitida y un gasto con IVA correcto.

### F6 · Capacitación (D7–D9)

Sesión por rol, no una general:

- **Comercial (60 min):** crear oportunidad, mover de etapa con su criterio, cotizar, enviar el enlace, registrar la llamada, usar el briefing.
- **Dirección (45 min):** leer la previsión sin creérsela, salud del pipeline, qué significa un ZOMBIE.
- **Administración (45 min):** catálogo, factura, gasto, exportar libro diario.

Cada asistente **ejecuta** sus cinco tareas con datos reales; el implementador no toca el teclado.

**Puerta de salida:** cada rol completa sus cinco tareas sin ayuda y sin preguntar dónde está nada.

### F7 · Go-live y vigilancia (D10–D24)

- Día 1 sin sorpresas: la herramienta vieja queda en **solo lectura**, no se borra.
- Revisión a los 7 días: ¿hay oportunidades sin próxima acción? ¿alguna cotización abierta sin seguimiento?
- Revisión a los 14 días con el dueño del proceso, con números (§9).

---

## 4. La mesa de datos: qué se importa, por dónde y en qué orden

### 4.1 El mapa real

| Dato | Dónde está hoy | Formato | Cómo evita duplicados | Veredicto |
|---|---|---|---|---|
| **Clientes con NIF** | `/dashboard/importar` → `/api/import/clients` | CSV/XLSX de Sage, Microdata o genérico con mapeo | por `email`; si no hay, por NIF en `CustomerFiscalData` | 🟢 Importa a **Lead**, no a `Contact` |
| **Saldos contables** | `/dashboard/importar` → `/api/import/accounting` | CSV | por código de cuenta (`mapAccount`) | 🟡 Ver 4.2 |
| **Servicios (modelo `Servicio`)** | `POST /api/import/catalog` | CSV | por nombre | 🔴 Inalcanzable desde la pantalla |
| **Productos y servicios (modelo `CatalogoItem`, el que usa la cotización)** | `/dashboard/catalogo` → `/api/catalogo/import` | CSV/XLSX con alias y JSON | por SKU/nombre | 🟢 Es la vía buena |
| **Leads** | `POST /api/leads/import` | CSV | por email | 🟡 API, sin pantalla |
| **Contactos y empresas** | `POST /api/contacts/import` (`tipo=person\|company`) | CSV con alias | por email | 🟡 API, sin pantalla |
| **Proveedores** | — | — | — | 🔴 No existe |
| **Oportunidades abiertas** | — | — | — | 🔴 No existe |

**Consecuencia práctica:** «importar empresas» hoy significa llamar a `/api/contacts/import` con
`tipo=company` desde fuera del panel o darlas de alta a mano. Un cliente con 200 empresas no lo
va a hacer. Es el hueco más caro de todos porque las empresas son la clave de la cartera B2B.

### 4.2 Cuatro defectos medidos (y cómo se esquivan hoy)

1. **El asistente no deja elegir el tipo.** `ImportWizard` hace
   `const type = detectResult?.detectedType || 'clients'` y envía a `/api/import/${type}`. Como
   `ALL_TEMPLATES` no tiene plantilla de catálogo, `catalog` nunca se detecta: la única forma de
   cargar servicios es `/dashboard/catalogo`. *Hoy:* no prometer «importar servicios» en
   `/dashboard/importar`; usar la pantalla de catálogo.
2. **El año fiscal se pierde.** La ruta `/api/import/accounting` lee `formData.get('fiscalYear')`
   y **no lo pasa** a `executeImport`, que no lo acepta. El asiento de apertura siempre va al 1 de
   enero del año en curso. *Hoy:* importar apertura solo si el ejercicio a cargar es el actual.
3. **El asiento de apertura no se valida.** Si la suma debe/haber no da cero, se añade una línea
   de cuadre a la cuenta **120 (Remanente)**; y si esa cuenta no existe en el plan, la línea se
   omite **sin error** y el asiento queda descuadrado y publicado. *Hoy:* comprobar el cuadre con
   el libro diario exportado el mismo día de la importación.
4. **Tres modelos para un «cliente».** `Lead` (clientes importados), `Contact` (contactos y
   empresas) y `CustomerFiscalData` (NIF), con dedupe distinto por camino. *Hoy:* decidir con el
   cliente **una** de las dos puertas y no mezclar, o la cartera sale partida en dos listas.

### 4.3 Lo que hay que arreglar esta semana (mínimo para no mentir)

| # | Arreglo | Coste | Por qué primero |
|---|---|---|---|
| 1 | Selector explícito de tipo en el asistente + plantillas genéricas de catálogo, clientes y saldos | 1 día | Desbloquea la promesa de la propia pantalla |
| 2 | Import de **empresas/contactos/leads** en esa misma pantalla, reutilizando las rutas que ya existen | 1–2 días | Sin esto, la carga B2B se hace a mano |
| 3 | Import de **proveedores** (nombre, NIF, email, condiciones de pago) | 1 día | Hoy el primer pedido obliga a teclearlo |
| 4 | Import de **oportunidades abiertas** (nombre, importe, etapa, contacto, fecha) | 2–3 días | Es el dato que hace que el embudo sirva desde el día 1 |
| 5 | Año fiscal + cuadre obligatorio en el asiento de apertura (y cuadrar contra 100, no 120) | 0,5 día | Un descuadre silencioso en contabilidad es el peor error posible |

---

## 5. Embudos que no se pudren

### 5.1 Reglas de diseño

1. **Un embudo = un ciclo de venta**, no un producto ni un comercial. Si dos productos se venden
   igual, es el mismo embudo con etiqueta. Si uno se vende en visita y otro en licitación, son dos.
2. **4–6 etapas de avance + 2 finales.** Con más de siete, nadie mueve las tarjetas y el Kanban
   se convierte en un cementerio.
3. **Cada etapa tiene un criterio de salida observable**, no un nombre. «Propuesta» no es un
   criterio; «presupuesto enviado y abierto por el cliente» sí.
4. **La probabilidad es conversión histórica**, no intuición. Se arranca con la escalera por
   defecto (10/25/50/75/90) y se recalibra a los 90 días con los desenlaces reales.
5. **«Perdido» exige motivo.** El motivo es el único dato que permite arreglar el embudo; sin él,
   el informe de pérdidas no dice nada.
6. **«Facturado» no es una etapa.** Eso es ERP. El embudo termina en ganado.
7. **Nada de etapas zombis.** Si una etapa tiene 40 tarjetas y ninguna se mueve en 30 días, no es
   una etapa: es un cajón.

### 5.2 Cómo se configura hoy

- `/dashboard/pipeline` → nuevo embudo con nombre y **categoría**. La categoría trae las etapas por
  defecto de `lib/pipelines.ts` (`DEFAULT_STAGES` para ventas; `CAPTACION`, `COMPRA`, `RRHH`,
  `PROYECTOS`, `FINANZAS`, `LOGISTICA` para el resto de verticales).
- Editar, reordenar y borrar etapas: `/api/pipeline/stages/[id]` y `/api/pipeline/stages/reorder`.
- **Tope por nivel**: lo decide `getCrmEntitlements` + `getMaxPipelines`
  (`app/api/pipelines/route.ts`), no `PIPELINE_LIMITS_BY_PLAN` a secas. El mensaje de error ya dice
  el tope y el nombre del nivel.

### 5.3 Migrar la cartera abierta (el punto débil)

No hay import de oportunidades (§4). Las salidas reales, en orden de coste:

1. **API/MCP**, si el cliente tiene a alguien técnico: aceptable hasta ~50 oportunidades.
2. **Carga asistida** en una sesión de 2 horas con el comercial: se crean las 20–30 que importan
   de verdad. Es lo que funciona en la práctica: el embudo no necesita las 300 cerradas.
3. **Nunca**: volcar el histórico cerrado «para tener datos». Ensucian la previsión y la salud del
   pipeline durante meses.

---

## 6. Contabilidad en orden

### 6.1 Dos figuras que no se mezclan

| Figura | Qué es | Quién la usa |
|---|---|---|
| **Cuenta propia** (módulo `finanzas`) | El tenant lleva su contabilidad | Cualquier empresa |
| **Slot contable** (`accounting-slot`) | Un despacho crea un **tenant hijo** por cliente, con su propio PGC inicializado | Asesorías |

En el slot, el alta hace `AccountingInitializer.initializeTenant(nuevoSlot.id, plan, sector)`
(`app/api/accounting/slots/route.ts`): el plan de cuentas se siembra **al crear el cliente**, no
después. Si se elige mal el PGC, hay que reinicializar.

### 6.2 Orden de puesta en marcha contable

1. **Plan de cuentas**: `NORMAL`, `PYMES` o `MICRO`, más adaptación sectorial si aplica
   (`lib/accounting/plans/catalog.ts`, `SECTOR_ACCOUNTS`).
2. **Impuestos**: IVA (`/api/accounting/taxes/vat`), IRPF y los modelos que el cliente presente
   (115, 130, 180, 347, 349, 390 — cada uno con su ruta).
3. **Calendario fiscal**: `/api/accounting/fiscal-calendar`.
4. **Saldos de apertura**: importación (§4.2) o asiento manual. Con las salvedades del cuadre.
5. **Primera factura y primer gasto** de prueba, con IVA correcto; después se anulan.
6. **Conciliación bancaria** (`/api/accounting/reconcile`, `auto-reconciler`) si el cliente va a
   importar extractos.
7. **Exportación del libro diario** (CSV) para entregar a la asesoría o archivar.

### 6.3 Lo que no se promete

- **No hay firma electrónica cualificada** (eIDAS). El sello y el hash encadenado son integridad,
  no firma legal.
- **Verifactu/AEAT existe en código con cola propia, pero no se ha verificado contra el servicio
  real en esta revisión.** Si el cliente lo exige como requisito de go-live, es una validación
  aparte, no un «ya viene incluido».
- **El asiento de apertura no se autovalida** (§4.2.3). En una puesta en marcha real, el cuadre se
  comprueba a mano el día que se importa.

---

## 7. Personalización: qué se toca y qué no

| Palanca | Dónde | Alcance |
|---|---|---|
| Módulos on/off | Configuración → Módulos (`PATCH /api/tenant/modules`) | Todo menos el núcleo (leads, contactos, empresas, pipeline, tareas, analytics, equipo, configuración, conocimiento) |
| Embudos y etapas | `/dashboard/pipeline` | Nombre, categoría, orden, color, probabilidad, etapa final |
| Catálogo | `/dashboard/catalogo` | Productos/servicios, precios, impuesto, categorías, etiquetas y **campos propios en JSON** (`customFieldValues`) |
| Roles y permisos | `/dashboard/equipo/roles` | Módulo × acción por rol |
| Marca | Branding del tenant/despacho | Logo y color en documentos |
| Moneda | `moneda` del tenant | Una por tenant; los totales no convierten entre divisas, se muestran por divisa |
| Integraciones | Integraciones | WhatsApp, Telegram (con chat de administración y aviso de la empresa), email |

**Lo que hoy no se puede personalizar y todo cliente pide en la primera semana:**

- **Campos propios en oportunidades, leads y contactos.** Solo existen etiquetas (`tags`). Un
  «número de empleados», «presupuesto anual» o «comercial de origen» obliga a meterlo en notas.
- **Estados propios** fuera del embudo (por ejemplo, motivos de pérdida distintos por línea).
- **Plantillas de documento editables** por el cliente.

Decirlo en la reunión de diagnóstico evita la decepción del día 8.

---

## 8. Huecos de producto, por orden de impacto

| Prioridad | Hueco | Efecto en la puesta en marcha | Coste |
|---|---|---|---|
| **P0** | Selector de tipo + plantillas genéricas en el asistente | Hoy «importar servicios» es imposible desde la UI | 1 día |
| **P0** | Import de empresas/contactos/leads en el panel | Carga B2B a mano; se abandona a mitad | 1–2 días |
| **P0** | Import de oportunidades abiertas | El embudo arranca vacío y el cliente no ve valor | 2–3 días |
| **P0** | Cuadre + año fiscal en saldos de apertura | Riesgo de contabilidad descuadrada sin aviso | 0,5 día |
| **P1** | Import de proveedores | Primer pedido a mano | 1 día |
| **P1** | Campos personalizados en deal/lead | Bloquea verticales con datos propios | 2–4 días |
| **P1** | Estado de puesta en marcha persistido por tenant | Convierte este documento en producto y da visibilidad a soporte | 2 días |
| **P1** | Alta guiada por IA: descubrimiento, recomendación explicable y elección | Sustituye el selector de vertical por un diagnóstico real del negocio | ver [`alta-guiada-por-ia.md`](./alta-guiada-por-ia.md) §11 |
| **P2** | Arreglar o retirar el 423 de la compuerta de práctica | Enlace muerto en el flujo de entrenamiento | horas |
| **P2** | Sembrar el embudo con las etapas del sector desde el onboarding | Ahorra la fase F4 en clientes estándar | 1 día |

---

## 9. Checklist de go-live (se firma o no se firma)

**Datos**
- [ ] Recuento por bloque firmado: empresas, contactos, catálogo, cartera abierta.
- [ ] Los rechazos de importación están justificados uno a uno.
- [ ] Copia del fichero original guardada (el cliente es el dueño del dato).

**Configuración**
- [ ] El plan del tenant existe en el código y el tope de embudos es el contratado.
- [ ] Módulos encendidos coinciden con el contrato.
- [ ] Cada rol probado con un usuario real; el comercial no ve configuración.
- [ ] Tipos de IVA del cliente cargados.

**Ventas**
- [ ] 1 embudo con 4–6 etapas, criterio de salida escrito en cada una.
- [ ] ≥10 oportunidades reales con próxima acción asignada.
- [ ] 1 cotización real enviada desde el catálogo y abierta por el cliente.
- [ ] 1 contrato y 1 orden de venta generados desde esa cotización (aunque se anulen).

**Contabilidad**
- [ ] Saldo de apertura cuadra a cero; libro diario exporta.
- [ ] 1 factura de prueba y 1 gasto con IVA correcto.
- [ ] Calendario fiscal activo.

**Operación**
- [ ] Briefing de la mañana llega al Telegram del administrador y al de un comercial.
- [ ] Herramienta anterior en solo lectura, con fecha de corte escrita.
- [ ] Responsable interno nombrado (no «el equipo»): nombre y teléfono.

**No go-live si:** el plan no existe en código · el embudo tiene más de 7 etapas · el asiento de
apertura no cuadra · nadie del cliente sabe quién es el responsable interno · se ha prometido
firma cualificada o importación de proveedores.

---

## 10. Qué se mide a los 14 días

No se mide «satisfacción». Se mide esto, que es lo que dice si el CRM está trabajando:

| Indicador | Umbral sano | Qué hacer si no llega |
|---|---|---|
| Oportunidades con próxima acción | > 80 % de la cartera abierta | Revisión de 30 min con el comercial; es el indicador que predice abandono |
| Cotizaciones enviadas por usuario/semana | ≥ 2 | El catálogo está incompleto o el comercial no confía en el precio |
| Tiempo medio por etapa | Estable o bajando | Si sube en la primera etapa, el criterio de salida está mal escrito |
| Usuarios activos / licencias | ≥ 70 % | Falta capacitación por rol, no herramientas |
| Oportunidades ZOMBIE | < 15 % | Hay etapas cajón (§5.1.7) |

---

## 11. Qué no entra en la puesta en marcha estándar

Para no convertir cada alta en un proyecto:

- Limpieza de datos de origen más allá de descartar filas inválidas con su motivo.
- Migración de histórico **cerrado** (facturas, pedidos, contratos firmados).
- Integraciones a medida (ERP del cliente, API propietaria, ETL).
- Firma electrónica cualificada y Verifactu (§6.3).
- Desarrollo de campos o informes a medida (§7).
- Operación continuada: la puesta en marcha termina en el checklist firmado, no en el día 90.

---

## Anexo · Ficheros que sostienen cada afirmación

| Afirmación | Fichero |
|---|---|
| Tipo de importación imposible de elegir | `components/import/ImportWizard.tsx`, `lib/import/import-service.ts` |
| `catalog` inalcanzable (sin plantilla) | `lib/import/import-service.ts` (`ALL_TEMPLATES`), `lib/import/import-types.ts` |
| `fiscalYear` ignorado | `app/api/import/accounting/route.ts`, `lib/import/import-service.ts` |
| Cuadre a 120 sin validación | `lib/import/import-accounting.ts` |
| Clientes importados como `Lead` | `lib/import/import-clients.ts` |
| Empresas/contactos por API | `app/api/contacts/import/route.ts` |
| Leads por API | `app/api/leads/import/route.ts` |
| Productos por pantalla | `app/dashboard/catalogo/page.tsx`, `app/api/catalogo/import/route.ts` |
| Sin import de proveedores | `app/dashboard/compras/proveedores/page.tsx` (alta manual) |
| Etapas y topes | `lib/pipelines.ts`, `app/api/pipelines/route.ts`, `lib/crm-pricing.ts` |
| Módulos on/off con auditoría | `app/api/tenant/modules/route.ts` |
| PGC y sectores | `lib/accounting/plans/catalog.ts`, `lib/accounting/initializer.ts` |
| Slot contable | `app/api/accounting/slots/route.ts` |
| Planes inexistentes en producción | `docs/PENDIENTES.md` (§ sep-2026, punto 3) |
| Acciones de marketing que fallan | `docs/marketing-documento-tecnico.md` §12 |
| Enlace de práctica muerto | `docs/crm-ventas-documento-tecnico.md` §12.4 |
