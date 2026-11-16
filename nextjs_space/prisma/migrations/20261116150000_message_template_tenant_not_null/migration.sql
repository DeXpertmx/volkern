-- Las plantillas de mensajes son por tenant desde 20261116140000. Esta
-- migración cierra la puerta a filas invisibles: una plantilla sin tenantId
-- no la devuelve ninguna API y no se puede usar desde el Hub.
--
-- Comprobación previa: si queda alguna fila antigua sin tenant, se aborta con
-- un mensaje que dice cuántas son y qué hacer, en vez de fallar con un error
-- genérico de constraint.
DO $$
DECLARE
  huerfanas bigint;
BEGIN
  SELECT count(*) INTO huerfanas
  FROM "MessageTemplate"
  WHERE "tenantId" IS NULL;

  IF huerfanas > 0 THEN
    RAISE EXCEPTION
      'MessageTemplate: % plantilla(s) sin tenantId. Asígnalas antes de aplicar esta migración: UPDATE "MessageTemplate" SET "tenantId" = ''<id-del-tenant>'' WHERE "tenantId" IS NULL;',
      huerfanas;
  END IF;

  RAISE NOTICE 'MessageTemplate: no hay filas sin tenantId, se aplica NOT NULL';
END $$;

ALTER TABLE "MessageTemplate" ALTER COLUMN "tenantId" SET NOT NULL;
