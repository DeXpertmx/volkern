# Arquitectura Técnica: OS Empresarial y Hardening (Fase 4)

Este documento detalla la arquitectura técnica de Volkern, consolidada como un Sistema Operativo (OS) empresarial cohesivo, con un enfoque en alta disponibilidad, inteligencia operativa (AIOps) y un blindaje de integridad de grado fiscal aplicable transversalmente.

## 1. El Núcleo de Cohesión (Shared Context)
Volkern opera bajo un esquema de **Single Source of Truth** a través de Prisma ORM. Los módulos (Hubs) no están fragmentados en silos de bases de datos; comparten relaciones directas.
* Un **Lead** (CRM) se convierte en **Contacto**, firma un **Contrato** (ERP), y genera una **Factura** (Finanzas) compartiendo las mismas referencias de Tenant y Entidad.
* Esta cohesión elimina la necesidad de sincronizaciones complejas entre microservicios, previniendo inconsistencias de datos.

## 2. Hardening Ledger (Integridad Inmutable)
Inspirado en la normativa fiscal Veri*Factu (AEAT), hemos extendido la protección matemática a toda la cadena de custodia de la empresa usando **Hash Chaining (SHA-256)** y sellos digitales.

Las siguientes entidades están blindadas:
1. **Facturación Fiscal (`Invoice`)**: Generación XAdES, huella inmutable y envío seguro a AEAT.
2. **Contratos Comerciales (`Contrato`)**: A través del `ContractSealer`, asegurando que las cláusulas y precios no sean modificados post-firma.
3. **Nóminas (`PayrollRecordES` y `PayrollRecord`)**: Mediante `PayrollSealer`, garantizando un registro inalterable para auditorías laborales.
4. **Inventario (`StockMovement`)**: Cada entrada/salida está encadenada al movimiento anterior, previniendo fraude interno en almacenes.

## 3. Arquitectura Event-Driven (BullMQ & Redis)
Para garantizar resiliencia, la orquestación entre módulos es asíncrona:
* **Desacoplamiento**: La generación del sello digital es síncrona (instantánea para UX), pero la comunicación externa (ej. envío a AEAT) es delegada a colas (Workers).
* **Retry Exponencial**: Resiliencia ante caídas de APIs de terceros (Hacienda, pasarelas de pago) asegurando la entrega sin bloquear el hilo principal.

## 4. AIOps y Observabilidad Inteligente
El motor `AEAAIOpsService` transforma el monitoreo reactivo en una infraestructura autónoma.

* **Baselines Duales**: El sistema aprende el comportamiento normal (ventana 24h vs 7 días) y calcula Desviaciones Estándar (Z-score).
* **Root Cause Engine**: Correlaciona el tamaño de las colas, la tasa de error y la latencia para diagnosticar si un problema es de infraestructura interna o de la entidad externa.
* **Trend & Drift Detection**: Detecta degradaciones lentas (slopes) antes de que rompan umbrales críticos.
* **Auto-Healing**: Capacidad del motor de tomar decisiones defensivas (ej. pausar procesos de un tenant específico que genera errores masivos para proteger la reputación de la IP global).
* **Capacity Forecasting**: Predice el tiempo (en horas) hasta la saturación de los workers en base a la pendiente de encolado actual.

## 5. Security & Crypto Layer
* **Gestión de Secretos**: Los certificados `.p12` de clientes y contraseñas de integración se cifran en la base de datos usando `AES-256-CBC` (`CryptoService`). El descifrado ocurre estrictamente en memoria (Runtime) durante el instante de la firma.
