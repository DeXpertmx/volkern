-- ============================================================================
-- Intercambio de slugs/subdominios entre los tenants 'dexpert' y 'dimension-expert'
-- + alta de dximobilia@dimensionexpert.com (Admin, password provisional) en
--   el tenant DeXpert Inmobiliaria (que tras el swap queda con slug dimension-expert).
--
-- Resultado esperado:
--   * tenant "Dimension eXpert"  (bruno.hess@dimensionexpert.com + admin@dexpert.volkern.app)
--       -> slug/subdominio  dexpert            (dexpert.volkern.app)
--   * tenant "DeXpert Inmobiliaria" (datos reales del cliente)
--       -> slug/subdominio  dimension-expert   (dimension-expert.volkern.app)
--
-- Idempotente: re-ejecutar es un no-op. Ejecutar con psql dentro del contenedor
-- de la BD (cat script.sql | docker exec -i <ctr> psql -U "$POSTGRES_USER" -d "$POSTGRES_DB").
--
-- ⚠️ NUNCA commitear hashes de contraseñas reales. El hash bcrypt del password
-- provisional de dximobilia se pasa con la variable psql `password_hash`:
--
--   psql ... -v password_hash='<hash bcrypt>' -f production-swap-expert-slugs.sql
--
-- Generar el hash localmente (nunca pegar contraseñas en el repo):
--   npx tsx -e "const b=require('bcryptjs'); b.hash('<PASSWORD>',10).then(h=>console.log(h))"
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?password_hash}
\else
  \echo 'ERROR: define la variable psql password_hash (-v password_hash=...) antes de ejecutar.'
  \quit 1
\endif

BEGIN;

DO $$
DECLARE
  pre  text;
  post text;
BEGIN
  SELECT string_agg(slug || '|' || nombre, ',' ORDER BY slug) INTO pre
  FROM "Tenant" WHERE slug IN ('dexpert','dimension-expert');

  -- Estado final deseado (slug|nombre)
  post := 'dexpert|Dimension eXpert,dimension-expert|DeXpert Inmobiliaria';

  IF pre = post THEN
    RAISE NOTICE 'Slugs ya intercambiados; se omite el swap.';
  ELSIF pre = 'dexpert|DeXpert Inmobiliaria,dimension-expert|Dimension eXpert' THEN
    -- Pasar cada tenant a un valor temporal único (slug y subdomain son UNIQUE)
    UPDATE "Tenant" SET slug = '__volkern_swap_a__', subdomain = '__volkern_swap_a__'
      WHERE slug = 'dimension-expert' AND nombre = 'Dimension eXpert';
    IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró tenant dimension-expert/Dimension eXpert'; END IF;

    UPDATE "Tenant" SET slug = '__volkern_swap_b__', subdomain = '__volkern_swap_b__'
      WHERE slug = 'dexpert' AND nombre = 'DeXpert Inmobiliaria';
    IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró tenant dexpert/DeXpert Inmobiliaria'; END IF;

    UPDATE "Tenant" SET slug = 'dexpert', subdomain = 'dexpert'
      WHERE slug = '__volkern_swap_a__';
    IF NOT FOUND THEN RAISE EXCEPTION 'Fallo al asignar slug dexpert (swap A)'; END IF;

    UPDATE "Tenant" SET slug = 'dimension-expert', subdomain = 'dimension-expert'
      WHERE slug = '__volkern_swap_b__';
    IF NOT FOUND THEN RAISE EXCEPTION 'Fallo al asignar slug dimension-expert (swap B)'; END IF;

    RAISE NOTICE 'Slugs intercambiados OK: Dimension eXpert -> dexpert, DeXpert Inmobiliaria -> dimension-expert.';
  ELSE
    RAISE EXCEPTION 'Estado inesperado de los tenants (slug|nombre): %', pre;
  END IF;
END $$;

DO $$
DECLARE
  data_tenant_id text := 'cms92n0ii0001mf83yr9grk30'; -- tenant DeXpert Inmobiliaria
  admin_role_id  text := 'cms92n1m50005mf83uctrp5ol';  -- rol Admin de ese tenant
  v_email        text := 'dximobilia@dimensionexpert.com';
  v_name         text := 'Admin DeXpert Inmobiliaria';
  v_hash         text := :'password_hash'; -- bcrypt(10) password provisional (variable psql)
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE email = v_email) THEN
    RAISE NOTICE 'El usuario % ya existe; se omite la creación.', v_email;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE id = data_tenant_id AND slug = 'dimension-expert') THEN
      RAISE EXCEPTION 'El tenant destino no tiene slug dimension-expert (id %). ¿Swap previo mal aplicado?', data_tenant_id;
    END IF;
    INSERT INTO "User" (id, name, email, password, estado, "roleId", "tenantId", "updatedAt", "metadata", "timezone", "tokenVersion")
    VALUES (gen_random_uuid()::text, v_name, v_email, v_hash, 'activo', admin_role_id, data_tenant_id, now(), '{}'::jsonb, 'Europe/Madrid', 0);
    RAISE NOTICE 'Usuario % creado en el tenant DeXpert Inmobiliaria (slug dimension-expert).', v_email;
  END IF;
END $$;

-- Verificación final
SELECT id, nombre, slug, subdomain, plan FROM "Tenant"
WHERE slug IN ('dexpert','dimension-expert') ORDER BY slug;

SELECT u.email, u.name, u.estado, t.slug AS tenant_slug, t.nombre AS tenant_nombre, r.nombre AS role_nombre
FROM "User" u
JOIN "Tenant" t ON t.id = u."tenantId"
JOIN "Role" r ON r.id = u."roleId"
WHERE u.email IN ('bruno.hess@dimensionexpert.com','admin@dexpert.volkern.app','direccion@dexpert.volkern.app','dximobilia@dimensionexpert.com')
ORDER BY t.slug, u.email;

COMMIT;
