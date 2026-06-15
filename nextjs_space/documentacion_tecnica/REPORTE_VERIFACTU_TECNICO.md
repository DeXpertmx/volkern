# Reporte Técnico: Veri\*Factu — Implementación en Volkern

## Documentación para el Equipo de Desarrollo

**Plataforma:** Volkern  
**Normativa:** Ley 11/2021 · Real Decreto 1007/2023 · Orden HAC/1177/2024  
**Versión del sistema:** 1.0.0  
**Fecha:** Junio 2026  
**Código SIF:** VOLKERN-SIF-2026-001

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Marco Normativo y Estándares Técnicos](#2-marco-normativo-y-estándares-técnicos)
3. [Arquitectura General](#3-arquitectura-general)
4. [Stack Tecnológico](#4-stack-tecnológico)
5. [Componentes del Sistema](#5-componentes-del-sistema)
6. [Modelo de Datos (Prisma)](#6-modelo-de-datos-prisma)
7. [API Endpoints](#7-api-endpoints)
8. [Motor de Encadenamiento (Hash Chaining)](#8-motor-de-encadenamiento-hash-chaining)
9. [Servicio de Facturación (InvoicingService)](#9-servicio-de-facturación-invoicingservice)
10. [Generador XML AEAT](#10-generador-xml-aeat)
11. [Configuración AEAT](#11-configuración-aeat)
12. [Billing Lock — Inmutabilidad a Nivel de Base de Datos](#12-billing-lock--inmutabilidad-a-nivel-de-base-de-datos)
13. [Auditoría Forense y Protocolo de Desconfianza](#13-auditoría-forense-y-protocolo-de-desconfianza)
14. [Cola de Envíos AEAT](#14-cola-de-envíos-aeat)
15. [Observabilidad y Alertas](#15-observabilidad-y-alertas)
16. [Scripts de Verificación y Pruebas](#16-scripts-de-verificación-y-pruebas)
17. [Diagrama de Flujo Completo](#17-diagrama-de-flujo-completo)
18. [Integración con Otros Módulos](#18-integración-con-otros-módulos)
19. [Roadmap y Pendientes](#19-roadmap-y-pendientes)

---

## 1. Resumen Ejecutivo

Veri\*Factu es el sistema de facturación verificable de la AEAT. Volkern lo implementa completamente en modo **«VERI\*FACTU»**, que consiste en el envío automático de cada registro de facturación a la Agencia Tributaria en el momento de su emisión.

La implementación se sustenta sobre tres pilares técnicos:

| Pilar | Tecnología | Archivo Clave |
|-------|-----------|---------------|
| **Hash Chaining** | SHA-256 determinista con encadenamiento | `lib/crypto-utils.ts` |
| **Generación XML** | Esquema SuministroInformacion.xsd de la AEAT | `lib/fiscal/aeat/xml-generator.ts` |
| **Inmutabilidad DB** | Prisma Extension + validación de campos críticos | `lib/db/extensions/billing-lock.ts` |

---

## 2. Marco Normativo y Estándares Técnicos

### 2.1 Legislación Aplicable

| Norma | Descripción |
|-------|-------------|
| Ley 58/2003, art. 29.2.j | Ley General Tributaria — obligación del software |
| Ley 11/2021 | Lucha contra el fraude fiscal — software de doble uso |
| Real Decreto 1007/2023 | Reglamento de facturación Veri\*Factu |
| Orden HAC/1177/2024 | Especificaciones técnicas y funcionales |

### 2.2 Estándares Técnicos Adoptados

| Estándar | Uso |
|----------|-----|
| **SHA-256** | Hash de integridad de cada factura y encadenamiento |
| **XAdES** | Firma electrónica avanzada (voluntaria, implementada) |
| **RSA-SHA256** | Algoritmo de firma XML |
| **XML Canonicalization 1.0** | Canonicalización previa al firmado |
| **SOAP 1.2** | Transporte hacia los servicios web de la AEAT |
| **X.509 (certificado .p12)** | Autenticación del emisor ante la AEAT |
| **RFC 3161** | Sellado de tiempo cualificado |

### 2.3 Namespaces AEAT

```typescript
// lib/fiscal/aeat/config.ts
namespaces: {
  vfact: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd',
  ds:    'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#'
}
```

---

## 3. Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────┐
│                        API Layer (Next.js Route Handlers)           │
│  /api/ordenes-venta/[id]/facturar  ───  /api/v1/invoicing/external │
│  /api/configuracion/fiscal/emisores  ───  /api/v1/sovereignty/*    │
└──────────────────────────────────┬──────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     InvoicingService (lib/invoicing-service.ts)      │
│  createInvoice()  ·  rectifyInvoice()  ·  cancelInvoice()          │
│  sealInvoiceMetadata()  ·  shipToAEAT()  ·  lockPerfilFiscal()     │
└──────────┬──────────────┬──────────────┬───────────────────────────┘
           ▼              ▼              ▼
┌────────────────┐ ┌────────────┐ ┌──────────────────────┐
│ crypto-utils   │ │ AEAT XML   │ │ Billing Lock         │
│ (SHA-256 hash) │ │ Generator  │ │ (Prisma Extension)   │
└────────┬───────┘ └─────┬──────┘ └──────────┬───────────┘
         ▼               ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Base de Datos (PostgreSQL + Prisma)              │
│  Invoice  ·  ConfiguracionFiscalEmisor  ·  PerfilFiscalCliente      │
│  AuditLog  ·  TaxRecord  ·  AccountingEntry                        │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Cola AEAT (BullMQ + Redis)                             │
│  aeatQueue.add('ship_invoice', { invoiceId, tenantId })            │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│   AEAT SOAP Endpoint                                               │
│   Producción: www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/    │
│   Sandbox:    prewww2.aeat.es/wlpl/TIKE-CONT/ws/                  │
│   Path:       .../TiketBai/VerifactuSOAP                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Runtime** | Node.js (Next.js App Router) | 15.x |
| **Lenguaje** | TypeScript | 5.x |
| **Base de datos** | PostgreSQL + Prisma ORM | — |
| **Hashing** | Node.js `crypto.createHash('sha256')` | Nativo |
| **Firma XML** | XAdES (via `lib/fiscal/aeat/signer.ts`) | — |
| **Cola de mensajes** | BullMQ + Redis | — |
| **PDF facturas** | `lib/erp/pdf-service.ts` (incluye QR Veri\*Factu) | — |

---

## 5. Componentes del Sistema

### 5.1 Listado de Archivos Clave

| Archivo | Función |
|---------|---------|
| `lib/crypto-utils.ts` | Motor de hash SHA-256 determinista con encadenamiento |
| `lib/invoicing-service.ts` | Orquestador principal de facturación |
| `lib/fiscal/aeat/config.ts` | Endpoints AEAT + namespaces XML |
| `lib/fiscal/aeat/xml-generator.ts` | Generador de XML conforme al esquema SuministroInformacion.xsd |
| `lib/fiscal/aeat/signer.ts` | Firmado XAdES de XML |
| `lib/fiscal/aeat/client.ts` | Cliente SOAP para envío a la AEAT |
| `lib/fiscal/aeat/observability-service.ts` | Monitoreo y alertas de envíos |
| `lib/fiscal/audit-service.ts` | Auditoría forense de cadena de hashes |
| `lib/db/extensions/billing-lock.ts` | Bloqueo de inmutabilidad en Prisma |
| `lib/queues/aeat-queue.ts` | Cola BullMQ para envíos asíncronos |
| `lib/erp/pdf-service.ts` | Generación de PDF con QR Veri\*Factu |
| `lib/skills/billing-skills.ts` | Skills de facturación para el asistente IA |
| `lib/skills/audit-skills.ts` | Skills de auditoría forense |
| `lib/finance/expense-integrity.ts` | Huella de integridad para gastos |

### 5.2 Archivos de UI (Frontend)

| Archivo | Función |
|---------|---------|
| `app/verifactu/page.tsx` | Página pública de Declaración Responsable |
| `components/fiscal/EmisoresFiscalesTab.tsx` | Configuración de emisores con toggle Veri\*Factu |
| `components/modals/FiscalOnboardingModal.tsx` | Onboarding fiscal con gobernanza Veri\*Factu |
| `components/finance/ManualInvoiceModal.tsx` | Modal de facturación manual con sello Veri\*Factu |
| `components/finance/ExpenseVerificationDetails.tsx` | Detalles de verificación de gastos |
| `components/sovereignty/trust-protocol-logs.tsx` | Logs del Trust Protocol |
| `app/dashboard/agencia/fiscal-health/page.tsx` | Dashboard de salud fiscal multi-tenant |

---

## 6. Modelo de Datos (Prisma)

### 6.1 Tabla Invoice

```prisma
model Invoice {
  // ... campos base (id, tenantId, leadId, contactId, etc.)

  // ── Veri*Factu / AEAT Evidence & Tracking ──
  fingerprint          String?   // Huella SHA-256 de esta factura
  parentFingerprint    String?   // Huella de la factura anterior en la cadena
  sequenceNumber       Int?      // Número de secuencia en la cadena (1, 2, 3...)
  verifactuVersion     Int       @default(1)  // 1 = legacy, 2 = Veri*Factu activo
  isSealed             Boolean   @default(false) // ¿Está sellada criptográficamente?
  signature            String?   // Firma XAdES (si hay certificado)
  signatureAlgorithm   String?   // Algoritmo de firma (RSA-SHA256)
  aeatStatus           String?   // PENDING | SENT | CONFIRMED | ERROR
  aeatCsv              String?   // Código Seguro de Verificación devuelto por AEAT
  aeatResponse         Json?     // Respuesta completa del envío SOAP
  signedXmlUrl         String?   // URL al XML firmado almacenado
  verifactuHash        String?   // Hash adicional para verificación
  fiscalStatus         String?   // vigente | anulada
  metadata             Json?     // Metadatos extensibles (rectificación, anulación, etc.)
}
```

### 6.2 Tabla ConfiguracionFiscalEmisor

```prisma
model ConfiguracionFiscalEmisor {
  // ... campos base
  verifactuEnabled     Boolean   @default(false)  // Toggle principal
  verifactuVersion     Int?      // Versión del esquema Veri\*Factu
  certP12              String?   // Certificado .p12 cifrado (AES-256)
  certPassword         String?   // Contraseña del certificado cifrada
  certFingerprint      String?   // Huella del certificado
  certExpiresAt        DateTime? // Fecha de expiración del certificado
  esPrincipal          Boolean   @default(false)  // Emisor principal
  // ... NIF, nombre, dirección, logo, etc.
}
```

### 6.3 Tabla PerfilFiscalCliente

```prisma
model PerfilFiscalCliente {
  // ... campos base
  isLocked             Boolean   @default(false)  // Bloqueado tras primera factura
  // ... NIF, razón social, régimen fiscal, dirección, etc.
}
```

---

## 7. API Endpoints

| Método | Ruta | Función |
|--------|------|---------|
| `POST` | `/api/ordenes-venta/[id]/facturar` | Crear factura desde orden de venta |
| `POST` | `/api/v1/invoicing/external` | Facturación externa con respuesta Veri\*Factu |
| `GET` | `/api/v1/sovereignty/integrity-chain` | Verificar cadena de integridad de facturas |
| `GET` | `/api/configuracion/fiscal/emisores` | Listar/Obtener emisores fiscales |
| `PUT` | `/api/configuracion/fiscal/emisores/[id]` | Actualizar emisor (incl. toggle Veri\*Factu) |
| `POST` | `/api/configuracion/fiscal/emisores` | Crear nuevo emisor fiscal |
| `GET` | `/api/accounting/dashboard` | Dashboard contable con indicadores Veri\*Factu |

### Ejemplo: Respuesta de facturación externa

```typescript
// app/api/v1/invoicing/external/route.ts
return NextResponse.json({
  invoice: {
    id: invoice.id,
    numero: invoice.numero,
    isSealed: invoice.isSealed,
    fingerprint: invoice.fingerprint,
    verifactuVersion: invoice.verifactuVersion,
    aeatStatus: invoice.aeatStatus,
    aeatCsv: invoice.aeatCsv
  }
});
```

---

## 8. Motor de Encadenamiento (Hash Chaining)

### 8.1 Algoritmo de Generación de Huella

Archivo: **`lib/crypto-utils.ts`**

```typescript
export interface FingerprintPayload {
  tenantId: string;
  emisorNif: string;
  receptorNif: string;
  numero: string;
  fechaEmision: string;   // ISO string
  monto: number;
  moneda: string;
  parentFingerprint: string;
}

export function generateInvoiceFingerprint(payload: FingerprintPayload): string {
  // 1. Ordenar claves alfabéticamente (DETERMINISMO)
  const sortedKeys = Object.keys(payload).sort();
  
  // 2. Concatenar valores con pipe separator
  const dataToHash = sortedKeys.map(key => {
    const value = payload[key];
    if (typeof value === 'number') return value.toFixed(2);
    return String(value);
  }).join('|');

  // 3. SHA-256 → hex → uppercase
  return crypto
    .createHash('sha256')
    .update(dataToHash)
    .digest('hex')
    .toUpperCase();
}

export const GENESIS_FINGERPRINT = "GENESIS_VERIFACTU_2026";
```

### 8.2 Propiedades del Algoritmo

| Propiedad | Garantía |
|-----------|----------|
| **Determinismo** | Mismos inputs → mismo hash (claves ordenadas alfabéticamente) |
| **Unicidad** | Colisión matemáticamente improbable (SHA-256 = 2^256 espacio) |
| **Encadenamiento** | Cada hash depende del anterior → detección de cualquier rotura |
| **Inmutabilidad** | Cualquier modificación de un campo cambia el hash |

### 8.3 Casos de Prueba

Archivo: **`tests/crypto-utils.test.ts`**

```typescript
it('debe ser "GENESIS_VERIFACTU_2026"', () => {
  expect(GENESIS_FINGERPRINT).toBe('GENESIS_VERIFACTU_2026');
});

it('debe usar GENESIS_VERIFACTU_2026 si no hay fingerprint anterior', () => {
  const xml = AEATXmlGenerator.generateAltaFactura({...});
  expect(xml).toContain('<vfact:FingerprintAnterior>GENESIS_VERIFACTU_2026</vfact:FingerprintAnterior>');
});
```

---

## 9. Servicio de Facturación (InvoicingService)

### 9.1 Método Principal: createInvoice()

Archivo: **`lib/invoicing-service.ts`**

```typescript
static async createInvoice(options: CreateInvoiceOptions) {
  // 1. Verificar integración mock_billing activa
  // 2. Delegar a createMockInvoice()
}

private static async createMockInvoice(options) {
  const cliente = await this.getClienteFiscal(leadId, contactId, tenantId);
  
  // ── PASO CRÍTICO: Sellado Veri*Factu ──
  const security = await this.sealInvoiceMetadata({
    tenantId, numero, monto: amount, moneda: currency,
    fechaEmision: fechaEmision.toISOString(),
    receptorNif: cliente.idFiscal
  });

  // Crear factura con todos los campos de seguridad
  const invoice = await prisma.invoice.create({
    data: {
      tenantId, leadId, contactId,
      externalId: `mock_${uuidv4()}`,
      provider: 'mock',
      numero, monto: amount, moneda: currency,
      estado: 'completado',
      fechaEmision,
      metadata: { isMock: true },
      ...security  // fingerprint, parentFingerprint, sequenceNumber,
                   // verifactuVersion, isSealed, signature, aeatStatus
    }
  });

  // Emitir evento para contabilidad
  eventBus.emitEvent(EVENTS.INVOICE_CREATED, { ... });

  return invoice;
}
```

### 9.2 Método sealInvoiceMetadata()

Este es el corazón del sellado Veri\*Factu:

```typescript
private static async sealInvoiceMetadata(params) {
  const configFiscal = await this.getEmisorFiscal(tenantId);
  const emisorNif = configFiscal.idFiscal || 'NIF-PENDIENTE';

  // Si Veri*Factu no está activado → factura legacy (v1, sin sello)
  if (!configFiscal.verifactuEnabled) {
    return {
      verifactuVersion: 1,
      isSealed: false,
      fingerprint: null,
      signature: null
    };
  }

  // ── Modo Veri*Factu 2.0 ──

  // Buscar la última factura sellada para obtener el parentFingerprint
  const lastInvoice = await prisma.invoice.findFirst({
    where: { tenantId, verifactuVersion: 2 },
    orderBy: { sequenceNumber: 'desc' }
  });

  const parentFingerprint = lastInvoice?.fingerprint || GENESIS_FINGERPRINT;
  const nextSequence = (lastInvoice?.sequenceNumber || 0) + 1;

  // Generar huella SHA-256 con el parentFingerprint
  const fingerprint = generateInvoiceFingerprint({
    tenantId, emisorNif, receptorNif,
    numero, fechaEmision, monto, moneda,
    parentFingerprint
  });

  // Firmar electrónicamente
  const { signature, algorithm } = await this.signatureProvider.sign(fingerprint);

  const security = {
    fingerprint,
    parentFingerprint,
    sequenceNumber: nextSequence,
    verifactuVersion: 2,
    isSealed: true,
    signature,
    signatureAlgorithm: algorithm,
    aeatStatus: 'PENDING' as const
  };

  // Si hay certificado .p12 → encolar envío a la AEAT
  if (configFiscal.certP12 && invoiceId) {
    const { aeatQueue } = await import('./queues/aeat-queue');
    await aeatQueue.add('ship_invoice', { invoiceId, tenantId });
  }

  return security;
}
```

### 9.3 Método shipToAEAT()

```typescript
static async shipToAEAT(tenantId: string, data: any) {
  const config = await this.getEmisorFiscal(tenantId);
  
  // Verificar certificado
  if (!config.certP12 || !config.certPassword) {
    throw new Error('Certificado no configurado para este Tenant');
  }

  // Descifrar certificado
  const p12Base64 = CryptoService.decrypt(config.certP12);
  const password = CryptoService.decrypt(config.certPassword);

  // Generar XML firmado
  const { xml, expiresAt, certFingerprint } = await AEATSigner.signXml(
    AEATXmlGenerator.generateAltaFactura(data),
    p12Base64,
    password
  );

  // Verificar expiración del certificado
  if (new Date(expiresAt) < new Date()) {
    throw new Error(`Certificado expirado el ${expiresAt}`);
  }

  // Enviar SOAP a la AEAT
  const response = await AEATClient.sendSoap(xml, p12Base64, password);

  return { response, certFingerprint, sentAt: new Date() };
}
```

### 9.4 Rectificación y Anulación

```typescript
// Rectificar factura (crea nueva factura R-xxxxx)
static async rectifyInvoice(invoiceId: string, options: { reason: string, amount?: number }) {
  const security = await this.sealInvoiceMetadata({...});
  
  const rectification = await prisma.invoice.create({
    data: {
      numero: `R-${original.numero}`,
      monto: options.amount || (original.monto * -1),
      metadata: { isRectification: true, originalInvoiceId: original.id, reason: options.reason },
      ...security
    }
  });
  return rectification;
}

// Anular factura (actualiza original a anulada, crea registro ANUL-xxxxx)
static async cancelInvoice(invoiceId: string) {
  const security = await this.sealInvoiceMetadata({...});
  
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      fiscalStatus: 'anulada',
      metadata: { ...(original.metadata as any), annulmentSecurity: security }
    }
  });
}
```

---

## 10. Generador XML AEAT

Archivo: **`lib/fiscal/aeat/xml-generator.ts`**

```typescript
export class AEATXmlGenerator {
  static generateAltaFactura(data: {
    emisor: { nif: string, nombre: string },
    receptor: { nif: string, nombre: string },
    factura: { numero: string, fecha: string, monto: number, moneda: string },
    encadenamiento: { fingerprintAnterior?: string }
  }) {
    return `
<vfact:RegistroFactura xmlns:vfact="${AEAT_CONFIG.namespaces.vfact}">
  <vfact:IDFactura>
    <vfact:IDEmisorFactura>${emisor.nif}</vfact:IDEmisorFactura>
    <vfact:NumSerieFactura>${factura.numero}</vfact:NumSerieFactura>
    <vfact:FechaExpedicionFactura>${factura.fecha.split('T')[0]}</vfact:FechaExpedicionFactura>
  </vfact:IDFactura>
  <vfact:Emisor>
    <vfact:NIF>${emisor.nif}</vfact:NIF>
    <vfact:NombreRazon>${emisor.nombre}</vfact:NombreRazon>
  </vfact:Emisor>
  <vfact:Receptor>
    <vfact:NIF>${receptor.nif}</vfact:NIF>
    <vfact:NombreRazon>${receptor.nombre}</vfact:NombreRazon>
  </vfact:Receptor>
  <vfact:DetalleFactura>
    <vfact:ImporteTotal>${factura.monto.toFixed(2)}</vfact:ImporteTotal>
    <vfact:Moneda>${factura.moneda}</vfact:Moneda>
  </vfact:DetalleFactura>
  <vfact:Encadenamiento>
    <vfact:FingerprintAnterior>${encadenamiento.fingerprintAnterior || 'GENESIS_VERIFACTU_2026'}</vfact:FingerprintAnterior>
  </vfact:Encadenamiento>
  <vfact:SistemaInformatico>
    <vfact:NombreSistema>Volkern OS</vfact:NombreSistema>
    <vfact:Version>1.0.0</vfact:Version>
  </vfact:SistemaInformatico>
</vfact:RegistroFactura>`.trim();
  }
}
```

### Estructura del XML

| Elemento | Contenido | Obligatorio |
|----------|-----------|-------------|
| `IDFactura` | IDEmisorFactura + NumSerieFactura + FechaExpedicionFactura | ✅ |
| `Emisor` | NIF + NombreRazon | ✅ |
| `Receptor` | NIF + NombreRazon | ✅ |
| `DetalleFactura` | ImporteTotal + Moneda | ✅ |
| `Encadenamiento` | FingerprintAnterior (o GENESIS_VERIFACTU_2026) | ✅ |
| `SistemaInformatico` | NombreSistema + Version | ✅ |

---

## 11. Configuración AEAT

Archivo: **`lib/fiscal/aeat/config.ts`**

```typescript
const isProduction = process.env.NODE_ENV === 'production' 
                  && process.env.AEAT_ENV === 'production';

export const AEAT_CONFIG = {
  endpoints: {
    alta: isProduction 
      ? 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/TiketBai/VerifactuSOAP'
      : 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ws/TiketBai/VerifactuSOAP'
  },
  namespaces: {
    vfact: 'https://www2.agenciatributaria.gob.es/.../SuministroInformacion.xsd',
    ds:    'http://www.w3.org/2000/09/xmldsig#',
    xades: 'http://uri.etsi.org/01903/v1.3.2#'
  },
  algorithms: {
    signature:         'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digest:            'http://www.w3.org/2001/04/xmlenc#sha256',
    canonicalization:  'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
  }
};
```

### Control de Entorno

| Variable | Valor | Entorno |
|----------|-------|---------|
| `NODE_ENV` + `AEAT_ENV` | `production` + `production` | Producción AEAT real |
| Cualquier otra combinación | — | Sandbox AEAT (pruebas) |

---

## 12. Billing Lock — Inmutabilidad a Nivel de Base de Datos

Archivo: **`lib/db/extensions/billing-lock.ts`**

La extensión de Prisma intercepta todas las operaciones `update` y `delete` sobre la tabla `invoice`:

```typescript
query: {
  invoice: {
    async update({ args, query }) {
      const invoice = await client.invoice.findUnique({ where: args.where });
      
      if (invoice?.isSealed) {
        // Campos protegidos: NO se pueden modificar
        const criticalFields = [
          'monto', 'moneda', 'fechaEmision', 'numero',
          'tenantId', 'fingerprint', 'parentFingerprint'
        ];
        
        const violation = Object.keys(args.data).find(
          field => criticalFields.includes(field)
        );
        
        if (violation) {
          throw new Error(
            `SECURITY_VIOLATION: Campo '${violation}' protegido en factura sellada`
          );
        }
      }
      return query(args);
    }
  }
}
```

### Campos Protegidos

| Campo | ¿Modificable? | ¿Borrable? |
|-------|:------------:|:---------:|
| `monto` | ❌ | ❌ |
| `moneda` | ❌ | ❌ |
| `fechaEmision` | ❌ | ❌ |
| `numero` | ❌ | ❌ |
| `tenantId` | ❌ | ❌ |
| `fingerprint` | ❌ | ❌ |
| `parentFingerprint` | ❌ | ❌ |
| `fiscalStatus` | ✅ (solo → anulada) | ❌ |
| `aeatStatus` | ✅ (PENDING → SENT → CONFIRMED) | ❌ |
| `metadata` | ✅ (append-only) | ❌ |

### Políticas Adicionales

| Operación | Política |
|-----------|----------|
| `updateMany` en invoice | Denegado si alguna tiene `isSealed = true` |
| `deleteMany` en invoice | Denegado si alguna tiene `isSealed = true` |
| `delete` en invoice | Denegado si `isSealed = true` |

---

## 13. Auditoría Forense y Protocolo de Desconfianza

### 13.1 AuditService

Archivo: **`lib/fiscal/audit-service.ts`**

```typescript
export class AuditService {
  static async auditTenantChain(tenantId: string) {
    // Obtener todas las facturas Veri*Factu (v2) en orden
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, verifactuVersion: 2 },
      orderBy: { sequenceNumber: 'asc' }
    });

    const breaches: AuditBreach[] = [];
    let expectedParent = GENESIS_FINGERPRINT;

    for (const invoice of invoices) {
      // Verificar que el parentFingerprint coincide con el fingerprint de la anterior
      if (invoice.parentFingerprint !== expectedParent) {
        breaches.push({
          invoiceId: invoice.id,
          numero: invoice.numero,
          expected: expectedParent,
          found: invoice.parentFingerprint || 'null',
          type: 'CHAIN_BROKEN'
        });
      }
      expectedParent = invoice.fingerprint || '';
    }

    return {
      tenantId,
      totalInvoices: invoices.length,
      breaches,
      isIntact: breaches.length === 0
    };
  }
}
```

### 13.2 Protocolo de Desconfianza

Archivo: **`lib/skills/audit-skills.ts`**

```typescript
if (breachesDetected) {
  const message = `🚨 PROTOCOLO DE DESCONFIANZA ACTIVADO
  
Brecha de integridad detectada en Veri*factu para el tenant ${tenantId}.

Infracciones Facturas: ${resultInvoices.breaches.length}
Infracciones Gastos: ${expenseBreaches.length}
Infracciones Libro Diario: ${ledgerBreaches.length}`;

  // Bloquear nuevas emisiones hasta resolver
  await notifyAdmins(message);
}
```

### 13.3 Scripts de Auditoría

| Script | Función |
|--------|---------|
| `scripts/audit-tenant-chain.ts` | Auditoría forense completa de un tenant |
| `scripts/verify-fiscal-chain-step4.ts` | Verificación paso a paso de la cadena fiscal |
| `scripts/verify-verifactu-security.ts` | Pruebas de seguridad Veri\*Factu |
| `scripts/test-verifactu-cases.ts` | Batería de casos de prueba Veri\*Factu |
| `scripts/test-aeat-golden.ts` | Pruebas golden de generación XML AEAT |

---

## 14. Cola de Envíos AEAT

Archivo: **`lib/queues/aeat-queue.ts`**

```typescript
export const aeatQueue = new Queue('aeat-shipments', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,                // Reintentos automáticos
    backoff: {
      type: 'exponential',      // Backoff exponencial
      delay: 60000              // 1 min inicial
    },
    removeOnComplete: 100,      // Mantener últimos 100 jobs completados
    removeOnFail: 200           // Mantener últimos 200 jobs fallidos
  }
});

// Worker que procesa los envíos
aeatQueue.process('ship_invoice', async (job) => {
  const { invoiceId, tenantId } = job.data;
  const result = await InvoicingService.shipToAEAT(tenantId, {
    invoiceId, /* ... */
  });
  
  // Actualizar estado en DB
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      aeatStatus: 'CONFIRMED',
      aeatCsv: result.response.csv,
      aeatResponse: result.response
    }
  });
});
```

### Estados de Envío

```
PENDING ──→ SENT ──→ CONFIRMED
                 │
                 └──→ ERROR ──→ PENDING (reintento automático × 5)
```

---

## 15. Observabilidad y Alertas

Archivo: **`lib/fiscal/aeat/observability-service.ts`**

```typescript
export class AEATObservabilityService {
  // Facturas pendientes de envío (más de 24h)
  static async getPendingShipments() {
    return prisma.invoice.findMany({
      where: {
        verifactuVersion: 2,
        aeatStatus: 'PENDING',
        fechaEmision: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });
  }

  // Emisores con Veri*Factu activado
  static async getActiveVerifactuTenants() {
    return prisma.configuracionFiscalEmisor.findMany({
      where: { verifactuEnabled: true }
    });
  }

  // Certificados próximos a expirar (30 días)
  static async getExpiringCertificates() { /* ... */ }
}
```

---

## 16. Scripts de Verificación y Pruebas

### 16.1 Test de Casos Veri\*Factu

Archivo: **`scripts/test-verifactu-cases.ts`**

```typescript
async function testVerifactu() {
  const tenantId = 'verifactu-test-' + Math.random().toString(36).substring(7);

  // 1. Crear tenant con Veri*Factu activado
  // 2. Crear emisor fiscal con verifactuEnabled: true
  // 3. Emitir facturas en secuencia
  // 4. Verificar encadenamiento (cada parentFingerprint coincide con fingerprint anterior)
  // 5. Intentar modificar factura sellada → debe lanzar SECURITY_VIOLATION
  // 6. Verificar que la cadena completa es íntegra
}
```

### 16.2 Test de Seguridad

Archivo: **`scripts/test-security.ts`**

```typescript
async function testVerifactu() {
  // 1. Generar facturas encadenadas
  // 2. Verificar integridad de cadena
  // 3. Simular intento de borrado → Billing Lock debe bloquear
  // 4. Verificar que el hash se recalcula correctamente
}
```

### 16.3 Test Golden AEAT

Archivo: **`scripts/test-aeat-golden.ts`**

```typescript
// Verifica que el XML generado cumple con el esquema esperado
expect(xml).toContain('<vfact:FingerprintAnterior>GENESIS_VERIFACTU_2026</vfact:FingerprintAnterior>');
expect(xml).toContain('<vfact:NIF>');
expect(xml).toContain('<vfact:NombreSistema>Volkern OS</vfact:NombreSistema>');
```

### 16.4 Unit Tests

Archivo: **`tests/crypto-utils.test.ts`** y **`tests/aeat-xml-generator.test.ts`**

```typescript
// crypto-utils.test.ts
describe('generateInvoiceFingerprint', () => {
  it('debe generar hash consistente con mismos inputs', () => { /* ... */ });
  it('debe cambiar si cambia el parentFingerprint', () => { /* ... */ });
});

// aeat-xml-generator.test.ts
describe('AEATXmlGenerator', () => {
  it('debe incluir GENESIS_VERIFACTU_2026 si no hay fingerprint anterior', () => { /* ... */ });
});
```

---

## 17. Diagrama de Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FLUJO COMPLETO VERI*FACTU                        │
└─────────────────────────────────────────────────────────────────────────┘

  USUARIO                    VOLKERN                          AEAT
─────┼─────────────────────────┼────────────────────────────────┼────────
     │                         │                                │
     │  Emite factura          │                                │
     │────────────────────────>│                                │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ verifactuEnabled?   │                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ NO → v1 (legacy)    │                     │
     │              │ SI → v2 (Veri*Factu)│                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ Buscar última       │                     │
     │              │ factura v2 para     │                     │
     │              │ parentFingerprint   │                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ Calcular SHA-256    │                     │
     │              │ (emisor + receptor  │                     │
     │              │  + numero + fecha   │                     │
     │              │  + monto + moneda   │                     │
     │              │  + parentFingerprint)│                    │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ sequenceNumber =    │                     │
     │              │ anterior + 1        │                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ ¿cert .p12? →       │                     │
     │              │   SI: firmar XAdES  │                     │
     │              │   NO: sin firma     │                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ Crear registro en   │                     │
     │              │ BD con isSealed=true│                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ Billing Lock:       │                     │
     │              │   Campos protegidos │                     │
     │              │   Bloqueo delete    │                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ ¿cert .p12? →       │                     │
     │              │   SI: encolar envío │                     │
     │              │   BullMQ → SOAP     │                     │
     │              │   NO: queda PENDING │                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │              ┌──────────┴──────────┐                     │
     │              │ Emitir evento       │                     │
     │              │ INVOICE_CREATED →   │                     │
     │              │ AccountingListener  │                     │
     │              └──────────┬──────────┘                     │
     │                         │                                │
     │   Factura PDF           │         ┌──────────────────┐   │
     │   con QR Veri*Factu     │         │ XML firmado      │   │
     │<────────────────────────│         │ (SOAP 1.2)       │   │
     │                         │         │──────────────────>│   │
     │                         │         │                  │   │
     │                         │         │ Respuesta AEAT   │   │
     │                         │         │  · Código retorno│   │
     │                         │         │  · CSV           │   │
     │                         │         │<─────────────────│   │
     │                         │         │                  │   │
     │                         │    ┌────┴────┐             │   │
     │                         │    │aeatStatus│            │   │
     │                         │    │=CONFIRMED│            │   │
     │                         │    └─────────┘             │   │
```

---

## 18. Integración con Otros Módulos

### 18.1 Contabilidad

Cuando se emite una factura, se dispara el evento `INVOICE_CREATED`:

```typescript
// lib/invoicing-service.ts
eventBus.emitEvent(EVENTS.INVOICE_CREATED, {
  tenantId, invoiceId, monto, moneda, numero,
  leadId, contactId, source: 'api', timestamp: new Date()
});
```

El **AccountingEventListener** (`lib/accounting/accounting-listener.ts`) recibe este evento y genera automáticamente el asiento contable:

```
430 Clientes              (Debe)   XXX,XX €
  700 Ventas              (Haber)  XXX,XX €
  477 IVA Repercutido     (Haber)   XX,XX €
```

### 18.2 Gastos

Los gastos también se sellan con Veri\*Factu mediante `lib/finance/expense-integrity.ts`:

```typescript
export function computeExpenseFingerprint(expense: Expense): string {
  return crypto
    .createHash('sha256')
    .update(`${expense.tenantId}|${expense.description}|${expense.amount}|${expense.date}`)
    .digest('hex')
    .toUpperCase();
}
```

### 18.3 PDF de Factura

El servicio `lib/erp/pdf-service.ts` incluye automáticamente:

- **QR Veri\*Factu** en la esquina inferior derecha
- **VERIFACTU-ID** visibles en el PDF
- Leyenda de cumplimiento

### 18.4 Nóminas y Contratos

- **Payroll Sealer:** `lib/finance/payroll/es/payroll-sealer.ts` — encadenamiento SHA-256 de nóminas
- **Contract Sealer:** `lib/erp/contract-sealer.ts` — sello digital con evidencia forense
- **Cierre mensual:** `lib/workers/payroll-closure.ts` — solo procede si el 100% de los tickets tienen fingerprint Veri\*Factu

### 18.5 Dashboard de Salud Fiscal

Archivo: `app/dashboard/agencia/fiscal-health/page.tsx`

Panel multi-tenant que muestra:
- Estado de la cadena Veri\*Factu (🟢 íntegra / 🔴 brecha)
- Facturas pendientes de envío
- Certificados próximos a expirar
- Auditorías recientes

---

## 19. Roadmap y Pendientes

| # | Tarea | Prioridad | Estado |
|---|-------|-----------|--------|
| 1 | SII completo para grandes empresas | Alta | En roadmap |
| 2 | Integración nativa con TicketBAI (País Vasco) | Media | En roadmap |
| 3 | Firma XAdES con múltiples certificados por tenant | Baja | Planificado |
| 4 | Dashboard de auditoría avanzada con gráficos de cadena | Baja | Planificado |
| 5 | Exportación del libro registro en formato AEAT | Media | Planificado |
| 6 | Soporte para facturas recibidas en formato Veri\*Factu de terceros | Media | En roadmap |

---

## Apéndice A: Variables de Entorno

| Variable | Descripción | Valores |
|----------|-------------|---------|
| `NODE_ENV` | Entorno de ejecución | `development` / `production` |
| `AEAT_ENV` | Entorno AEAT (solo afecta si `NODE_ENV=production`) | `sandbox` / `production` |
| `AEAT_CERT_PATH` | Ruta al certificado .p12 del sistema | `/path/to/cert.p12` |
| `AEAT_CERT_PASSWORD` | Contraseña del certificado | — |
| `REDIS_URL` | Conexión Redis para BullMQ | `redis://...` |

## Apéndice B: Comandos Útiles

```bash
# Auditoría de cadena de un tenant específico
npx tsx scripts/audit-tenant-chain.ts <tenantId>

# Batería completa de pruebas Veri*Factu
npx tsx scripts/test-verifactu-cases.ts

# Verificación de seguridad
npx tsx scripts/test-security.ts

# Pruebas golden de XML AEAT
npx tsx scripts/test-aeat-golden.ts

# Generar reporte PDF de auditoría fiscal
npx tsx scripts/generate-fiscal-report-pdf.ts <tenantId>

# Unit tests
npm test -- tests/crypto-utils.test.ts
npm test -- tests/aeat-xml-generator.test.ts
```

## Apéndice C: Referencia de Archivos

```
lib/
├── crypto-utils.ts                    # Motor de hash SHA-256
├── crypto-service.ts                  # Cifrado/descifrado AES-256
├── invoicing-service.ts               # Orquestador principal
├── db/extensions/billing-lock.ts      # Bloqueo Prisma
├── queues/aeat-queue.ts               # Cola BullMQ
├── fiscal/
│   ├── audit-service.ts               # Auditoría forense
│   └── aeat/
│       ├── config.ts                  # Endpoints + namespaces
│       ├── xml-generator.ts           # Generador XML
│       ├── signer.ts                  # Firmado XAdES
│       ├── client.ts                  # Cliente SOAP
│       └── observability-service.ts   # Monitoreo
├── skills/
│   ├── billing-skills.ts              # Skills de facturación
│   ├── audit-skills.ts                # Skills de auditoría
│   └── event-bus.ts                   # Bus de eventos
├── finance/
│   └── expense-integrity.ts           # Huella para gastos
├── erp/
│   ├── pdf-service.ts                 # PDF con QR Veri*Factu
│   ├── contract-sealer.ts             # Sello de contratos
│   └── hr-service.ts                  # Nóminas + gastos
└── accounting/
    ├── accounting-listener.ts         # Evento → asiento contable
    └── seed-knowledge-base.ts         # KB Veri*Factu para IA
```

---

*Documento para uso interno del equipo de desarrollo. Versión junio 2026.*
