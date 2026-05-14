# DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN

**Volkern ERP - Plataforma SaaS Multi-tenant**

---

## Identificación del Documento

| Campo | Valor |
|-------|-------|
| **Código Identificador** | VOLKERN-SIF-2026-001 |
| **Versión** | 1.0.0 (Mayo 2026) |

---

## Declaracion

En cumplimiento de lo dispuesto en la **Orden Ministerial HAC/1177/2024**, aprobada por el **Real Decreto 1007/2023**, **Dimension Expert LLC** declara que se hace responsable como entidad productora del Sistema Informático de Facturación (SIF) **Volkern**, del cumplimiento con lo dispuesto en el artículo 29.2.j) de la **Ley 58/2003, de 17 de diciembre, General Tributaria**, en el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales, y la estandarización de formatos de los registros de facturación y la correspondiente documentación en la sede electrónica de la Agencia Estatal de Administración Tributaria.

---

## 1. Descripción del Sistema Informático de Facturación

El sistema informático **Volkern** consta de un componente software (aplicación web SaaS) y no requiere hardware específico por parte del usuario, funcionando íntegramente en la nube.

Este SIF está diseñado como una **plataforma integral de gestión empresarial en la nube** que optimiza los procesos de gestión de clientes (CRM), ventas, servicios, proyectos, facturación y contabilidad. Está especialmente concebida para pequeñas y medianas empresas (PYMES), agencias, consultoras y negocios del sector servicios que requieran un sistema de facturación conforme a la normativa española.

Entre sus distintas funcionalidades, **Volkern** permite la generación y remisión de registros de facturación a la Agencia Tributaria incorporando los requisitos legales y las especificaciones técnicas establecidas para los sistemas informáticos que intervienen en procesos de facturación, garantizando la trazabilidad, integridad y autenticidad de los registros conforme a la normativa aplicable.

---

## 2. Operativa en modo «VERI*FACTU»

> **DECLARACIÓN DE MODALIDAD DE USO**
>
> **Volkern** en la versión identificada (1.0.0) **permite su utilización por parte de múltiples obligados tributarios**, los cuales son gestionados e identificados de forma individual dentro del sistema, asegurando el encadenamiento de los registros de facturación conforme a lo establecido en el Real Decreto 1007/2023.

---

## 3. Funcionalidades de Cumplimiento

La versión arriba descrita del software **Volkern** permite operar a sus usuarios exclusivamente en el marco del sistema **«VERI*FACTU»**, implementando las siguientes funcionalidades de cumplimiento:

| Funcionalidad | Descripción |
|--------------|-------------|
| **Generación de facturas** | Creación de facturas con todos los campos obligatorios según RD 1007/2023: IDFactura, FechaExpedicion, FechaOperacion, TipoFactura, NIFEmisor, NIFReceptor, BaseImponible, TipoIVA, CuotaIVA, ImporteTotal |
| **Libro registro de facturas** | Mantenimiento de registro cronológico de facturas emitidas y recibidas con sellado de tiempo cualificado |
| **Validación de esquemas** | Verificación de formato XML/XSD conforme a las especificaciones de la AEAT para Verifactu |
| **Encadenamiento de registros** | Hash SHA-256 por bloque que garantiza la integridad y no manipulación de registros anteriores |
| **Sellado de tiempo** | Aplicación de sellado de tiempo RFC 3161 con autoridad de sellado cualificada |
| **Remisión a AEAT** | Envío de registros de facturación a los servicios web de la Agencia Tributaria en los plazos establecidos |
| **Gestión multi-tenant** | Aislamiento completo de datos por obligado tributario con identificadores únicos |

---

## 4. Firmas Electrónicas Avanzadas (Voluntarias)

> **IMPORTANTE:** A pesar de no constituir un requisito obligatorio para los sistemas operativos en modo «VERI*FACTU», el sistema informático **Volkern** implementa, de forma adicional y voluntaria, la incorporación de una **firma electrónica avanzada conforme al estándar XAdES** en cada registro de facturación, reforzando así las garantías de integridad, autenticidad y trazabilidad de los datos generados, en línea con los principios de fiabilidad tecnológica exigidos por la normativa vigente.

---

## 5. Datos de la Entidad Productora

| Campo | Valor |
|-------|-------|
| **Razón Social** | Dimension Expert LLC |
| **Nombre Comercial** | **Volkern** |
| **Tax ID** | XX-XXXXXXX (EIN USA) / NIF Español de actividad: Pendiente |
| **Domicilio** | Not applicable (LLC registered in United States) |
| **Actividad** | Desarrollo y comercialización de software SaaS para gestión empresarial |
| **Versión del Sistema** | 1.0.0 |

---

## 6. Declaración de Cumplimiento

La entidad productora del sistema informático, con razón social **Dimension Expert LLC**, Nombre comercial **Volkern**, Tax ID **XX-XXXXXXX**, formula la presente **Declaración Responsable**, bajo su responsabilidad, manifestando que **Volkern** en su versión **1.0.0** cumple con lo establecido en:

- El artículo 29.2.j) de la **Ley 58/2003, de 17 de diciembre, General Tributaria**
- El **Real Decreto 1007/2023**, de 5 de diciembre, por el que se aprueba el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales
- La **Orden HAC/1177/2024**, de 17 de octubre, por la que se desarrollan las especificaciones técnicas y funcionales del Sistema de Facturación Verifactu
- Las especificaciones adicionales publicadas en la sede electrónica de la **Agencia Estatal de Administración Tributaria (AEAT)**

---

## 7. Compromiso de Mantenimiento

**Dimension Expert LLC** se compromete a:

- Mantener actualizado el sistema **Volkern** conforme a las modificaciones normativas que publique la AEAT
- Comunicar cualquier actualización o nueva versión que implique cambio en las especificaciones técnicas de Verifactu
- Conservar la documentación técnica que permita auditar el cumplimiento del sistema durante el período legalmente establecido
- Colaborar con las autoridades competentes en caso de requerimiento de información o auditoría

---

## Firma y Fecha

**A 14 de mayo de 2026, en Internet (sede electrónica)**

**Firmado electrónicamente por:**

| | |
|---|---|
| **Firmado por:** | Dimension Expert LLC |
| **Rol:** | Representante Legal |
| **Nombre:** | _______________________ |
| **NIF:** | _______________________ |

| | |
|---|---|
| **Firmado por:** | Volkern / Dimension Expert LLC |
| **Rol:** | Director Técnico |
| **Nombre:** | _______________________ |
| **NIF:** | _______________________ |

---

**Código:** VOLKERN-SIF-2026-001  
**Versión:** 1.0.0  
**Fecha:** 14/05/2026  
**Documento generado conforme al Real Decreto 1007/2023 y Orden HAC/1177/2024**