# ═══════════════════════════════════════════════════════════════
# Volkern ERP — Dockerfile (multi-stage)
# Build: docker build -t volkern-app .
# Run:   docker run -p 3000:3000 --env-file .env.production volkern-app
# ═══════════════════════════════════════════════════════════════

# ─── Stage 1: Dependencies ────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# Instalar herramientas necesarias para compilar dependencias nativas
RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de dependencias
COPY package.json package-lock.json ./
# Dependencia local file:./eslint-rules (plugin de ESLint del proyecto)
COPY eslint-rules ./eslint-rules

# Instalar TODAS las dependencias (incluyendo devDeps para el build)
# El lock contiene un peer-conflict conocido: zod-to-openapi@8.5.0 (peer zod@^4)
# vs zod@^3 del proyecto. Reproducimos el entorno local (que funciona):
#   - npm 9.2.0 (el de la máquina de desarrollo; npm 10 rechaza el lock por peer-conflict)
#   - --legacy-peer-deps (resolución zod@3 real)
#   - (npx patch-package || true) con paréntesis: si npm ci falla, la capa falla y no se cachea
RUN npm install -g npm@9.2.0 && \
    npm ci --ignore-scripts --legacy-peer-deps && \
    (npx patch-package || true) && \
    npm rebuild esbuild && \
    true


# ─── Stage 2: Builder ─────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Instalar herramientas de build
RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copiar node_modules completos (con devDeps)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copiar código fuente
COPY . .

# ─── NEXT_PUBLIC_* horneados en el build (client-side) ───
# Se pasan con --build-arg al construir la imagen (ej. deploy-vps).
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CANVA_CLIENT_ID
ARG NEXT_PUBLIC_CDN_URL
ARG NEXT_PUBLIC_CHATWOOT_URL
ARG NEXT_PUBLIC_GOOGLE_FONTS_APIKEY
ARG NEXT_PUBLIC_ONESIGNAL_APP_ID
ARG NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_CANVA_CLIENT_ID=$NEXT_PUBLIC_CANVA_CLIENT_ID \
    NEXT_PUBLIC_CDN_URL=$NEXT_PUBLIC_CDN_URL \
    NEXT_PUBLIC_CHATWOOT_URL=$NEXT_PUBLIC_CHATWOOT_URL \
    NEXT_PUBLIC_GOOGLE_FONTS_APIKEY=$NEXT_PUBLIC_GOOGLE_FONTS_APIKEY \
    NEXT_PUBLIC_ONESIGNAL_APP_ID=$NEXT_PUBLIC_ONESIGNAL_APP_ID \
    NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID=$NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# Generar Prisma Client + Build Next.js (standalone)
RUN npx prisma generate
RUN npm run build

# Limpiar devDependencies del node_modules del standalone
# (Next.js standalone ya trae solo lo necesario)


# ─── Stage 3: Runner ──────────────────────────────────────────
FROM node:20-slim AS runner

# Instalar Chrome para puppeteer-core (generación de PDFs)
# También instalar utilidades de red para healthcheck
RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
    chromium \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Variables de entorno para puppeteer-core
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# No ejecutar como root por seguridad
RUN groupadd --system --gid 1001 volkern && \
    useradd --system --uid 1001 --gid volkern volkern

WORKDIR /app

# Copiar output standalone de Next.js
COPY --from=builder /app/.next/standalone ./

# Copiar assets estáticos
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# CA intermedia de FNMT (AC Componentes Informáticos): los endpoints de
# SES.HOSPEDAJES (hospedajes.pre-ses.mir.es / hospedajes.ses.mir.es) no sirven
# el intermedio en el handshake TLS y Node no lo trae en su store raíz.
# NODE_EXTRA_CA_CERTS lo AÑADE al store de Node sin sustituirlo. Procedencia
# y renovación: docker/ca/README.md
COPY --from=builder /app/docker/ca/fnmt-ac-componentes-informaticos.pem /usr/local/share/volkern-ca/fnmt-ac-componentes-informaticos.pem
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/volkern-ca/fnmt-ac-componentes-informaticos.pem

# Copiar Prisma schema (necesario para migrate en runtime)
COPY --from=builder /app/prisma ./prisma
# Copiar Prisma Client generado (Next.js standalone trace a veces no lo incluye)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# ── Migraciones: se aplican con el job `volkern-erp:migrator` (ver
# deploy-vps/run-migrations.sh) ANTES del service update. El runner NO incluye
# el CLI de Prisma a propósito: añade ~100 MB y el deploy de migraciones debe
# ser un paso explícito del pipeline, no un efecto secundario del boot (npx
# descargaría la última versión 7.x, incompatible con el datasource `url`).
# El runner conserva @prisma/client (para las data migrations del entrypoint).

# Entrypoint para data migrations + start
COPY --from=builder /app/scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Puerto
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get({hostname:'localhost',port:3000,path:'/',timeout:5000},(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

USER volkern

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]


# ─── Stage 4: Migrator (job de migraciones) ──────────────────
# Imagen mínima con el CLI de Prisma 6.7.0 del proyecto + schema, para
# ejecutar `migrate deploy` como job one-shot antes de cada deploy
# (deploy-vps/run-migrations.sh). Mantiene el mismo binario/engines que el
# build (sin descargar la última versión del registry).
FROM node:20-slim AS migrator
WORKDIR /app

# OpenSSL para que Prisma detecte libssl y los engines funcionen
# (node:20-slim no lo trae instalado por defecto)
RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# CLI de Prisma + dependencias (engines con schema-engine/libquery)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/config ./node_modules/@prisma/config
COPY --from=builder /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/node_modules/@prisma/engines-version ./node_modules/@prisma/engines-version
COPY --from=builder /app/node_modules/@prisma/fetch-engine ./node_modules/@prisma/fetch-engine
COPY --from=builder /app/node_modules/@prisma/get-platform ./node_modules/@prisma/get-platform
COPY --from=builder /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder /app/node_modules/esbuild-register ./node_modules/esbuild-register
# Binario del CLI: wrapper explícito
RUN mkdir -p /app/node_modules/.bin && \
    printf '#!/bin/sh\nexec node /app/node_modules/prisma/build/index.js "$@"\n' > /app/node_modules/.bin/prisma && \
    chmod +x /app/node_modules/.bin/prisma

# Schema + migraciones
COPY --from=builder /app/prisma ./prisma

# Job por defecto: aplicar migraciones y salir
ENTRYPOINT ["/app/node_modules/.bin/prisma"]
CMD ["migrate", "deploy"]
