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

- **Producción:** VPS con Docker Swarm (`deploy-vps/deploy-local.sh`)
- **Base de datos:** PostgreSQL 17 en el VPS (servicio Swarm `volkern-erp_postgres`)
- **Orquestación:** Docker Swarm; red overlay del stack: `DXnet`
- **Archivos:** Cloudflare R2
- **IA:** Servidor propio o cloud (configurable)

---

# PARTE II: ACCESOS Y CREDENCIALES

> ⚠️ **IMPORTANTE:** Esta sección contiene información sensible. Guardar en lugar seguro.

## 2.1 Cuentas de Dominio y Hosting

| Servicio | Usuario/Email | Contraseña | Notas |
|----------|---------------|------------|-------|
| **VPS** | [TU EMAIL] | [EN PASSWORD MANAGER] | Docker Swarm: sirve `volkern.app` (proveedor por confirmar) |
| **Neon (DB antigua)** | [TU EMAIL] | [EN PASSWORD MANAGER] | Sin uso en producción (hoy: Postgres del VPS). Sigue asociada al proyecto de Vercel enlazado — ver §10.1 |
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
- **Monitoreo:** Verificar que el VPS y su PostgreSQL estén funcionando
- **Ventas:** Follow-up de prospectos, demos

## 5.2 Tareas Semanales

- **Reporte de métricas:** Usuarios nuevos, MRR, churn
- **Actualización de documentación:** Si hay cambios
- **Backups:** hoy son manuales (los generan las migraciones); comprobar que haya uno reciente en `/root/backups` — ver §10.1

## 5.3 Tareas Mensuales

- **Cierre de nómina:** Si hay clientes en España (Veri*Factu)
- **Facturación:** Emitir facturas a clientes
- **Review de seguridad:** Verificar logs de auditoría

## 5.4 Alertas y Monitorización

| Qué monitorear | Cómo |
|----------------|------|
| **Disponibilidad web** | ⚠️ Sin herramienta confirmada: la cuenta de UptimeRobot que cita este documento no está verificada (§10.1) |
| **Errores en producción** | `docker service logs --tail 100 volkern-erp_app` |
| **Uso de DB** | `docker exec $(docker ps -q -f name=volkern-erp_postgres) psql -U volkern_erp -d volkern_erp -c '\dt'` |
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
- **Hosting:** VPS (soporte del proveedor, por confirmar)
- **Database:** PostgreSQL en el VPS
- **Pagos:** Stripe (soporte merchants)

---

# PARTE VII: ESCALAMIENTO Y TROUBLESHOOTING

## 7.1 Si la Aplicación No Funciona

### Error: "Página en blanco" o error 500
1. Verificar el servicio: `docker service ps volkern-erp_app`
2. Revisar los logs: `docker service logs --tail 100 volkern-erp_app`
3. Ver qué commit corre en producción (la imagen lo lleva como etiqueta):
   `IMG=$(docker service ps volkern-erp_app --no-trunc --format '{{.Image}}' | head -1)`
   `docker image inspect "$IMG" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'`

### Error: "Database connection failed"
1. Comprobar el servicio de base de datos: `docker service ps volkern-erp_postgres` (debe estar `Running`, 1/1)
2. Comprobar que Postgres acepta conexiones dentro de su propio contenedor:
   `PG_CID=$(docker ps -q -f name=volkern-erp_postgres | head -1) && docker exec "$PG_CID" pg_isready -U volkern_erp`
3. Comprobar que la app y Postgres siguen en la misma red overlay del stack (`DXnet`): el ID de red debe coincidir en ambos.
   `docker service inspect volkern-erp_app --format '{{range .Spec.TaskTemplate.Networks}}{{.Target}}{{end}}'`
   `docker service inspect volkern-erp_postgres --format '{{range .Spec.TaskTemplate.Networks}}{{.Target}}{{end}}'`
   (la overlay no es alcanzable desde el host — así lo advierten los scripts de `deploy-vps/` —, así que desde fuera solo se comprueba la pertenencia, no el puerto)
4. Buscar errores de Prisma en los logs: `docker service logs --tail 200 volkern-erp_app | grep -i prisma`

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
1. Transferir el acceso al VPS (proveedor y clave SSH)
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

### Recuperar acceso al VPS

El acceso es `ssh -i ~/.ssh/id_buffy_volkern root@62.171.134.195` (los scripts aceptan `VOLKERN_SSH_KEY`).

1. Si no tienes la clave: entrar por la consola/VNC del panel del proveedor de hosting (⚠️ **proveedor sin confirmar**, §10.1).
2. Ya dentro, autorizar una clave pública nueva en `/root/.ssh/authorized_keys` y entrar con ella.
   ⚠️ **No existe copia de respaldo documentada de la clave privada**, y el VPS no guarda ninguna (solo `authorized_keys`): si se pierde la del equipo, la única vía es la consola del proveedor.
3. Verificar que el servicio siga sirviendo: `docker service ls | grep volkern-erp`

### Recuperar dominio
1. Contactar soporte del registrador
2. Verificar propiedad (email, terakhir pago)

### Recuperar base de datos
1. Dumps reales en `/root/backups` (54 ficheros a 28-nov-2026, en `.dump` y `.sql.gz`). Comprobar la integridad del elegido: `sha256sum`, y `gzip -t` si es `.sql.gz`.
2. Ensayar la restauración antes de tocar producción con `bash deploy-vps/ensayo-rollback.sh` (ver `--help`): levanta un Postgres desechable y comprueba que esquema y datos vuelven.
3. Restaurar en producción solo tras el ensayo. Sin dump utilizable, la única copia es el volumen `volkern_erp_postgres_data` del VPS.
   ⚠️ **No hay backups automáticos** (§10.1).

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
- [ ] Backups de base de datos automatizados — ⚠️ **no existen hoy** (§10.1)
- [ ] Método de pago de servicios (VPS, dominio) activo
- [ ] Dominio y SSL vigentes
- [ ] Emails de soporte configurados
- [ ] Acceso a Stripe/Venta funcionando

## 10.1 Datos que este documento NO puede afirmar (hay que averiguar)

Verificado el 28-nov-2026 contra el VPS. Estos puntos están **sin confirmar**: en una emergencia no deben darse por hechos.

1. **Proveedor del VPS** (panel, soporte, facturación). No consta ni en el repositorio ni en los scripts: solo conocen `root@62.171.134.195`.
2. **Copia de respaldo de la clave SSH privada** (`~/.ssh/id_buffy_volkern`). Vive solo en el equipo del fundador; el VPS únicamente tiene `authorized_keys`. Falta decidir dónde se guarda una copia y anotarlo aquí.
3. **Backups automáticos de la base de datos: no existen.** No hay entrada en el crontab de root ni timer de systemd; los dumps de `/root/backups` los generan a mano las migraciones (`run-migrations.sh`, `baseline-prod.sh`). Falta decidir frecuencia y copia fuera del VPS.
4. **Monitorización externa**: no hay cuenta ni checks documentados. El crontab de root solo tiene 4 tareas de la app (`uptime-developers`, `cleanup-attendance`, `hospitality-reconcile`, `hospitality-briefing`). Si se contrata UptimeRobot, anotar aquí la cuenta.
5. **Restaurabilidad de los dumps antiguos**: los 54 ficheros no se han probado uno a uno; solo el del 28-nov-2026 pasó el ensayo.
6. **Cuenta de Neon**: sigue asociada al proyecto de Vercel enlazado. Confirmar si guarda datos que haya que conservar antes de cerrarla.
7. **Otros stacks del VPS**: además del ERP corren `volkern_app`, `volkern_db`, `volkern_landing`, `volkern_ws-service`, `volkern_volkern-dispatch`, `n8n_*`, `minio_minio`, `redis_redis`, `traefik_traefik`, `pgvector_pgvector`, `libretranslate`, `libresign_*` y `portainer_*`. Este plan no los cubre: falta averiguar cuáles son de negocio y cuáles heredados.

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