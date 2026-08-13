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

# Copiar Prisma schema (necesario para migrate en runtime)
COPY --from=builder /app/prisma ./prisma
# Copiar Prisma Client generado (Next.js standalone trace a veces no lo incluye)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Entrypoint para migraciones + start
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
