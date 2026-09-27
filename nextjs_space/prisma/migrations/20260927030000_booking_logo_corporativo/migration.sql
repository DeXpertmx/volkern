-- La cabecera de la página pública usa el logo corporativo del tenant
-- (Configuración → Empresa, clave `logo_corporativo` de la tabla
-- `configuracion`), no un campo propio del Booking Engine: una sola marca
-- para todo el ERP. Si no hay logo configurado, no se enseña ninguno.
-- Aditiva inversa: la columna nació ayer y nadie la usa como fuente.
ALTER TABLE "hospitality_booking_config" DROP COLUMN IF EXISTS "logo";
