-- Reset de contraseña de bruno.hess@dimensionexpert.com en PRODUCCIÓN
-- Convención documentada: scripts/reset-bruno-password.ts → DimensionExpert2024!
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
   SET password = '$2a$10$1O/OrPRA/vZmL5mMxiXKp.aTCjhK5NpVWxXBYBRdO5TNzv8lvYXjm',
       "updatedAt" = now()
 WHERE email = 'bruno.hess@dimensionexpert.com'
   AND password IS DISTINCT FROM '$2a$10$1O/OrPRA/vZmL5mMxiXKp.aTCjhK5NpVWxXBYBRdO5TNzv8lvYXjm';

COMMIT;