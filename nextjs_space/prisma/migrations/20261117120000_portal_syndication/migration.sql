-- ═══════════════════════════════════════════════════════════════════════════
-- Sindicación multiportal (Kyero / Idealista / Fotocasa / genérico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tres tablas:
--   portal_connections   credenciales cifradas y configuración por tenant+portal
--   portal_publications  estado e idempotencia (hash) por inmueble+portal
--   portal_sync_logs     auditoría de cada ejecución del orquestador
--
-- `portal_connections.credentials_enc` guarda el JSON de credenciales cifrado
-- con PORTAL_ENCRYPTION_KEY (AES-256-GCM). Nunca se guarda en claro ni se
-- devuelve por la API: la API expone `has_credentials`.

CREATE TABLE "portal_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials_enc" TEXT,
    "feed_token" TEXT,
    "feed_token_revoked_at" TIMESTAMP(3),
    "sync_frequency_minutes" INTEGER NOT NULL DEFAULT 360,
    "last_sync_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portal_publications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "portalKey" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "last_payload_hash" TEXT,
    "last_delivered_at" TIMESTAMP(3),
    "last_error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portal_sync_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalKey" TEXT NOT NULL,
    "connectionId" TEXT,
    "triggered_by" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "propertiesTotal" INTEGER NOT NULL DEFAULT 0,
    "propertiesPublished" INTEGER NOT NULL DEFAULT 0,
    "propertiesUpdated" INTEGER NOT NULL DEFAULT 0,
    "propertiesUnchanged" INTEGER NOT NULL DEFAULT 0,
    "propertiesSkipped" INTEGER NOT NULL DEFAULT 0,
    "propertiesFailed" INTEGER NOT NULL DEFAULT 0,
    "propertiesRemoved" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "details" JSONB,

    CONSTRAINT "portal_sync_logs_pkey" PRIMARY KEY ("id")
);

-- Una conexión por portal y cuenta.
CREATE UNIQUE INDEX "portal_connections_tenant_id_portal_key_key"
    ON "portal_connections"("tenantId", "portalKey");

-- El token del feed público identifica una sola conexión.
CREATE UNIQUE INDEX "portal_connections_feed_token_key"
    ON "portal_connections"("feed_token");

CREATE INDEX "portal_connections_tenant_id_idx"
    ON "portal_connections"("tenantId");

-- Idempotencia: un registro de publicación por inmueble y portal.
CREATE UNIQUE INDEX "portal_publications_tenant_id_property_id_portal_key_key"
    ON "portal_publications"("tenantId", "propertyId", "portalKey");

CREATE INDEX "portal_publications_tenant_id_portal_key_status_idx"
    ON "portal_publications"("tenantId", "portalKey", "status");

CREATE INDEX "portal_sync_logs_tenant_id_portal_key_startedAt_idx"
    ON "portal_sync_logs"("tenantId", "portalKey", "startedAt");
