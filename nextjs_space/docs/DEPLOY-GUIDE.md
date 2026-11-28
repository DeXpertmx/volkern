# Guía de Deploy — Volkern ERP

Guía para desplegar Volkern en producción: VPS con Docker Swarm.

---

## 📋 Prerrequisitos

- **Node.js** 18+ (recomendado 20 LTS)
- **PostgreSQL** 15+
- **Redis** 7+ (para colas BullMQ)
- **Docker** + Docker Compose (para Apprise y servicios auxiliares)
- **Yarn** (gestor de paquetes)
- **Dominio** con DNS configurado
- **Certificados SSL** (Let's Encrypt via Certbot)

---

## 📦 Variables de Entorno

Copia el archivo de ejemplo (no incluido en el repositorio) y configúralo:

```bash
cp .env.example .env.local  # Desarrollo
cp .env.example .env.production  # Producción
```

### Variables Requeridas

```env
# ─── Database ───────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host:5432/volkern_prod?schema=public"

# ─── Auth ───────────────────────────────────────────────────
NEXTAUTH_SECRET="<generar-con: openssl rand -base64 32>"
NEXTAUTH_URL="https://tudominio.com"

# ─── API Keys ───────────────────────────────────────────────
AGENCY_API_KEY="<api-key-para-agencia>"
INTERNAL_API_KEY="<api-key-interna>"

# ─── Stripe ─────────────────────────────────────────────────
STRIPE_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# ─── Redis (BullMQ) ─────────────────────────────────────────
REDIS_URL="redis://user:password@host:6379"

# ─── Email (Resend) ─────────────────────────────────────────
RESEND_API_KEY="re_..."
ADMIN_EMAIL="admin@tudominio.com"

# ─── AI / OpenAI ────────────────────────────────────────────
OPENAI_API_KEY="sk-..."

# ─── AWS (S3 para archivos) ────────────────────────────────
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="eu-west-1"
S3_BUCKET_NAME="volkern-uploads"
```

---

## 🐳 Deploy con Docker (VPS)

### 1. Clonar y Configurar

```bash
git clone <repository-url>
cd nextjs_space
cp .env.example .env.production
# Editar .env.production con valores de producción
```

### 2. Build de Producción

```bash
yarn install
yarn prisma generate
yarn build
```

El build produce un output en `.next/` y la aplicación se sirve con:

```bash
yarn start  # Next.js production server
```

> ℹ️ `next.config.js` **no tiene** `output: 'standalone'` configurado. Para VPS,
> se recomienda agregar `output: 'standalone'` en `next.config.js` y
> usar el servidor standalone para mejor rendimiento.

### 3. Base de Datos

```bash
# Migraciones
yarn prisma db push  # Para desarrollo / cambios de esquema
# O usar migraciones formales:
yarn prisma migrate deploy

# Seed
yarn prisma db seed
```

### 4. Configurar Nginx como Reverse Proxy

```nginx
# /etc/nginx/sites-available/volkern
server {
    listen 80;
    server_name tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /_next/webpack-hmr {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 5. SSL con Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com
```

### 6. Systemd Service

```ini
# /etc/systemd/system/volkern.service
[Unit]
Description=Volkern ERP Next.js
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=dexpert
WorkingDirectory=/home/dexpert/Volkern/nextjs_space
ExecStart=/usr/bin/yarn start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable volkern
sudo systemctl start volkern
sudo systemctl status volkern
```

---

## 🔄 Migraciones de Base de Datos

### Estrategia

```bash
# Desarrollo — cambios rápidos
yarn prisma db push

# Producción — migraciones versionadas
yarn prisma migrate dev --name descripcion_del_cambio
yarn prisma migrate deploy
```

### Rollback

```bash
# Revertir última migración
npx prisma migrate reset  # ⚠️ Destructivo — borra datos

# Rollback manual vía SQL
# Restaurar desde backup
```

---

## 💾 Backup y Restauración

### Script Automatizado

El proyecto incluye scripts de backup/restore:

```bash
# Backup completo (DB + volúmenes a S3)
bash scripts/backup_volkern.sh

# Restaurar desde backup
bash scripts/restore_volkern.sh <backup_file.tar.gz>
```

### Estrategia 3-2-1

El script `backup_volkern.sh` implementa:
- **3** copias de datos
- **2** medios diferentes (local + S3)
- **1** copia offsite

### Backup Manual

```bash
# PostgreSQL dump
pg_dump -U postgres volkern_prod > backup_$(date +%Y%m%d).sql

# Alternativa via Docker
docker exec volkern_postgres pg_dump -U postgres volkern_local > backup.sql

# Restore
cat backup.sql | docker exec -i volkern_postgres psql -U postgres volkern_local
```

---

## 🐳 Servicios Auxiliares (Docker Compose)

### Apprise (Notificaciones)

```bash
docker-compose -f docker-compose.apprise.yml up -d
```

Este servicio maneja notificaciones vía Telegram, Slack, etc.

---

## 📊 Monitoreo y Logs

### Logs de la Aplicación

```bash
# Systemd journal
sudo journalctl -u volkern -f

# Docker Swarm
docker service logs -f volkern-erp_app
```

### Healthcheck

Verifica que el servidor esté respondiendo:

```bash
curl -fsS https://volkern.app/api/health   # 200 si el proceso responde
curl -fsS https://volkern.app/            # 200 si además sirve la página
```

> ℹ️ Sí existe `/api/health` y es el check que usa el smoke del despliegue. Que
> `/` devuelva 200 no basta: un contenedor anclado a la imagen vieja también
> responde 200 (por eso `deploy-app.sh` compara el image ID del contenedor).

### Métricas Clave a Monitorear

- **Uso de RAM:** Next.js standalone ~200-500MB
- **Conexiones a DB:** Configurar `pool` en Prisma
- **Build Time:** Debe ser < 5 minutos
- **Tamaño de Build:** Actual ~183MB, objetivo < 100MB
- **Errores 5xx:** Alertar si > 1% en 5 minutos

---

## 🔧 Scripts de Utilidad

| Script | Descripción |
|--------|-------------|
| `scripts/backup_volkern.sh` | Backup 3-2-1 a S3 |
| `scripts/restore_volkern.sh` | Restaura desde backup |
| `scripts/provision-db.ts` | Aprovisiona DB para nuevo tenant |
| `scripts/seed.ts` | Pobla DB con datos de ejemplo |
| `scripts/seed-finance.ts` | Seed de datos financieros |

---

## 🔐 Seguridad

- **API Keys:** Almacenar en variables de entorno, nunca en el código
- **Base de Datos:** Usar conexiones SSL en producción
- **Headers de Seguridad:** Configurar CSP, HSTS, X-Frame-Options en Nginx
- **Rate Limiting:** Implementar en endpoints públicos
- **Auditoría:** Todos los cambios críticos se registran en audit-vault

---

## 🚨 Troubleshooting

### El servicio queda a 0 réplicas

La tarea no llega a arrancar. Diagnóstico, en orden:

```bash
docker service ps volkern-erp_app --no-trunc      # motivo del rechazo de la tarea
docker service logs --tail 200 volkern-erp_app    # qué dice al arrancar
docker service inspect volkern-erp_app --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
```

Causa habitual: el contenedor quedó anclado a la imagen anterior porque el
primer `service update --force` no llegó a arrancar la nueva. `deploy-app.sh` lo
detecta, reintenta y avisa en el paso `[4b/5]`; si persiste, fix manual con la
imagen que se quería desplegar:

```bash
docker service update --force --image volkern-erp:sha256-<digest> volkern-erp_app
docker service ps volkern-erp_app --no-trunc    # repetir hasta ver Running 1/1
```

Si no vuelve, el mismo comando con el digest de la imagen anterior, que el
pipeline conserva para rollback.

### El despliegue se para en la comprobación de recibos

Antes de la migración `20261127160000` (la que borra `whatsapp_send_receipts`)
hay que ejecutar, en el VPS:

```bash
bash /root/deploy-vps/verificar-recibos-whatsapp.sh
```

| Salida | Significado | Qué hacer |
|--------|-------------|-----------|
| `0` | Sin `en_curso` (o tabla ya borrada) | Se puede migrar |
| `1` | Hay `en_curso`, o un `incierto` cuya solicitud no guardó desenlace | **No se migra.** Los envíos quedan exportados en `/root/backups/whatsapp_send_receipts-*.csv` (permisos 600) antes de decidir |
| `2` | No se pudo consultar la tabla | Fail closed: se arregla el entorno, no se fuerza |

Un `en_curso` bloquea siempre: el proceso creó la clave antes de llamar al
proveedor y no dejó desenlace, así que el recibo es la única prueba de que el
mensaje pudo salir. Un `incierto` **con** su desenlace guardado en la solicitud
de aprobación sí se puede migrar: ese desenlace sobrevive al DROP. Resolver un
`en_curso` es decisión de negocio (confirmar entrega o marcar fallo), no del
script.

### Aborta el ensayo de rollback

`deploy-vps/ensayo-rollback.sh` falla casi siempre por el entorno, no por el backup:

| Síntoma | Causa | Solución |
|---------|-------|----------|
| «Restaurar copia base» falla a media restauración | `--pg-image` de una versión mayor distinta a la de producción | Usar `postgres:17-alpine`, la de producción: el dump lo genera el `pg_dump` 17 del contenedor |
| «Verificar migración» aborta y el esquema no cambió | La imagen `--migrator` es de un commit sin las migraciones nuevas | Construirla con el `prisma/` del commit que se va a desplegar |

### Fallos genéricos

| Problema | Causa | Solución |
|----------|-------|----------|
| Build falla por memoria | Límite de heap | `NODE_OPTIONS='--max-old-space-size=6144' yarn build` |
| Prisma: conexión rechazada | `DATABASE_URL` incorrecta o Postgres caído | Revisar `DATABASE_URL` y `pg_isready` ([plan de continuidad §7.1](PLAN_CONTINUIDAD_VOLKERN.md)) |
| Emails no se envían | Resend API key | Confirmar API key y dominio verificado |
| WebSocket no funciona | Proxy mal configurado | Verificar headers `Upgrade`/`Connection` en el proxy (Traefik en producción) |
| Build > 5 minutos | Demasiado código | Revisar [plan de modularización](MODULARIZATION_PLAN.md) |

---

## 📚 Referencias

- [Módulo Inmobiliario](REAL-ESTATE-MODULE.md)
- [Módulos del Sistema](VOLKERN-SYSTEM-MODULES.md)
- [Plan de Modularización](MODULARIZATION_PLAN.md)
- [Infraestructura VPS (PDF)](volkern-plan-infraestructura-vps.pdf)
