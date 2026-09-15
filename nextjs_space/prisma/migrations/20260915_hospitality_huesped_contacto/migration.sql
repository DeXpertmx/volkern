-- El rol Huésped ve únicamente SUS reservas. Para eso hace falta saber quién es:
-- el vínculo entre el usuario y su contacto del CRM.
--
-- La columna es opcional a propósito. Un usuario con rol Huésped y sin vínculo no
-- ve ninguna reserva —ni las suyas ni las de nadie—, que es el lado seguro del
-- error: no se puede degradar a "ve todas".
ALTER TABLE "User" ADD COLUMN "contactId" TEXT;

-- CreateIndex
CREATE INDEX "User_contactId_idx" ON "User"("contactId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
