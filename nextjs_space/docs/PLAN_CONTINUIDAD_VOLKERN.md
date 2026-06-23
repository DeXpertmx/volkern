# PLAN DE CONTINUIDAD Y SUCESIÓN VOLKERN
## Guía para la Continuidad del Negocio en Caso de Inoperatividad del Fundador

---

**Versión:** 1.0  
**Fecha de creación:** 17 de mayo de 2026  
**Clasificación:** CRÍTICO - Solo para herederos/responsables designados  
**Ubicación física de este documento:** En poder del heredero legal, con copia al abogado

---

## DECLARACIÓN DE PROPÓSITO

Este documento tiene un único objetivo: garantir que Volkern pueda continuar operando y comercializándose sin la presencia del fundador actual. Contiene todo lo necesario para que una persona con conocimientos técnicos moderados pueda:

1. Entender qué es Volkern y su propuesta de valor
2. Acceder a los sistemas y herramientas necesarias
3. Comercializar el producto
4. Mantener y evolucionar la plataforma

---

# PARTE I: QUÉ ES VOLKERN

## 1.1 Descripción del Producto

**Volkern** es un ERP + CRM + LMStodo-en-uno con inteligencia artificial integrada, diseñado para pequeñas y medianas empresas (PYMES) y agencias de marketing.

### Características diferenciadoras:

- **Todo en una plataforma:** CRM, Facturación, Nómina, Producción, Logística, Academy, Marketing, Contratos
- **IA integrada:** Gemma 4 como asistente conversacional y agente automático
- **Multi-tenant:** Una instalación sirve a múltiples empresas (clientes) aisladas criptográficamente
- **Inmutabilidad fiscal:** Sistema de sellado blockchain-style para facturas, nóminas, contratos e inventarios (Trust Protocol)
- **White Label:** Los clientes pueden marcarlo con su propia marca

### Modelo de negocio:

- **SaaS (Software como Servicio):** Suscripción mensual/anual por cliente
- **Planes:** TRIAL (gratis) → BASIC → PRO → ENTERPRISE
- **Pricing típico:** De 49€/mes (Basic) hasta 499€/mes (Enterprise)

### Nicho principal:

- Agencias de marketing digital
- Empresas de servicios profesionales
- PYMES industriales (manufactura)

---

## 1.2 Arquitectura Técnica Simplificada

```
┌─────────────────────────────────────────────────────────────────┐
│                        VOLKERN PLATFORM                         │
├─────────────────────────────────────────────────────────────────┤
│  Frontend: Next.js (React) - Interfaz de usuario               │
│  Backend: API Routes (Next.js) + Node.js                        │
│  Base de datos: PostgreSQL + Prisma (ORM)                      │
│  Autenticación: NextAuth.js + JWT                               │
│  IA: Gemma 4 (servidor MCP)                                    │
│  Almacenamiento: Cloudflare R2 + Uploadthing                   │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CADA CLIENTE (TENANT)                      │
├─────────────────────────────────────────────────────────────────┤
│  - Base de datos aislada (tenantId)                            │
│  - Bóveda criptográfica propia (MasterKey)                     │
│  - Usuarios y roles propios                                     │
│  - Datos: Leads, Contacts, Invoices, Payroll, etc.            │
└─────────────────────────────────────────────────────────────────┘
```

### Dónde está desplegado:

- **Producción:** Vercel (frontend + API)
- **Base de datos:** Neon (PostgreSQL) o Railway
- **Archivos:** Cloudflare R2
- **IA:** Servidor propio o cloud (configurable)

---

# PARTE II: ACCESOS Y CREDENCIALES

> ⚠️ **IMPORTANTE:** Esta sección contiene información sensible. Guardar en lugar seguro.

## 2.1 Cuentas de Dominio y Hosting

| Servicio | Usuario/Email | Contraseña | Notas |
|----------|---------------|------------|-------|
| **Vercel** | [TU EMAIL] | [EN PASSWORD MANAGER] | Despliegue del frontend/API |
| **Neon (DB)** | [TU EMAIL] | [EN PASSWORD MANAGER] | Base de datos PostgreSQL |
| **Cloudflare** | [TU EMAIL] | [EN PASSWORD MANAGER] | DNS y R2 storage |
| **Domain (Namesilo/GoDaddy)** | [TU EMAIL] | [EN PASSWORD MANAGER] | Dominios volkern.io |

## 2.2 Cuentas de Desarrollo

| Servicio | Usuario/Email | Contraseña | Notas |
|----------|---------------|------------|-------|
| **GitHub** | [TU EMAIL] | [EN PASSWORD MANAGER] | Repositorio del código |
| **npm/npmjs** | [TU EMAIL] | [EN PASSWORD MANAGER] | Paquetes publicados |
| **OpenAI API** | [API KEY] | N/A | Clave para GPT (si aplica) |

## 2.3 Cuentas de Comunicación

| Servicio | Usuario/Email | Contraseña | Notas |
|----------|---------------|------------|-------|
| **Email (Gmail/Google Workspace)** | [TU EMAIL] | [EN PASSWORD MANAGER] | Email principal |
| **WhatsApp Business API** | [NÚMERO] | [EN PASSWORD MANAGER] | Envío de mensajes a clientes |
| **Telegram Bot** | [TOKEN BOT] | N/A | Notificaciones internas |
| **SendGrid/Mailgun** | [API KEY] | N/A | Emails transaccionales |

## 2.4 Cuentas de Pago y Facturación

| Servicio | Usuario/Email | Contraseña | Notas |
|----------|---------------|------------|-------|
| **Stripe** | [TU EMAIL] | [EN PASSWORD MANAGER] | Procesamiento de pagos |
| **Veri*Factu** (España) | [CREDENCIALES] | [EN PASSWORD MANAGER] | Facturación fiscal España |

---

> 📝 **NOTA:** Las contraseñas específicas están en tu password manager (Bitwarden/1Password). Asegúrate de que el heredero tenga acceso a esta bóveda.

---

# PARTE III: DOCUMENTACIÓN

## 3.1 Documentación Técnica (Carpeta `documentacion_tecnica/`)

Ubicación: `/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/`

Contiene 19 documentos técnicos en formato MD y PDF:

| # | Documento | Descripción |
|---|-----------|-------------|
| 00 | Core e Infraestructura | Base multi-tenant, autenticación, vault |
| 01 | Sales Hub | CRM, Pipeline, Leads, Deals |
| 02 | Academy Hub | LMS, Cursos, Students |
| 03 | Member Portal | Portal de clientes autoservicio |
| 04 | Production Hub | MRP, Órdenes de fabricación |
| 05 | Logistics Hub | Inventario, Stock, Warehouse |
| 06 | HR Payroll Hub | Nómina, Empleados, Roles |
| 07 | Contracts Hub | Contratos, Firmas digitales |
| 08 | Security Audit Hub | Auditoría, Trust Protocol |
| 09 | Finance Hub | Facturación, Contabilidad |
| 10 | Projects Hub | Gestión de proyectos |
| 11 | Catalog Hub | Catálogo de productos |
| 12 | Communications | Mensajería, WhatsApp |
| 13 | Marketing CRM | Campañas, Email marketing |
| 14 | HR Core | RRHH, Empleados |
| 15 | Quality Hub | Control de calidad, QC |
| 16 | Integrations | APIs externas |
| 17 | Config Profile | Configuración de cuenta |
| 18 | MCP Server | Servidor de IA |
| 19 | Gemma4 Mobile | App móvil |

## 3.2 Documentación Comercial (Carpeta `documentacion_comercial/`)

Ubicación: `/home/dexpert/Volkern/nextjs_space/documentacion_comercial/`

- **Whitepaper comercial:** Presentación ejecutiva para prospectos
- **Fichas por módulo:** Descripción comercial de cada módulo
- **Propuestas:** Propuestas comerciales modelo

## 3.3 Manuales Operativos (Carpeta `manuales_operativos/`)

Ubicación: `/home/dexpert/Volkern/nextjs_space/manuales_operativos/`

21 manuales para usuarios finales (cómo usar cada módulo).

---

# PARTE IV: CÓMO COMERCIALIZAR VOLKERN

## 4.1 Proceso de Venta (Inbound)

### Paso 1: Descubrimiento
- El prospecto descubre Volkern (web, referral, publicidad)
- Visita volkern.io o demo.volkern.io
- Solicita demo o prueba gratuita

### Paso 2: Demo y Calificación
- Mostrar dashboard y módulos clave
- Identificar dolor: ¿tienen problemas con múltiples herramientas?
- Calificar: tamaño empresa, presupuesto, timeline

### Paso 3: Propuesta y Negociación
- Generar propuesta personalizada (usar plantilla en `documentacion_comercial/`)
- Negociar precio y términos
- Cerrar trato

### Paso 4: Onboarding
- Crear tenant en Volkern
- Configurar marca blanca si aplica
- Importar datos iniciales
- Entrenar usuario administrador

### Paso 5: Upsell
- Monitorear uso
- Proponer planes superiores
- Vender módulos adicionales

## 4.2 Materiales de Venta

| Material | Ubicación | Uso |
|----------|-----------|-----|
| **Demo environment** | demo.volkern.io | Demostraciones en vivo |
| **Presentaciones** | `documentacion_comercial/Volkern_Whitepaper_Comercial.pdf` | Envío a prospectos |
| **Fichas por módulo** | `documentacion_comercial/modulos/` | Detalle de funcionalidades |
| **Videos tutoriales** | [Crear/actualizar] | Envío post-demo |
| **Casos de éxito** | [En construcción] | Social proof |

## 4.3 Precios de Referencia (2026)

| Plan | Precio mensual | Ideal para |
|------|---------------|------------|
| **TRIAL** | 0€ | Prueba de 14 días |
| **BASIC** | 49€/mes | PYMES básicas |
| **PRO** | 149€/mes | PYMES con procesos |
| **ENTERPRISE** | 499€+ | Grandes empresas |

**Descuentos:** 20% anual (pago por año)

---

# PARTE V: OPERACIÓN DIARIA

## 5.1 Tareas del Día

- **Soporte a clientes:** Responder tickets en la plataforma
- **Monitoreo:** Verificar que Vercel y Neon estén funcionando
- **Ventas:** Follow-up de prospectos, demos

## 5.2 Tareas Semanales

- **Reporte de métricas:** Usuarios nuevos, MRR, churn
- **Actualización de documentación:** Si hay cambios
- **Backups:** Verificar que DB esté respaldada

## 5.3 Tareas Mensuales

- **Cierre de nómina:** Si hay clientes en España (Veri*Factu)
- **Facturación:** Emitir facturas a clientes
- **Review de seguridad:** Verificar logs de auditoría

## 5.4 Alertas y Monitorización

| Qué monitorear | Cómo |
|----------------|------|
| **Disponibilidad web** | UptimeRobot o Vercel Analytics |
| **Errores en producción** | Vercel Error Monitoring |
| **Uso de DB** | Dashboard de Neon |
| **Pagos fallidos** | Dashboard de Stripe |
| **Seguridad** | Trust Protocol logs |

---

# PARTE VI: EQUIPO Y CONTACTOS

## 6.1 Personas Clave

| Rol | Nombre | Contacto | Función |
|-----|--------|----------|---------|
| **Desarrollador Principal** | [TU NOMBRE] | [TU EMAIL] | Código y arquitectura |
| **Abogado/Corporativo** | [NOMBRE] | [EMAIL] | Tema legal y contratos |
| **Contador** | [NOMBRE] | [EMAIL] | Facturación y fiscalidad |
| **Soporte técnico** | [NOMBRE/OUTSOURCE] | [EMAIL] | Mantenimiento |

## 6.2 Recursos Externos

- **Dominios:** Namesilo o GoDaddy
- **Hosting:** Vercel (soporte@vercel.com)
- **Database:** Neon (soporte técnica)
- **Pagos:** Stripe (soporte merchants)

---

# PARTE VII: ESCALAMIENTO Y TROUBLESHOOTING

## 7.1 Si la Aplicación No Funciona

### Error: "Página en blanco" o error 500
1. Verificar en Vercel Dashboard → deployments
2. Revisar logs de error en Vercel
3. Si es error de código, revisar última implementación

### Error: "Database connection failed"
1. Verificar que Neon esté activo
2. Revisar variables de entorno en Vercel
3. Verificar que la IP de Vercel esté whitelist en Neon

### Error: "Facturas no se emitieron"
1. Verificar estado de Trust Protocol
2. Revisar logs de auditoría
3. Si hay problema de hash, contactar soporte

## 7.2 Si un Cliente Reporta Problema

1. **Reproducir el problema** en entorno demo
2. **Identificar el módulo** afectado
3. **Revisar documentación** técnica correspondiente
4. **Si es bug:** Registrar en GitHub Issues
5. **Si es configuración:** Guiar al cliente

## 7.3 Si un Cliente Quiere Cancelar

1. **Entender el motivo:** Encuesta de salida
2. **Intentar retener:** Ofrecer descuento o solución
3. **Si cancelar:** Exportar sus datos (GDPR)
4. **Documentar:** Registrar en CRM como "Churn"

---

# PARTE VIII: TRANSFERENCIA DEL NEGOCIO

## 8.1 Si Necesitas Transferir a Otra Persona

### Paso 1: Documento Legal
- Contrato de transferencia de negocio
- Cesión de derechos de propiedad intelectual
- Asesoramiento legal obligatorio

### Paso 2: Transferencia Técnica
1. Cambiar email de cuenta Vercel
2. Transferir propiedad del dominio
3. Migrar base de datos si aplica
4. Actualizar cuentas de payment (Stripe)

### Paso 3: Transferencia de Conocimiento
- Sesión de handover (documentada en video)
- Acceso a documentación
- Acceso a password manager
- Contacto con clientes clave (introducción)

### Paso 4: Comunicación
- Anunciar a clientes el cambio de responsable
- Garantizar continuidad de servicio
- Presentar al nuevo responsable

---

# PARTE IX: ESCENARIOS ESPECIALES

## 9.1 Si Pierdes Acceso a las Cuentas

### Recuperar cuenta Vercel
1. Ir a vercel.com/login
2. "Forgot password"
3. Verificar email y cambiar contraseña

### Recuperar dominio
1. Contactar soporte del registrador
2. Verificar propiedad (email, terakhir pago)

### Recuperar base de datos
1. Neon tiene recuperación desde dashboard
2. Asegurarse de tener backups recientes

## 9.2 Si el Servidor de IADeja de Funcionar

- El chatbot de Volkern usa Gemma 4 o modelo configurable
- Si falla, los clientes ven mensaje de "IA temporalmente no disponible"
- Verificar conexión al servidor MCP
- Como fallback, desactivar features de IA temporalmente

## 9.3 Si Hay Problema Legal (Demanda, Regulatorio)

1. **No panicar**
2. **Contactar abogado** inmediatamente
3. **No eliminar** ningún dato
4. **Preservar** todos los logs y evidencias
5. **Alertar** a clientes si afecta sus datos

---

# PARTE X: CHECKLIST DE EMERGENCIA

Imprime esta lista y tenla visible:

- [ ] Acceso a password manager verificado
- [ ] Contactos de emergencia actualizados
- [ ] Documentación accesible desde cualquier lugar
- [ ] Backups de base de datos automatizados
- [ ] Método de pago de servicios (Vercel/Neon) activo
- [ ] Dominio y SSL vigentes
- [ ] Emails de soporte configurados
- [ ] Acceso a Stripe/Venta funcionando

---

# ANEXO: GLOSARIO

| Término | Significado |
|---------|-------------|
| **Tenant** | Instancia de un cliente (aislada de otros) |
| **MRR** | Ingreso Recurrente Mensual |
| **Churn** | Clientes que cancelan |
| **SaaS** | Software como Servicio (suscripción) |
| **White Label** | Versión con marca del cliente |
| **Trust Protocol** | Sistema de auditoría inmutable |
| **MCP** | Model Context Protocol (para IA) |
| **Veri*Factu** | Sistema de facturación fiscal (España) |

---

## NOTAS FINALES

Este documento debe actualizarse cada vez que haya cambios significativos en la infraestructura o procesos. Revisa y actualiza al menos una vez al año.

**Si tienes dudas sobre cualquier sección de este documento, consulta primero la documentación técnica o contacta al equipo de desarrollo.**

---

*Documento generado el 17 de mayo de 2026*  
*Versión 1.0*