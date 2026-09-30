-- Expiración del token de invitación (14 días): los tokens vivos antes de esta
-- migración expiran según su fecha de invitación.
ALTER TABLE "User" ADD COLUMN "tokenInvitacionExpiry" TIMESTAMP(3);

UPDATE "User"
SET "tokenInvitacionExpiry" = "fechaInvitacion" + INTERVAL '14 days'
WHERE "tokenInvitacion" IS NOT NULL;
