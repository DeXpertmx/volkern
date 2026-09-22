-- AlterTable
ALTER TABLE "erp_expenses" ADD COLUMN     "hospitalityReservationId" TEXT;

-- CreateIndex
CREATE INDEX "erp_expenses_hospitalityReservationId_idx" ON "erp_expenses"("hospitalityReservationId");

-- AddForeignKey
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_hospitalityReservationId_fkey" FOREIGN KEY ("hospitalityReservationId") REFERENCES "hospitality_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
