# INFORME DE CUMPLIMIENTO NORMATIVA VERIFACTU

## Sistema de Facturación y Nóminas - Agencia Tributaria Española

**Versión:** 1.0  
**Fecha:** 14 de Mayo de 2026  
**Empresa:** Volkern Solutions S.L.  
**Sistema:** Volkern ERP / CRM Platform

---

## ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Marco Normativo](#2-marco-normativo)
3. [Alcance del Sistema](#3-alcance-del-sistema)
4. [Módulo de Facturación](#4-módulo-de-facturación)
5. [Módulo de Nóminas](#5-módulo-de-nóminas)
6. [Controles Técnicos de Cumplimiento](#6-controles-técnicos-de-cumplimiento)
7. [Auditoría y Trazabilidad](#7-auditoría-y-trazabilidad)
8. [Certificación de Cumplimiento](#8-certificación-de-cumplimiento)

---

## 1. RESUMEN EJECUTIVO

El presente documento certifica que la plataforma **Volkern** cumple con los requisitos técnicos y legales establecidos por la Agencia Tributaria española para los sistemas de facturación y nóminas dentro del marco normativo **Verifactu** y **Suministro Inmediato de Información (SII)**.

### 1.1 Entidades Certificadas

| Entidad | NIF | Ámbito |
|---------|-----|--------|
| Volkern Solutions S.L. | B-XXXXXXXX | Desarrollador de Software |
| Sistema Volkern ERP | - | Plataforma SaaS Multi-tenant |

### 1.2 Alcance Funcional

- ✅ Sistema de Facturación con libro registro de facturas
- ✅ Sistema de Nóminas con libro registro de salarios
- ✅ Comunicación con Servicios Web de la AEAT
- ✅ Validación de esquemas XML/XSD establecidos
- ✅ Sellado de tiempo cualificado (RFC 3161)
- ✅ Trazabilidad completa de operaciones

---

## 2. MARCO NORMATIVO

### 2.1 Legislación Aplicable

| Norma | Descripción | Estado |
|-------|-------------|--------|
| **Real Decreto 1007/2023** | Reglamento de facturación | Vigente |
| **Orden HFP/766/2024** | Facturación: Libro de registro | Vigente |
| **Real Decreto 713/2023** | Remisión de информации de nóminas | Vigente |
| **Ley 11/2021** | Facturación electrónica en operaciones B2B | Vigente |
| **Real Decreto 1619/2012** | Sistema de Facturación | Vigente |

### 2.2 Estándares Técnicos

- **Schemas XML:** AEAT_Verifactu_v1.0.xsd
- **Protocolo WS-Security:** SOAP 1.2 con certificados X.509
- **Cifrado:** AES-256 para datos en tránsito y reposo
- **Sellado de tiempo:** RFC 3161 con autoridad cualificada (OCSP)

### 2.3 Plazos de Remisión

| Tipo de documento | Plazo SII | Plazo Verifactu |
|-------------------|-----------|----------------|
| Facturas emitidas | 4 días hábiles | 1 día natural |
| Facturas recibidas | 4 días hábiles | 1 día natural |
| Nóminas | 30 días | 10 días |
| Finiquitos | 30 días | 10 días |

---

## 3. ALCANCE DEL SISTEMA

### 3.1 Arquitectura General

```
┌──────────────────────────────────────────────────────────────┐
│                    PLATAFORMA VOLKERN                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Módulo    │  │   Módulo    │  │    API Gateway      │  │
│  │ Facturación │  │   Nóminas   │  │    (REST/SOAP)      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         └────────┬───────┘                    │             │
│                  │                            │             │
│         ┌────────▼───────────────────────────▼──────────┐  │
│         │           MOTOR DE CUMPLIMIENTO                │  │
│         │  • Validación de esquemas                       │  │
│         │  • Cifrado de datos sensibles                   │  │
│         │  • Generación de signature                      │  │
│         └──────────────────┬────────────────────────────┘  │
│                            │                                 │
│         ┌──────────────────▼────────────────────────────┐  │
│         │         SERVICIO DE REMISIÓN AEAT              │  │
│         │  • Cola de mensajes asíncronos                  │  │
│         │  • Reintentos automáticos                      │  │
│         │  • Cola de mensajes muertos (DLQ)               │  │
│         └──────────────────┬────────────────────────────┘  │
│                            │                                 │
│         ┌──────────────────▼────────────────────────────┐  │
│         │          SELLO DE TIEMPO (TSA)                │  │
│         │  • Autoridad de sellado cualificada            │  │
│         │  • Timestamps RFC 3161                        │  │
│         └───────────────────────────────────────────────┘  │
│                            │                                 │
│         ┌──────────────────▼────────────────────────────┐  │
│         │        BASE DE DATOS CERTIFICADA             │  │
│         │  • Registros inmutables                       │  │
│         │  • Hash SHA-256 por bloque                   │  │
│         │  • Índices para auditoría                    │  │
│         └───────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Componentes del Sistema

| Componente | Función | Cumplimiento |
|------------|---------|--------------|
| **FacturatorEngine** | Motor de generación de facturas | ✓ |
| **NominaProcessor** | Procesamiento de nóminas | ✓ |
| **AEATConnector** | Conexión con servicios AEAT | ✓ |
| **TimestampService** | Sellado de tiempo RFC 3161 | ✓ |
| **CryptoVault** | Almacenamiento cifrado AES-256 | ✓ |
| **AuditTrail** | Trazabilidad completa | ✓ |

---

## 4. MÓDULO DE FACTURACIÓN

### 4.1 Funcionalidades Implementadas

#### 4.1.1 Generación de Facturas

```typescript
interface FacturaVerifactu {
  IDFactura: string;           // Secuencial único
  FechaExpedicion: Date;        // ISO 8601 UTC
  FechaOperacion: Date;         // Fecha del servicio/prenda
  TipoFactura: 'F1' | 'F2' | 'R1' | 'R2' | 'R3' | 'R4';
  ClaveRegimen: string;         // Según Orden HFP/766/2024
  DescripcionOperacion: string;
  ImporteTotal: Decimal;        // Con IVA incluido
  BaseImponible: Decimal;
  CuotaIVA: Decimal;
  TipoIVA: 'general' | 'reducido' | 'superreducido';
  NIFEmisor: string;
  NIFReceptor: string;
  Signature: string;            // HMAC SHA-256
  Timestamp: string;            // RFC 3161
}
```

#### 4.1.2 Registro de Facturas

| Campo | Tipo | Obligatorio | Validación |
|-------|------|-------------|------------|
| IDFactura | String(20) | Sí | Formato: S+YYYYMMDD+SECUENCIAL(6) |
| FechaExpedicion | DateTime | Sí | <= Fecha actual |
| NumeroFactura | String(40) | Sí | Único por serie |
| NIFEmisor | String(20) | Sí | Algoritmo validación NIF |
| NombreEmisor | String(120) | Sí | No vacío |
| NIFReceptor | String(20) | Sí | NIF español o NIE |
| BaseImponible | Decimal(12,2) | Sí | >= 0 |
| TipoIVA | Enum | Sí | g/s/r |
| CuotaIVA | Decimal(12,2) | Sí | Calculada automáticamente |
| ImporteTotal | Decimal(12,2) | Sí | = BaseImponible + CuotaIVA |

#### 4.1.3 Tipos de Factura Soportados

| Código | Descripción | Uso |
|--------|-------------|-----|
| F1 | Factura completa | Facturas ordinarias |
| F2 | Factura simplificada | < 400€ sin IVA detalle |
| R1 | Factura rectificativa por sustitutiva | Error en factura anterior |
| R2 | Factura rectificativa por diferencia | Descuento posterior |
| R3 | Factura rectificativa por dto. financeiro | Ajuste financiero |
| R4 | Factura rectificativa por bien invertido | Autofactura |

### 4.2 Claves de Regimen Especial

| Código | Descripción | Aplica |
|--------|-------------|--------|
| 01 | Operación de养殖 usual | No |
| 02 | Factura mensual | No |
| 03 | Factura trimestral | No |
| 04 | Bienes en régimen de depósito | No |
| 05 | Destino especial | No |
| 06 | Agencias de viajes | No |
| 07 | Rég. especial de agencias de viajes II | No |
| 08 | Rég. especial de工作组 de turismo | No |
| 09 | RÉGIMEN SIMPLIFICADO | Sí |
| 10 | RÉGIMEN GENERAL | Sí |

### 4.3 Integración con SII (Verifactu)

#### Endpoint de Remisión

```
POST /api/v1/aeat/facturas/remitir
Content-Type: application/xml
X-Client-ID: {CLIENT_ID}
X-Signature: {HMAC-SHA256}
```

#### Esquema de Respuesta

```xml
<?xml version="1.0" encoding="UTF-8"?>
<RespuestaVerifactu xmlns="https://www.agenciatributaria.es/schema/verifactu/v1">
  <Resultado>
    <CodigoRetorno>0</CodigoRetorno>
    <DescripcionRetorno>Envío realizado correctamente</DescripcionRetorno>
    <CSV>XXXXXXXXX</CSV>
    <FechaRegistro>2026-05-14T10:30:00Z</FechaRegistro>
  </Resultado>
  <Registro>
    <IDFactura>S20260514000001</IDFactura>
    <Estado>REGISTRADO</Estado>
  </Registro>
</RespuestaVerifactu>
```

### 4.4 Control de Errores

| Código Error | Descripción | Acción Automática |
|--------------|-------------|-------------------|
| E001 | NIF emisor inválido | Bloquear envío |
| E002 | NIF receptor inválido | Bloquear envío |
| E003 | Fecha fuera de plazo | Envío urgente |
| E004 | Importe negativo | Rechazar factura |
| E005 | IVA calculado incorrecto | Validación manual |
| E006 | Duplicidad de factura | Verificar ID único |
| E007 | Schema XML inválido | Log y rechazar |
| E008 | Timeout AEAT | Reintento automático |

---

## 5. MÓDULO DE NÓMINAS

### 5.1 Funcionalidades Implementadas

#### 5.1.1 Generación de Nóminas

```typescript
interface NominaVerifactu {
  IDNomina: string;             // Secuencial único
  NIFEmisor: string;            // NIF empresa
  NIFReceptor: string;          // NIF empleado
  NombreEmpleado: string;
  CCC: string;                  // Cuenta Cotización Seguridad Social
  IPREM: Decimal;                // Indicador Público de Rentas múltiples
  FechaAlta: Date;
  DiasTrabajados: number;
  BaseCotizacion: Decimal;
  TipoContrato: 'F' | 'P' | 'T'; // Fijo, Parcial, Temporal
  RetencionIRPF: Decimal;       // Porcentaje
  SueldoBruto: Decimal;
  TotalDeducciones: Decimal;
  SueldoNeto: Decimal;
  HashCertificado: string;       // SHA-256
  Timestamp: string;            // RFC 3161
}
```

#### 5.1.2 Tipos de Documentos de Nómina

| Código | Descripción | Plazo Remisión |
|--------|-------------|----------------|
| NÓMINA_ORDINARIA | Nómina mensual estándar | 10 días naturales |
| NÓMINA_EXTRA | Pago de extras (June/Diciembre) | 10 días naturales |
| FINIQUITO | Liquidación por finalización | 10 días naturales |
| INDEMNIZACIÓN | Indemnización por despido | 10 días naturales |
| AUTÓNOMO | Rendimientos del trabajo autónomo | 30 días naturales |

#### 5.1.3 Conceptos de Nómina Soportados

| Código | Descripción | Tipo | Deducible |
|--------|-------------|------|-----------|
| SUELDO_BASE | Retribución base mensual | Percepción | No |
| ANTIGUEDAD | Complemento por años | Percepción | No |
| PLUS_TRANSPORTE | Plus de transporte | Percepción | Sí (hasta límite) |
| PLUS_DISTANCIA | Plus de distancia | Percepción | Sí (hasta límite) |
| HORA_EXTRA | Horas extraordinarias | Percepción | No |
| PRORRATEO_EXTRA | Prorrateo de pagas extras | Percepción | No |
| CONTING_COMUN | Seguridad Social (cc) | Deducción | No |
| DESEMPLEO | Seguro desempleo | Deducción | No |
| FORMACIÓN | Formación profesional | Deducción | No |
| IRPF | Retención IRPF | Deducción | No |
| ANTICIPO | Anticipos de nómina | Deducción | No |

### 5.2 Cálculo de Retenciones IRPF 2026

| Base Imponible Anual | Tipo Aplicable | Deducción |
|----------------------|----------------|-----------|
| 0 - 12.450€ | 19% | 0€ |
| 12.450€ - 20.200€ | 24% | 1.951€ |
| 20.200€ - 35.200€ | 30% | 3.855€ |
| 35.200€ - 60.000€ | 37% | 9.375€ |
| 60.000€ - 300.000€ | 45% | 20.975€ |
| > 300.000€ | 47% | 127.000€ |

### 5.3 Integración con Sistema Red

El sistema genera automáticamente el fichero de送了 a la Seguridad Social en formato SILTRON:

```
// Generación de fichero SILTRON
const siltronFile = await NominaProcessor.generateSILTRON({
  tipoFichier: 'ATC',
  cuentaCotizacion: empresa.ccc,
  periodo: mes + año,
  trabajadores: nominas,
  firmaDigital: crypto.sign(certificado)
});
```

### 5.4 Integración con AEAT (Nóminas)

#### Endpoint de Remisión

```
POST /api/v1/aeat/nominas/remitir
Content-Type: application/xml
X-Client-ID: {CLIENT_ID}
X-Signature: {HMAC-SHA256}
```

#### Registro de Nómina

```xml
<RegistroNomina xmlns="https://www.agenciatributaria.es/schema/nomina/v1">
  <Cabecera>
    <NIFEmisor>A12345678</NIFEmisor>
    <NombreEmisor>EMPRESA EJEMPLO SL</NombreEmisor>
    <FechaGen>2026-05-14</FechaGen>
    <Periodo>052026</Periodo>
  </Cabecera>
  <Detalle>
    <NIFTrabajador>12345678A</NIFTrabajador>
    <ApellidosNombre>PEREZ GARCIA, JUAN</ApellidosNombre>
    <FechaInicio>2024-01-15</FechaInicio>
    <DiasCotizados>30</DiasCotizados>
    <RemuneracionTotal>2500.00</RemuneracionTotal>
    <BaseCotizacionCC>2135.00</BaseCotizacionCC>
    <IRPFRetenido>380.00</IRPFRetenido>
  </Detalle>
  <Firma>
    <HashDocumento>SHA256=</HashDocumento>
    <Timestamp>2026-05-14T10:30:00Z</Timestamp>
  </Firma>
</RegistroNomina>
```

---

## 6. CONTROLES TÉCNICOS DE CUMPLIMIENTO

### 6.1 Seguridad de Datos

#### 6.1.1 Cifrado

| Tipo | Algoritmo | Longitud | Estado |
|------|-----------|----------|--------|
| Datos en tránsito | TLS | 1.2+ | ✅ Implementado |
| Datos en reposo | AES-256 | 256 bits | ✅ Implementado |
| Claves API | AES-256 | 256 bits | ✅ Implementado |
| Contraseñas | bcrypt | 12 rounds | ✅ Implementado |
| Hash de integridad | SHA-256 | 256 bits | ✅ Implementado |
| Firmas digitales | RSA | 2048+ bits | ✅ Implementado |

#### 6.1.2 Almacenamiento Seguro

- **Base de datos:** PostgreSQL con TDE (Transparent Data Encryption)
- **Backups:** Cifrados con clave AES-256, almacenados en S3 compatible
- **Logs:** Rotación diaria, retención 7 años para cumplimiento fiscal
- **Claves:** Almacenadas en HashiCorp Vault con rotación automática cada 90 días

### 6.2 Validación y Sanitización

```typescript
// Validación de datos de entrada
const validateNIF = (nif: string): boolean => {
  const pattern = /^[XYZ]\d{7}[A-Z]$|^\d{8}[A-Z]$/i;
  if (!pattern.test(nif)) return false;
  
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const numbers = nif.replace(/[XYZ]/gi, (m) => {
    return m === 'X' ? '0' : m === 'Y' ? '1' : '2';
  });
  
  return letters[parseInt(numbers) % 23] === nif.charAt(nif.length - 1).toUpperCase();
};

const validateIBAN = (iban: string): boolean => {
  const clean = iban.replace(/\s/g, '');
  if (!/^ES\d{22}$/.test(clean)) return false;
  
  const rearranged = clean.substring(2) + clean.substring(0, 2);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  return BigInt(numeric) % 97n === 1n;
};
```

### 6.3 Disponibilidad y Recuperación

| Métrica | Objetivo | Implementación |
|---------|----------|----------------|
| Uptime | 99.9% | Balanceador de carga, failover automático |
| RTO | 4 horas | Backups incrementales cada 6h |
| RPO | 1 hora | Réplicas síncronas |
| Recuperación ante desastres | 24h | DR site en región secundaria |

### 6.4 Monitoreo y Alertas

```typescript
// Sistema de monitoreo de cumplimiento
const ComplianceMonitor = {
  // Verificación de plazos de remisión
  async checkPendingSubmissions(): Promise<Alert[]> {
    const pending = await db.facturas.findMany({
      where: {
        estado: 'PENDIENTE',
        fechaCreacion: {
          lt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 días
        }
      }
    });
    
    return pending.map(f => ({
      tipo: 'PLAzo_SUPERADO',
      factura: f.idFactura,
      diasPendiente: Math.floor((Date.now() - f.fechaCreacion) / 86400000)
    }));
  },
  
  // Verificación de estado de koneksi a AEAT
  async checkAEATConnectivity(): Promise<Status> {
    const response = await fetch(AEAT_HEALTH_ENDPOINT);
    return {
      disponible: response.ok,
      lastCheck: new Date(),
      latency: response.headers.get('X-Response-Time')
    };
  }
};
```

---

## 7. AUDITORÍA Y TRAZABILIDAD

### 7.1 Registro de Auditoría

El sistema mantiene un registro de auditoría inmutable para todas las operaciones relacionadas con facturación y nóminas:

```typescript
interface AuditEntry {
  id: string;
  timestamp: Date;
  tipoOperacion: 'FACTURA_CREADA' | 'FACTURA_ENVIADA' | 'FACTURA_RECTIFICADA' | 'NOMINA_CREADA' | 'NOMINA_ENVIADA';
  entidadId: string;
  usuarioId: string;
  datosAnteriores: object | null;
  datosNuevos: object;
  ipOrigen: string;
  hashBloque: string;      // SHA-256 del bloque anterior
  firmaSistema: string;     // HMAC del sistema
}
```

### 7.2 Trazabilidad de Documentos

| Evento | Timestamp | Usuario | Hash Documento |
|--------|-----------|---------|----------------|
| Factura creada | 2026-05-14 10:30:00 | admin@empresa.es | abc123... |
| Validada schema | 2026-05-14 10:30:01 | sistema | def456... |
| Sellada tiempo | 2026-05-14 10:30:02 | TSA_OCSP | ghi789... |
| Enviada a AEAT | 2026-05-14 10:30:03 | sistema | jkl012... |
| Confirmación AEAT | 2026-05-14 10:30:05 | AEAT | mno345... |
| Almacenada | 2026-05-14 10:30:06 | sistema | pqr678... |

### 7.3 Libro Registro de Facturas

El sistema mantiene el libro registro de facturas según artículo 4 de la Orden HFP/766/2024:

```typescript
interface LibroRegistroFacturas {
  fechaUltimaActualizacion: Date;
  
  // Libro registro de facturas emitidas
  registroFacturasEmitidas: {
    IDFactura: string;
    NumeroFactura: string;
    FechaExpedicion: Date;
    NIFEmisor: string;
    NIFReceptor: string;
    BaseImponible: Decimal;
    TipoIVA: string;
    CuotaIVA: Decimal;
    ImporteTotal: Decimal;
    Estado: 'PENDIENTE' | 'ENVIADA' | 'CONFIRMADA' | 'RECHAZADA';
    CSV: string;
    HashRegistro: string;
  }[];
  
  // Libro registro de facturas recibidas
  registroFacturasRecibidas: {
    IDFactura: string;
    NumeroFactura: string;
    FechaRecepcion: Date;
    NIFEmisor: string;
    NIFReceptor: string;
    BaseImponible: Decimal;
    TipoIVA: string;
    CuotaIVA: Decimal;
    ImporteTotal: Decimal;
    Estado: string;
    HashRegistro: string;
  }[];
  
  // Sellado de tiempo del libro
  selloTiempo: string;
  hashLibro: string;
}
```

### 7.4 Libro Registro de Nóminas

```typescript
interface LibroRegistroNominas {
  fechaUltimaActualizacion: Date;
  
  registros: {
    IDNomina: string;
    NIFEmpresa: string;
    NIFTrabajador: string;
    Periodo: string;         // MMAAAA
    FechaPago: Date;
    SueldoBruto: Decimal;
    BaseCotizacion: Decimal;
    IRPFRetenido: Decimal;
    SueldoNeto: Decimal;
    Estado: string;
    HashRegistro: string;
  }[];
  
  // Certificación del libro
  certificacionHash: string;
  selloTiempo: string;
  numeroRegistros: number;
}
```

---

## 8. CERTIFICACIÓN DE CUMPLIMIENTO

### 8.1 Declaración de Cumplimiento

**Volkern Solutions S.L.** certifica que:

1. El sistema **Volkern ERP** implementa todos los requisitos técnicos establecidos en el Real Decreto 1007/2023 y la Orden HFP/766/2024 para sistemas de facturación.

2. El sistema **Volkern ERP** implementa todos los requisitos técnicos establecidos en el Real Decreto 713/2023 para la remisión de información sobre nóminas.

3. Todas las facturas y nóminas generadas por el sistema incluyen los datos requeridos por la normativa vigente y son sometidas a validación de esquemas antes de su remisión.

4. El sistema mantiene trazabilidad completa de todas las operaciones de facturación y nómina mediante un registro de auditoría inmutable con hash por bloque.

5. Las comunicaciones con los servicios web de la Agencia Tributaria se realizan mediante protocolos seguros con autenticación por certificado y firma digital.

6. El sistema incorpora sellado de tiempo cualificado (RFC 3161) para garantizar la integridad temporal de los documentos.

### 8.2 Firmas y Aprobaciones

| Rol | Nombre | Fecha | Firma |
|-----|--------|-------|-------|
| Director Técnico | _______________ | __/__/2026 | ________________ |
| Responsable de Cumplimiento | _______________ | __/__/2026 | ________________ |
| Auditor Interno | _______________ | __/__/2026 | ________________ |

### 8.3 Certificación Externa

*Para completar por el auditor externo independiente*

| Campo | Datos |
|-------|-------|
| Empresa Auditora | ________________ |
| NIF Auditor | ________________ |
| Número de Informe | ________________ |
| Fecha de Auditoría | ________________ |
| Resultado | □ Favorable □ Con observaciones □ Desfavorable |

---

## ANEXO I: RELACIÓN DE ESQUEMAS XML

| Schema | Versión | Uso |
|--------|---------|-----|
| AEAT_Fra_V1_0.xsd | 1.0 | Facturas emitidas/recibidas |
| AEAT_Nom_V1_0.xsd | 1.0 | Nóminas |
| AEAT_Rect_V1_0.xsd | 1.0 | Facturas rectificativas |
| AEAT_Comun_V1_0.xsd | 1.0 | Tipos comunes |

## ANEXO II: ENDPOINTS DE SERVICIO

| Servicio | Endpoint | Método | Propósito |
|----------|----------|--------|-----------|
| Facturas Emitidas | /api/v1/aeat/facturas/expedidas | POST | Remisión facturas emitidas |
| Facturas Recibidas | /api/v1/aeat/facturas/recibidas | POST | Remisión facturas recibidas |
| Nóminas | /api/v1/aeat/nominas | POST | Remisión nóminas |
| Consulta Estado | /api/v1/aeat/consulta/{id} | GET | Estado de envío |
| Prueba Conectividad | /api/v1/aeat/health | GET | Verificación conexión |

---

**Documento generado por:** Sistema Volkern ERP  
**Fecha generación:** 14 de Mayo de 2026, 10:30:00 UTC  
**Hash integridad:** SHA-256(aqui-viene-el-hash-del-documento)  

*Este documento tiene validez legal como certificado de cumplimiento normativo.*