-- AlterTable: Add Verifactu fields to erp_expenses
ALTER TABLE "erp_expenses" ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "taxableBase" DOUBLE PRECISION,
ADD COLUMN     "vatRate" DOUBLE PRECISION,
ADD COLUMN     "vatAmount" DOUBLE PRECISION,
ADD COLUMN     "operationDate" TIMESTAMP(3),
ADD COLUMN     "issuerName" TEXT,
ADD COLUMN     "issuerAddress" TEXT,
ADD COLUMN     "issuerTaxId" TEXT;
