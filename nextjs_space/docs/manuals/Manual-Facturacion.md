# MANUAL DE FACTURACIÓN
## Sistema de Gestión de Facturación con Veri*factu y AEAT

**Volkern CRM**

**Versión:** 1.2
**Fecha:** Mayo 2026

---

## TABLA DE CONTENIDOS

1. Introducción
2. Acceso al Módulo
3. Flujo Completo de Facturación
4. Modelo Orden de Venta
5. API Routes
6. Veri*factu Integration
7. AEAT Integration
8. Cola de Procesamiento
9. Proveedores de Facturación
10. Servicios Auxiliares
11. Validaciones Fiscales
12. Webhooks
13. Seguridad y Gobernanza
14. Estados y Transiciones
15. Errores Comunes
16. Mejores Prácticas
17. Rutas de Archivos

---

## 1. INTRODUCCIÓN

### 1.1 Propósito del Documento

Este manual describe el proceso completo de facturación en Volkern CRM, incluyendo:
- Gestión de órdenes de venta con firma del cliente
- Generación de facturas desde órdenes de venta firmadas
- Cumplimiento con Veri*factu (Sistema de Facturación)
- Envío a la Agencia Tributaria Española (AEAT)
- Integración con múltiples proveedores de facturación

### 1.2 Alcance

El sistema de facturación abarca:
- Creación y gestión de órdenes de venta
- Firma digital de órdenes de venta por el cliente
- Conversión a facturas legally binding
- Sellado digital con Veri*factu
- Envío a AEAT mediante SOAP
- Gestión de estados y errores

### 1.3 Principio Fundamental

**La Orden de Venta es el documento que el cliente firma.** A diferencia del contrato (acuerdo legal duradero), la orden de venta representa un compromiso de compra específico con las mismas garantías de seguridad e inmutabilidad una vez firmada.

---

## 2. ACCESO AL MÓDULO

### 2.1 Ruta de Acceso

```
Dashboard → Finanzas → Facturación
URL: /dashboard/finanzas/facturacion
```

### 2.2 Permisos Requeridos

| Permiso | Descripción |
|---------|-------------|
| `finanzas:read` | Ver módulo de finanzas |
| `billing:read` | Ver facturación |
| `billing:write` | Generar y modificar facturas |
| `ordenes_venta:read` | Ver órdenes de venta |
| `ordenes_venta:write` | Crear y gestionar órdenes de venta |

### 2.3 Estructura del Módulo

```
/dashboard/finanzas/
├── page.tsx                     # Dashboard principal de finanzas
├── facturacion/
│   └── page.tsx                 # Mesa de Facturación
├── global/                      # Vista global (multi-tenant)
├── proveedores/                 # Gestión de proveedores
├── gastos/                     # Registro de gastos
├── nominas/                    # Nóminas (ES)
├── contabilidad/
│   ├── page.tsx                # Contabilidad general
│   ├── impuestos/             # Gestión de impuestos
│   └── reconciliacion/       # Conciliación bancaria
└── reportes/                  # Reportes financieros
```

---

## 3. FLUJO COMPLETO DE FACTURACIÓN

### 3.1 Diagrama del Proceso

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐    ┌──────────────┐
│  COTIZACIÓN │───▶│   ORDEN VENTA    │───▶│   FACTURA    │───▶│    AEAT      │
│ (Presupuesto)│    │ (Pendiente Firma)│    │   (Sellada)  │    │  (Envío)     │
└──────────────┘    └──────────────────┘    └──────────────┘    └──────────────┘
       │                  │                        │                  │
       ▼                  ▼                        ▼                  ▼
   Ventas/CRM        Ventas/CRM              Mesa de            Veri*factu +
                     Pipeline              Facturación         Envío AEAT
```

### 3.2 Características de la Orden de Venta

#### Cancelabilidad
- **Antes de firma:** La orden puede ser cancelada libremente por el cliente o vendedor
- **Después de firma:** La orden se vuelve inmutable y desencadena el flujo de facturación automática

#### Seguridad
- Sello digital SHA-256 al firmar
- Encadenamiento con órdenes anteriores
- Token público único para acceso del cliente
- Log de auditoría completo

### 3.3 Paso a Paso

#### PASO 1: Creación de Cotización
- Se genera desde el módulo de Ventas o CRM
- Puede convertirse en Orden de Venta si el cliente acepta

#### PASO 2: Creación de Orden de Venta
- Se genera desde la cotización aceptada
- Estados iniciales: `borrador` → `pendiente_firma`
- El cliente recibe un enlace para revisar y firmar

#### PASO 3: Firma del Cliente
- El cliente accede vía enlace público (`/orden-venta/[token]`)
- Revisa los detalles y firma digitalmente
- Al firmar:
  - Se genera el sello digital inmutable
  - Se encadena con órdenes anteriores
  - Se activa el flujo de facturación automática

#### PASO 4: Facturación Automática
- El BillingService detecta la orden firmada
- Genera automáticamente la factura en el proveedor configurado
- Aplica el sello Veri*factu

#### PASO 5: Mesa de Facturación (Verificación)
- Ubicación: `/dashboard/finanzas/facturacion`
- Muestra las órdenes facturadas para verificación
- Permite revisar estado AEAT

#### PASO 6: Envío a AEAT (España)
- El worker de BullMQ procesa la cola `aeat-shipment`
- Se firma el XML con certificado X.509 (XAdES-BES)
- Se envía por SOAP con Mutual TLS
- Se recibe CSV de verificación

---

## 4. MODELO ORDEN DE VENTA

### 4.1 Estructura del Modelo

```typescript
model OrdenVenta {
  id                 String                     @id @default(cuid())
  tenantId           String
  numero             String                     // Formato: OV-2026-0001
  leadId             String?
  contactId          String?
  cotizacionId       String?
  dealId             String?
  emisorId           String?
  
  // Estado
  estado             String                     @default("borrador")
  
  // Datos comerciales
  subtotal           Float                      @default(0)
  descuentoGlobal    Float                      @default(0)
  totalImpuestos     Float                      @default(0)
  totalRetenciones   Float                      @default(0)
  total              Float                      @default(0)
  moneda             String                     @default("EUR")
  
  // Fechas
  fechaOrden         DateTime                   @default(now())
  fechaEntrega       DateTime?
  fechaFacturacion   DateTime?
  
  // Firma digital
  tokenPublico       String?                    @unique
  sealHash           String?                   // SHA-256 del sello
  parentSealHash     String?                   // Hash de la orden anterior
  sequenceNumber     Int?                       // Número en la cadena
  fechaFirma         DateTime?
  
  // Auditoría
  creadoPorId        String?
  firmadoPorId       String?
  invoiceId          String?                    @unique
  
  // Relaciones
  items              OrdenVentaItem[]
  
  @@unique([tenantId, numero])
  @@index([tenantId])
  @@index([estado])
  @@index([leadId])
  @@index([contactId])
  @@index([tokenPublico])
}

model OrdenVentaItem {
  id                  String        @id @default(cuid())
  ordenVentaId        String
  concepto            String
  descripcion         String?
  cantidad            Float         @default(1)
  unidad              String        @default("unidad")
  precioUnitario      Float
  descuento           Float         @default(0)
  porcentajeImpuesto  Float         @default(21)
  montoImpuesto       Float         @default(0)
  subtotal           Float         @default(0)
  
  ordenVenta          OrdenVenta    @relation(fields: [ordenVentaId], references: [id], onDelete: Cascade)
}
```

### 4.2 Estados de Orden de Venta

| Estado | Descripción | Cancelable | Sello Digital |
|--------|-------------|------------|---------------|
| `borrador` | Creada sin enviar al cliente | Sí | No |
| `pendiente_firma` | Enviada, esperando firma del cliente | Sí | No |
| `firmada` | Firmada por el cliente | No | Sí |
| `facturada` | Convertida a factura | No | Sí |
| `completada` | Entregada completamente | No | Sí |
| `cancelada` | Cancelada por el vendedor/cliente | N/A | No |

### 4.3 Transiciones de Estado

```
borrador ──────────────▶ pendiente_firma
      │                         │
      │                         ▼
      │                    (cliente firma)
      │                         │
      ▼                         ▼
  cancelada ◀─────────────── ✅ firmada
                                  │
                                  ▼
                            facturada
                                  │
                                  ▼
                            completada
```

### 4.4 Sellado Digital de Orden de Venta

El sellado se realiza al momento de la firma:

```typescript
async function sealOrdenVenta(ordenId: string, signerId: string) {
  const orden = await prisma.ordenVenta.findUnique({
    where: { id: ordenId },
    include: { items: true, contact: true }
  });
  
  // Obtener hash de la última orden firmada
  const lastOrden = await prisma.ordenVenta.findFirst({
    where: { tenantId: orden.tenantId, estado: { in: ['firmada', 'facturada'] } },
    orderBy: { sequenceNumber: 'desc' }
  });
  
  // Calcular nuevo seal hash
  const dataToSeal = [
    lastOrden?.sealHash || 'GENESIS_ORDEN_VENTA',
    orden.numero,
    orden.total.toFixed(2),
    new Date().toISOString()
  ].join('|');
  
  const sealHash = crypto.createHash('sha256').update(dataToSeal).digest('hex');
  
  // Calcular siguiente secuencia
  const nextSequence = (lastOrden?.sequenceNumber || 0) + 1;
  
  await prisma.ordenVenta.update({
    where: { id: ordenId },
    data: {
      sealHash,
      parentSealHash: lastOrden?.sealHash,
      sequenceNumber: nextSequence,
      firmadoPorId: signerId,
      fechaFirma: new Date(),
      estado: 'firmada'
    }
  });
  
  return { sealHash, sequenceNumber: nextSequence };
}
```

### 4.5 Encadenamiento de Órdenes de Venta

```
SealHash(N) = SHA256(
  SealHash(N-1) +
  NumeroOrden(N) +
  ImporteTotal(N) +
  FechaHoraFirma(N)
)
```

Cada orden de venta firmada encadena su hash con la anterior, creando una cadena inmutable verificable.

---

## 5. API ROUTES

### 5.1 Firmar Orden de Venta

```
POST /api/ordenes-venta/[id]/firmar
```

**Flujo:**
1. Validar token de acceso público
2. Verificar que la orden esté en estado `pendiente_firma`
3. Verificar que no haya expirado
4. Registrar firma y actualizar a estado `firmada`
5. Generar sello digital encadenado
6. Notificar al BillingService para facturación automática

**Respuesta:**
```json
{
  "success": true,
  "ordenVentaId": "ov_xxx",
  "sealHash": "A1B2C3...",
  "sequenceNumber": 42,
  "facturaId": "inv_xxx"
}
```

### 5.2 Listar Órdenes Pendientes de Firma

```
GET /api/ordenes-venta?estado=pendiente_firma
```

**Parámetros:**
- `estado` - Filtrar por estado
- `leadId` - Filtrar por lead
- `contactId` - Filtrar por contacto
- `search` - Búsqueda por número

### 5.3 Listar Órdenes Facturadas

```
GET /api/ordenes-venta?estado=facturada
```

### 5.4 Crear Orden de Venta

```
POST /api/ordenes-venta
```

**Body de ejemplo:**
```json
{
  "leadId": "lead_xxx",
  "contactId": "contact_xxx",
  "emisorId": "emisor_xxx",
  "cotizacionId": "cot_xxx",
  "moneda": "EUR",
  "items": [
    {
      "concepto": "Servicio de Consultoría",
      "cantidad": 10,
      "precioUnitario": 150,
      "porcentajeImpuesto": 21
    }
  ]
}
```

### 5.5 Ver Orden de Venta (Público)

```
GET /api/ordenes-venta/public/[token]
```

Acceso público para que el cliente visualize y firme.

---

## 6. VERI*FACTU INTEGRATION

### 6.1 Proceso de Sellado

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Generar Hash│───▶│ Firmar XML  │───▶│Enviar a AEAT│───▶│Almacenar CSV│
│(Fingerprint)│    │ (XAdES-BES) │    │(SOAP + mTLS)│    │(Verificación│
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### 6.2 Generador de Fingerprint

El fingerprint es un hash SHA-256 determinista que encadena las facturas:

```typescript
export function generateInvoiceFingerprint(payload: FingerprintPayload): string {
  const sortedKeys = Object.keys(payload).sort();
  const dataToHash = sortedKeys.map(key => {
    const value = payload[key];
    if (typeof value === 'number') return value.toFixed(2);
    return String(value);
  }).join('|');

  return crypto.createHash('sha256')
    .update(dataToHash)
    .digest('hex')
    .toUpperCase();
}

// Genesis fingerprint (inicio de cadena)
export const GENESIS_FINGERPRINT = "GENESIS_VERIFACTU_2026";
```

### 6.3 Campos del Payload de Fingerprint

| Campo | Descripción |
|-------|-------------|
| `numeroSerieFacturaEmisor` | Número de serie del emisor |
| `numeroFactura` | Número de factura |
| `fechaExpedicionFactura` | Fecha de expedición |
| `nombreRazonEmisor` | Nombre o razón social del emisor |
| `nifEmisor` | NIF del emisor |
| `nombreRazonReceptor` | Nombre o razón social del receptor |
| `nifReceptor` | NIF del receptor |
| `baseImponible` | Base imponible |
| `cuotaIVARecargoEquivalencia` | IVA + RE |
| `totalFactura` | Total de la factura |

### 6.4 Encadenamiento de Facturas

```
Fingerprint(N) = SHA256(
  Fingerprint(N-1) +
  FechaHora(N) +
  ImporteTotal(N)
)
```

El fingerprint de cada factura depende del anterior, creando una cadena inmutable.

---

## 7. AEAT INTEGRATION

### 7.1 Configuración de Endpoints

| Entorno | Endpoint |
|---------|----------|
| Producción | https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/TiketBai/VerifactuSOAP |
| Sandbox | https://prewww2.aeat.es/wlpl/TIKE-CONT/ws/TiketBai/VerifactuSOAP |

### 7.2 Proceso de Envío SOAP

```
1. Generar XML según esquema SuministroInformacion.xsd
2. Calcular fingerprint determinista
3. Firmar XML con XAdES-BES (RSA-SHA256)
4. Adjuntar certificado X.509
5. Enviar por SOAP con Mutual TLS
6. Procesar respuesta (CSV o error)
```

### 7.3 Estados AEAT

| Estado | Descripción |
|--------|-------------|
| `PENDING` | Pendiente de envío |
| `SENT` | Enviada, esperando respuesta |
| `ACCEPTED` | Aceptada por AEAT |
| `REJECTED` | Rechazada (requiere corrección) |
| `ERROR` | Error en el envío |

### 7.4 Certificado Requerido

- Formato: PKCS#12 (.p12 o .pfx)
- Contenido: Clave privada + Certificado + CA intermedias
- Algoritmo de firma: RSA-SHA256
- Vigencia: 4 años máximo

---

## 8. COLA DE PROCESAMIENTO

### 8.1 Configuración de Cola

```typescript
export const aeatQueue = new Queue('aeat-shipment', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
  }
});
```

### 8.2 Tareas Programadas

| Tarea | Cron | Descripción |
|-------|------|-------------|
| `daily_health_check` | 0 8 * * * | Resumen diario a las 8 AM |
| `continuous_monitor` | */5 * * * * | Monitoreo cada 5 minutos |
| `aggregate_metrics` | 0 * * * * | Agregación horaria |

### 8.3 Worker de Procesamiento

```typescript
export const aeatWorker = new Worker('aeat-shipment', async (job) => {
  switch (job.name) {
    case 'ship_invoice':
      const response = await InvoicingService.shipToAEAT(tenantId, data);
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { 
          aeatStatus: 'ACCEPTED', 
          aeatSentAt: new Date() 
        }
      });
      break;
  }
}, { connection: redis });
```

---

## 9. PROVEEDORES DE FACTURACIÓN

### 9.1 Integraciones Soportadas

| Proveedor | Prioridad | Veri*factu | Notas |
|-----------|-----------|------------|-------|
| Holded | 1 | Sí | API completa |
| Square | 2 | No | Solo generación básica |
| Stripe | 3 | Sí (MX) | Facturación MX native |
| GoCardless | 4 | No | Domiciliación SEPA |
| Mock | 5 | Sí | Para testing |

### 9.2 Lógica de Selección

```typescript
if (holdedIntegration?.conectado && holdedIntegration?.activo) {
  return await this.createHoldedInvoice(options, credentials);
}
if (squareIntegration?.conectado && squareIntegration?.activo) {
  return await this.createSquareInvoice(options, credentials);
}
```

---

## 10. SERVICIOS AUXILIARES

### 10.1 BillingService

Gestiona la facturación automática post-firma de orden de venta:
- Detecta eventos de órdenes de venta firmadas
- Genera la factura en el proveedor configurado
- Aplica el sello Veri*factu
- Actualiza el estado de la orden

**Flujo de eventos:**
```typescript
eventBus.onEvent(EVENTS.RESOURCE_UPDATED, async (payload) => {
  if (payload.resourceType === 'orden_venta' && payload.action === 'signed') {
    await this.onOrdenVentaSigned(payload.resourceId, payload.tenantId)
  }
})
```

### 10.2 DunningService

Gestión de cobros fallidos:
- Políticas de reintento: 1, 3, 7 días
- Estados: `GRACE_PERIOD`, `PAUSED`
- Notificaciones automáticas

### 10.3 FiscalEngine

Cálculo dinámico de impuestos:
- Detecta país del emisor/receptor
- Aplica inversión de sujeto pasivo
- Calcula IVA/IRPF según perfil

---

## 11. VALIDACIONES FISCALES

### 11.1 Tipos de ID Fiscal Soportados

| País | ID Fiscal | Ejemplo | Validación |
|------|-----------|---------|------------|
| MX | RFC | XAXX010101000 | Fecha + dígito verificador |
| ES | NIF | 12345678Z | Letra control |
| ES | CIF | B12345678 | Dígito control |
| ES | NIE | X1234567L | Conversión X/Y/Z |
| US | EIN | 12-3456789 | Prefijos válidos |
| CL | RUT | 12.345.678-5 | Módulo 11 |
| AR | CUIT | 20-12345678-9 | Algoritmo específico |
| CO | NIT | 900123456-7 | Módulo 11 |
| PE | RUC | 20123456789 | Longitud + prefijo |
| BR | CNPJ | 12.345.678/0001-95 | Módulo 11 doble |

### 11.2 Tasas de IVA Predeterminadas

| País | General | Reducida | SuperReducida |
|-----|---------|----------|--------------|
| ES | 21% | 10% | 4% |
| MX | 16% | 0% | - |
| CL | 19% | - | - |
| AR | 21% | 10.5% | - |
| CO | 19% | 5% | - |
| PE | 18% | - | - |
| BR | 17% | - | - |
| GB | 20% | 5% | - |
| DE | 19% | 7% | - |
| FR | 20% | 10% | 5.5% |

### 11.3 Inversión de Sujeto Pasivo

Se aplica cuando:
- Emisor y receptor en España (B2B)
- Receptor con ID intracomunitario
- Servicio digital a particular en otro país EU

---

## 12. WEBHOOKS

### 12.1 Webhook de Orden de Venta

**Ruta:** `/api/webhooks/ordenes-venta`

```typescript
export async function POST(req: Request) {
  const { event, ordenVentaId, tenantId } = await req.json();
  
  switch (event) {
    case 'orden_venta_signed':
      await BillingService.onOrdenVentaSigned(ordenVentaId, tenantId);
      break;
    case 'orden_venta_cancelled':
      // Notificar al vendedor y actualizar CRM
      break;
  }
}
```

### 12.2 Webhook de Billing

**Ruta:** `/api/webhooks/billing`

```typescript
export async function POST(req: Request) {
  const { event, subscriptionId, error } = await req.json();
  
  switch (event) {
    case 'payment_failed':
      await DunningService.handlePaymentFailure(subscriptionId, error);
      break;
    case 'payment_succeeded':
      await DunningService.handlePaymentSuccess(subscriptionId);
      break;
  }
}
```

### 12.3 Webhook de Firma Digital

**Ruta:** `/api/webhooks/signatures`

Maneja callbacks de servicios de firma digital.

---

## 13. SEGURIDAD Y GOBERNANZA

### 13.1 Sellado de Orden de Venta

Al firmar una orden de venta:
- Se genera un hash SHA-256 encadenado
- Se verifica la integridad de la cadena anterior
- Se registra el sequence number
- Se bloquean modificaciones posteriores

```typescript
await prisma.ordenVenta.update({
  where: { id: ordenId },
  data: {
    sealHash,
    parentSealHash: previousSeal,
    sequenceNumber: nextSeq,
    estado: 'firmada'
  }
});
```

### 13.2 Cancelabilidad de Órdenes de Venta

**Reglas de cancelación:**
- Solo posible en estados `borrador` o `pendiente_firma`
- Requiere permisos `ordenes_venta:write`
- Se registra razón de cancelación
- Se genera log de auditoría

**No cancelable después de:**
- Estado `firmada`
- Generación de Factura asociada

### 13.3 Bloqueo de Perfil Fiscal

Después de facturar, el perfil fiscal del cliente se bloquea:

```typescript
await prisma.perfilFiscalCliente.update({
  where: { contactId },
  data: { isLocked: true }
});
```

### 13.4 Inmutabilidad de Facturas

Las facturas selladas son inmutables. No se pueden modificar campos críticos:

```typescript
const criticalFields = [
  'monto', 'moneda', 'fechaEmision', 
  'numero', 'tenantId', 
  'fingerprint', 'parentFingerprint'
];

// Cualquier intento de modificación genera SECURITY_VIOLATION
```

### 13.5 Registro de Auditoría

Todas las operaciones de facturación quedan registradas:
- Usuario que generó la factura
- Timestamp de creación
- Proveedor utilizado
- Estado AEAT
- Historial de modificaciones

---

## 14. ESTADOS Y TRANSICIONES

### 14.1 Estados de Orden de Venta

| Estado | Cancelable | Sellada | Acciones Permitidas |
|--------|------------|---------|---------------------|
| `borrador` | Sí | No | Editar, Enviar, Cancelar |
| `pendiente_firma` | Sí | No | Enviar recordatorio, Cancelar |
| `firmada` | No | Sí | Ninguna (inmutable) |
| `facturada` | No | Sí | Ninguna (inmutable) |
| `completada` | No | Sí | Ninguna (inmutable) |
| `cancelada` | N/A | No | Ver historial |

### 14.2 Estados de Factura

| Estado | Veri*factu | AEAT | Acciones Permitidas |
|--------|------------|------|---------------------|
| `pendiente` | No | No | Editar, Cancelar |
| `completado` | Sí | Sí | Ninguna (inmutable) |
| `cancelada` | N/A | N/A | Ver historial |
| `anulada` | Sí (rectificativa) | Sí | Crear rectificativa |

### 14.3 Transiciones de Estado

```
Orden de Venta:
borrador ──────────────▶ pendiente_firma
      │                         │
      ▼                         ▼
  cancelada ◀─────────────── ✅ firmada
                                  │
                                  ▼
                            facturada
                                  │
                                  ▼
                            completada

Factura:
pendiente ──────────────▶ completado
      │                        │
      ▼                        ▼
  cancelada              anulada (rectificativa)
```

---

## 15. ERRORES COMUNES Y SOLUCIONES

### 15.1 "Orden de venta no cancelable"

**Causa:** La orden ya fue firmada  
**Solución:** No se puede cancelar. Crear nota de crédito o factura rectificativa.

### 15.2 "No hay ninguna integración de facturación activa"

**Causa:** No hay proveedor configurado  
**Solución:** Configurar al menos un proveedor en `/dashboard/integraciones`

### 15.3 "Configuración fiscal del emisor no encontrada"

**Causa:** Falta la configuración del emisor  
**Solución:** Agregar la configuración fiscal del emisor en `/dashboard/configuracion/fiscal`

### 15.4 "Certificado expirado"

**Causa:** El certificado P12 ha vencido  
**Solución:** Renovar certificado P12 en la configuración del emisor

### 15.5 "Firma no válida"

**Causa:** Certificado P12 inválido o mal configurado  
**Solución:** Verificar que el certificado P12 sea válido y contenga la clave privada

### 15.6 "NIF/CIF no válido"

**Causa:** El identificador fiscal del cliente no pasa validación  
**Solución:** Corregir los datos fiscales del cliente

### 15.7 "Factura ya existe"

**Causa:** La orden ya tiene una factura asociada  
**Solución:** Verificar en la Mesa de Facturación si ya se facturó

### 15.8 "Orden de venta expirada"

**Causa:** Pasó la fecha de vencimiento sin firma  
**Solución:** Crear una nueva orden de venta o extender la fecha de vencimiento

---

## 16. MEJORES PRÁCTICAS

### 16.1 Antes de Crear Orden de Venta

1. Verificar que la cotización esté aprobada
2. Confirmar datos del cliente (contacto, dirección fiscal)
3. Revisar que los items tengan los precios correctos
4. Validar condiciones de pago

### 16.2 Antes de Enviar a Firma

1. Verificar datos fiscales del cliente (NIF/CIF válido)
2. Confirmar el total de la orden
3. Revisar que los items tengan los impuestos correctos
4. Verificar fecha de vencimiento de la firma

### 16.3 Verificación Post-Firma

1. Confirmar que la orden tiene `estado: 'firmada'`
2. Verificar que `sealHash` no es null
3. Comprobar que el `sequenceNumber` es correcto
4. Revisar que la factura fue creada automáticamente

### 16.4 Verificación Post-Factura

1. Confirmar que la factura tiene `isSealed: true`
2. Verificar que `fingerprint` no es null
3. Comprobar que el `sequenceNumber` es correcto
4. Revisar que `aeatStatus` eventualmente sea `ACCEPTED`
5. Descargar y guardar el XML firmado

### 16.5 Mantenimiento

1. Monitorear la cola de AEAT (`aeatQueue`)
2. Revisar logs de errores de facturación diariamente
3. Renovar certificados 30 días antes de vencimiento
4. Realizar backup de evidencias (XML firmados, sellos de órdenes)
5. Mantener sincronizado el sequenceNumber con la AEAT

### 16.6 Recuperación de Errores

| Error | Acción |
|-------|--------|
| `REJECTED` (AEAT) | Revisar mensaje de error, corregir y reenviar |
| `ERROR` | Verificar logs, corregir causa raíz |
| Timeout | Reintentar automáticamente (5 intentos) |

---

## 17. RUTAS DE ARCHIVOS

| Componente | Ruta |
|-----------|------|
| Mesa de Facturación | `/app/dashboard/finanzas/facturacion/page.tsx` |
| Listado Órdenes de Venta | `/app/dashboard/ventas/ordenes-venta/page.tsx` |
| Nueva Orden de Venta | `/app/dashboard/ventas/ordenes-venta/nuevo/page.tsx` |
| Página pública orden de venta | `/app/orden-venta/[token]/page.tsx` |
| Servicio de Facturación | `/lib/invoicing-service.ts` |
| Motor Fiscal | `/lib/fiscal-engine.ts` |
| Generador Fingerprint | `/lib/crypto-utils.ts` |
| Validación Fiscal | `/lib/fiscal-validation.ts` |
| Sellador de Órdenes | `/lib/orden-venta-sealer.ts` |
| XML AEAT | `/lib/fiscal/aeat/xml-generator.ts` |
| Firmador XAdES | `/lib/fiscal/aeat/signer.ts` |
| Cliente SOAP | `/lib/fiscal/aeat/client.ts` |
| Config AEAT | `/lib/fiscal/aeat/config.ts` |
| Cola AEAT | `/lib/queues/aeat-queue.ts` |
| Billing Service | `/lib/finance/billing-service.ts` |
| Dunning Service | `/lib/finance/dunning-service.ts` |
| Bloqueo Billing | `/lib/db/extensions/billing-lock.ts` |
| API Firmar Orden | `/app/api/ordenes-venta/[id]/firmar/route.ts` |
| API Órdenes Venta | `/app/api/ordenes-venta/route.ts` |
| Webhook Ordenes Venta | `/app/api/webhooks/ordenes-venta/route.ts` |
| Webhook Billing | `/app/api/webhooks/billing/route.ts` |
| Schema Prisma | `/prisma/schema.prisma` |
| Billing Skills | `/lib/skills/billing-skills.ts` |

---

## APÉNDICE: GLOSARIO

| Término | Descripción |
|---------|-------------|
| Orden de Venta | Documento comercial que detalla los productos/servicios vendidos al cliente |
| Veri*factu | Sistema de facturación obligatorio en España desde 2026 |
| AEAT | Agencia Estatal de Administración Tributaria |
| XAdES-BES | XML Digital Signature (Basic) |
| mTLS | Mutual TLS (autenticación bidireccional) |
| CSV | Código Seguro de Verificación (24 caracteres) |
| SII | Suministro Inmediato de Información (IVA) |
| NIF | Número de Identificación Fiscal (España) |
| CIF | Código de Identificación Fiscal (España) |
| NIE | Número de Identificación de Extranjero (España) |
| Seal Hash | Hash criptográfico que sella una orden de venta al firmarse |
| Sequence Number | Número secuencial en la cadena de órdenes de venta |

---

**Documento creado por:** Volkern AI  
**Última actualización:** Mayo 2026