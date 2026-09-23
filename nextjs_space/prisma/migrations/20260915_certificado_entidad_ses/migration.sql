-- Certificado digital de la entidad para el registro de viajeros (SES.HOSPEDAJES).
--
-- El certificado de la FNMT de la entidad es lo que el Ministerio pide para saber
-- quién comunica: viaja presentado en el TLS de cada envío. Hasta ahora la
-- configuración tenía un campo de texto que se guardaba y nadie usaba, así que el
-- envío salía solo con la cabecera Basic.
--
-- OJO: `certificadoEnc` YA EXISTÍA (era ese campo muerto), así que esta migración
-- solo añade las columnas nuevas. Volver a crearla hace fallar el `migrate deploy`
-- con «column certificadoEnc already exists» y deja el pipeline parado antes del
-- `service update`: lo que se actualiza es el esquema, no el servicio.
--
-- Se guardan dos cosas distintas y por eso van en columnas distintas:
--   1) el material secreto (el .p12 en Base64 y su contraseña), cifrados;
--   2) los datos públicos del certificado (titular, NIF, emisor, huella y
--      vencimiento), para que la configuración pueda enseñarlos sin descifrar nada.
ALTER TABLE "hospitality_compliance_config"
  ADD COLUMN "certificadoPasswordEnc" TEXT,
  ADD COLUMN "certificadoTitular" TEXT,
  ADD COLUMN "certificadoNif" TEXT,
  ADD COLUMN "certificadoEmisor" TEXT,
  ADD COLUMN "certificadoHuella" TEXT,
  ADD COLUMN "certificadoVence" TIMESTAMP(3);
