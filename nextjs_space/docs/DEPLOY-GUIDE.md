# Guía de Deploy — Volkern ERP

Guía completa para desplegar Volkern en producción, incluyendo VPS (DigitalOcean, Hetzner, etc.) y plataformas cloud (Vercel, Railway).

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

## 🚀 Deploy en Vercel (Alternativa)

### 1. Conectar Repositorio

1. Ir a [vercel.com/new](https://vercel.com/new)
2. Importar repositorio de GitHub/GitLab/Bitbucket
3. Configurar Framework Preset: **Next.js**

### 2. Variables de Entorno

Configurar todas las variables de entorno en el dashboard de Vercel.

### 3. Deploy Manual

> 🔴 **DEPRECADO (12-oct-2026): no despliegues a Vercel.** Producción es el
> VPS: `bash deploy-vps/deploy-local.sh` (ver README §Deploy). El proyecto
> de Vercel sigue enlazado pero ya no sirve `volkern.app`, y sus variables
> de producción apuntan a la base antigua (Neon). Lo de abajo es referencia
> histórica.
>
> ⚠️ **No hay auto-deploy desde GitHub** (política histórica). Cada release
> requería ejecutar manualmente `vercel deploy --prod --yes` después del
> `git push`.
>
> Ver [`DEPLOY.md`](DEPLOY.md) para el flujo completo paso a paso,
> troubleshooting detallado (branch mismatch, cache invalidation, anti-SSRF),
> y los comandos de diagnóstico (`vercel ls`, `vercel inspect`, etc.).

### 4. Limitaciones

- **WebSockets:** No hay soporte nativo para serverless WebSocket (HMR no funciona en producción)
- **Redis:** No accesible desde serverless functions — requiere [Upstash Redis](https://upstash.com)
- **Cron Jobs:** Usar [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) en lugar de node-cron
- **Tamaño de Build:** Monitorear con `yarn build` localmente — Vercel tiene límite de 250MB

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

# Docker (si aplica)
docker logs -f volkern_app
```

### Healthcheck

Verifica que el servidor esté respondiendo:

```bash
curl https://tudominio.com/
# Debería devolver 200 OK
```

> ⚠️ No hay un endpoint `/api/health` dedicado. Se recomienda monitorear
> el código de estado HTTP 200 de la página principal.

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

| Problema | Causa | Solución |
|----------|-------|----------|
| Build falla por memoria | Límite de heap | `NODE_OPTIONS='--max-old-space-size=6144' yarn build` |
| Prisma conexión rechazada | DB no accesible | Verificar `DATABASE_URL` y firewall |
| Emails no se envían | Resend API key | Confirmar API key y dominio verificado |
| WebSocket no funciona | Proxy mal configurado | Verificar headers `Upgrade/Connection` en Nginx |
| Build > 5 minutos | Demasiado código | Revisar [plan de modularización](MODULARIZATION_PLAN.md) |

---

## 📚 Referencias

- [Módulo Inmobiliario](REAL-ESTATE-MODULE.md)
- [Módulos del Sistema](VOLKERN-SYSTEM-MODULES.md)
- [Plan de Modularización](MODULARIZATION_PLAN.md)
- [Infraestructura VPS (PDF)](volkern-plan-infraestructura-vps.pdf)
