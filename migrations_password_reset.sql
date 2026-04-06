
-- Agregar columnas para recuperación de contraseña
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);

-- Crear índice único para resetToken
CREATE UNIQUE INDEX IF NOT EXISTS "User_resetToken_key" ON "User"("resetToken");

-- Comentarios para documentación
COMMENT ON COLUMN "User"."resetToken" IS 'Token único para recuperación de contraseña';
COMMENT ON COLUMN "User"."resetTokenExpiry" IS 'Fecha de expiración del token de recuperación';
