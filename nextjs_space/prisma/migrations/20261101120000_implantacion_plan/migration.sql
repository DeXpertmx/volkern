-- Personalización del alta: el embudo que el cliente aprueba.
--
-- El alta ya proponía un embudo, pero no guardaba el que el cliente acepta ni
-- el que se creó en la cuenta: al reabrir no había forma de saber si estaba
-- aplicado, ni de deshacerlo. `plan` guarda la pieza aprobada (embudo con sus
-- etapas y criterios), el `pipelineId` creado y cuándo se aplicó o deshizo.
ALTER TABLE "implantacion_tenant" ADD COLUMN "plan" JSONB;
