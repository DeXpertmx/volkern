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

-- La forma del hash se valida ANTES de escribir: un valor que no sea bcrypt de
-- 60 caracteres deja la cuenta inaccesible (bcrypt.compare siempre devuelve
-- false) y el fallo solo se nota cuando la persona intenta entrar. psql no
-- interpola variables dentro de DO $$ ... $$, así que la comprobación va con
-- \gset y \if.
SELECT CASE
         WHEN :'password_hash' ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN 'true'
         ELSE 'false'
       END AS password_hash_valido \gset
\if :password_hash_valido
\else
  -- `\quit` no admite código de salida, así que el aborto se señaliza con un
  -- error de SQL y ON_ERROR_STOP: el script termina con código distinto de 0.
  \set ON_ERROR_STOP on
  DO $$ BEGIN RAISE EXCEPTION 'password_hash no tiene forma de bcrypt (60 caracteres: $2b$<coste>$<salt><hash>). Abortando sin escribir.'; END $$;
\endif

UPDATE "User"
   SET password = :'password_hash',
       "updatedAt" = now()
 WHERE email = 'bruno.hess@dimensionexpert.com'
   AND password IS DISTINCT FROM :'password_hash';

COMMIT;