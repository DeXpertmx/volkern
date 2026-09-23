-- `User.contactId`: la vinculación usuario ↔ contacto de la plataforma (línea
-- de master). La columna nació en la era `db push`, así que **producción ya la
-- tiene** y ningún historial de migraciones la creaba: una base nueva (dev, CI,
-- staging fresco) se levantaba con un esquema que el cliente de Prisma no podía
-- consultar (P2022 «column User.contactId does not exist»).
--
-- Por eso la migración es idempotente a propósito: sobre la base desplegada no
-- hace nada y sobre una base nueva deja el esquema completo. Es el estándar que
-- el repo ya exige para las migraciones nuevas (ver docs/PRISMA-BASELINE.md).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "contactId" TEXT;

CREATE INDEX IF NOT EXISTS "User_contactId_idx" ON "User"("contactId");

-- `ADD CONSTRAINT` no admite `IF NOT EXISTS` en Postgres: se comprueba por
-- catálogo. El nombre es el que genera Prisma para el campo (`_fkey`).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_contactId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
