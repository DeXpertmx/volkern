-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️⚠️⚠️ OBSOLETO tras el swap de slugs del 2026-09-03 — NO RE-EJECUTAR CONTRA LA BD DEL VPS
--
-- Este script montó el estado ANTES del intercambio de slugs en producción:
--   · "Dimension eXpert"  → slug dexpert (dexpert.volkern.app)
--   · "DeXpert Inmobiliaria" → slug dimension-expert (dimension-expert.volkern.app)
-- Re-ejecutarlo hoy re-asignaría el subdominio dimension-expert al tenant de Bruno y
-- borraría su logo_corporativo real (además de reintentar la migración ya hecha).
-- Ya está APLICADO y SUPERADO por scripts/production-swap-expert-slugs.sql.
-- ═══════════════════════════════════════════════════════════════════════
-- Producción (HISTÓRICO, aplicado el 2026-09-03) — Montaje del workspace "Dimension eXpert" (idempotente)
--
-- Replicó en la BD del VPS (volkern.app) lo que se hizo en local:
--   1. Migra bruno.hess@dimensionexpert.com y admin@dexpert.volkern.app
--      al tenant dimension-expert (cms96c27k0002ju04e47e4xht), rol Admin.
--   2. Renombra el usuario "DeXpert Admin" → "Admin Dimension eXpert".
--   3. Elimina el logo viejo de DeXpert del tenant dimension-expert.
--   4. Asigna el subdominio marca "dimension-expert".
--   5. Crea la cuenta del cliente en DeXpert Inmobiliaria:
--      direccion@dexpert.volkern.app / Dexpert123! (rol Admin de ese tenant).
--   6. Enlaza el logo real de Dimension eXpert (ya subido al bucket público).
--
-- Ejecutar EN el VPS, DENTRO de una transacción (rollback automático si falla):
--   docker exec -i <PG> psql -U volkern_erp -d volkern_erp -v ON_ERROR_STOP=1 < scripts/production-dimension-expert-setup.sql
--
-- ANTES: backup de User/Tenant/Role/Configuracion:
--   docker exec <PG> pg_dump -U volkern_erp -d volkern_erp --no-owner --no-privileges \
--     --table="\"User\"" --table="\"Tenant\"" --table="\"Role\"" --table="\"Configuracion\"" > /root/backups/pre-dim-expert-$(date +%Y%m%d-%H%M%S).sql
--
-- Re-ejecutar es seguro: cada paso detecta si ya se aplicó.
-- ═══════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

-- ── 1) Migración de cuentas → dimension-expert ────────────────────────
DO $$
DECLARE
  v_dex      "Tenant".id%TYPE := 'cms92n0ii0001mf83yr9grk30'; -- DeXpert Inmobiliaria
  v_dim      "Tenant".id%TYPE := 'cms96c27k0002ju04e47e4xht'; -- Dimension eXpert
  v_dim_role "Role".id%TYPE   := 'cms96c2d80004ju04hd8mh0hz'; -- rol Admin (dimension-expert)
  v_bruno    text := 'bruno.hess@dimensionexpert.com';
  v_admin    text := 'admin@dexpert.volkern.app';
  n_dex int; n_dim int;
BEGIN
  SELECT count(*) INTO n_dex FROM "User"
    WHERE email IN (v_bruno, v_admin) AND "tenantId" = v_dex;
  SELECT count(*) INTO n_dim FROM "User"
    WHERE email IN (v_bruno, v_admin) AND "tenantId" = v_dim;

  IF n_dex = 2 THEN
    UPDATE "User" SET "tenantId" = v_dim, "roleId" = v_dim_role, "updatedAt" = now()
      WHERE email IN (v_bruno, v_admin) AND "tenantId" = v_dex;
    RAISE NOTICE '[1] Migradas % cuentas a dimension-expert.', n_dex;
  ELSIF n_dim = 2 THEN
    RAISE NOTICE '[1] Ya migradas (ambas cuentas en dimension-expert).';
  ELSE
    RAISE EXCEPTION 'Estado inesperado: % cuentas en dexpert, % en dimension-expert. Abortando.', n_dex, n_dim;
  END IF;
END $$;

-- ── 2) Rename del usuario (solo si sigue siendo el nombre viejo) ───────
UPDATE "User" SET name = 'Admin Dimension eXpert', "updatedAt" = now()
 WHERE email = 'admin@dexpert.volkern.app' AND name IS DISTINCT FROM 'Admin Dimension eXpert';

-- ── 3) Quitar el logo viejo de DeXpert del workspace dimension-expert ──
DELETE FROM "Configuracion"
 WHERE "tenantId" = 'cms96c27k0002ju04e47e4xht' AND clave = 'logo_corporativo';

-- ── 4) Subdominio marca para dimension-expert ──────────────────────────
UPDATE "Tenant" SET subdomain = 'dimension-expert', "fechaActualizacion" = now()
 WHERE id = 'cms96c27k0002ju04e47e4xht' AND COALESCE(subdomain, '') <> 'dimension-expert';

-- ── 5) Cuenta Admin del cliente en DeXpert Inmobiliaria ────────────────
INSERT INTO "User" (id, email, "updatedAt", name, password, estado, "tenantId", "roleId", "emailVerified")
SELECT gen_random_uuid()::text, 'direccion@dexpert.volkern.app', now(), 'DeXpert Admin',
       '$2a$10$eYzWCShJtSgSlL2fWGoyy.5jklSc/GcswQ4DHPUD7Xd0ctL/a4KPO', -- bcrypt('Dexpert123!')
       'activo', 'cms92n0ii0001mf83yr9grk30', 'cms92n1m50005mf83uctrp5ol', now()
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'direccion@dexpert.volkern.app');

-- ── 6) Logo real de Dimension eXpert (URL ya pública en el bucket) ─────
INSERT INTO "Configuracion" (id, clave, valor, "fechaActualizacion", "tenantId")
SELECT gen_random_uuid()::text, 'logo_corporativo',
       'https://s3.volkern.app/prod/public/configuracion/logo-1788463865076-dimension-expert-logo.png',
       now(), 'cms96c27k0002ju04e47e4xht'
ON CONFLICT ("tenantId", "clave") DO UPDATE
  SET valor = EXCLUDED.valor, "fechaActualizacion" = now();

COMMIT;