-- Reset de contraseña de bruno.hess@dimensionexpert.com en PRODUCCIÓN
--
-- ⚠️ NUNCA commitear hashes de contraseñas reales. El hash bcrypt se pasa
-- en tiempo de ejecución con la variable psql `password_hash`:
--
--   psql ... -v password_hash='<hash bcrypt>' -f production-reset-bruno-password.sql
--
-- Generar el hash localmente (nunca pegar contraseñas en el repo):
--   npx tsx -e "const b=require('bcryptjs'); b.hash('<PASSWORD>',10).then(h=>console.log(h))"
\if :{?password_hash}
\else
  \echo 'ERROR: define la variable psql password_hash (-v password_hash=...) antes de ejecutar.'
  \quit 1
\endif

BEGIN;
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM "User" WHERE email = 'bruno.hess@dimensionexpert.com';
  IF n = 0 THEN
    RAISE EXCEPTION 'El usuario bruno.hess@dimensionexpert.com no existe. Abortando.';
  END IF;
END $$;

UPDATE "User"
   SET password = :'password_hash',
       "updatedAt" = now()
 WHERE email = 'bruno.hess@dimensionexpert.com'
   AND password IS DISTINCT FROM :'password_hash';

COMMIT;