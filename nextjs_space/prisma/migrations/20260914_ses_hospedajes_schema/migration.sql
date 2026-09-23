-- El esquema del interface v3.0.0 de SES.HOSPEDAJES ya está implementado y se
-- envía de verdad. Tres huecos de datos que el contrato exige:

-- 1) Código de arrendador de la entidad: lo asigna el Ministerio al registrarla
--    y es la cabecera de cada lote SOAP. Por configuración (por tenant).
ALTER TABLE "hospitality_compliance_config"
  ADD COLUMN "codigoArrendador" TEXT;

-- 2) Código oficial del establecimiento por propiedad (+ municipio INE opcional):
--    tanto la RH como el PV lo necesitan, y es referencia externa, no identidad.
ALTER TABLE "hospitality_properties"
  ADD COLUMN "sesHospedajes" JSONB;

-- 3) Domicilio del viajero: el parte de viajeros exige por persona vía y código
--    postal (municipio y país según el XSD). El formulario público del viajero
--    pasa a pedirlo.
ALTER TABLE "hospitality_travelers"
  ADD COLUMN "direccion" TEXT,
  ADD COLUMN "municipio" TEXT,
  ADD COLUMN "codigoMunicipio" TEXT,
  ADD COLUMN "codigoPostal" TEXT,
  ADD COLUMN "paisDireccion" TEXT;
