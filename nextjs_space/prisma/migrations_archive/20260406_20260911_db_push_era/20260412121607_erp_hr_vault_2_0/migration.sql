/*
  Warnings:

  - You are about to drop the column `amount` on the `erp_payroll_records` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `erp_payroll_records` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `erp_payroll_records` table. All the data in the column will be lost.
  - You are about to drop the column `employeeName` on the `erp_payroll_records` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `erp_payroll_records` table. All the data in the column will be lost.
  - You are about to drop the column `period` on the `erp_payroll_records` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `erp_payroll_records` table. All the data in the column will be lost.
  - Added the required column `amountEncrypted` to the `erp_payroll_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `employeeId` to the `erp_payroll_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `month` to the `erp_payroll_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `erp_payroll_records` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "erp_payroll_records" DROP CONSTRAINT "erp_payroll_records_userId_fkey";

-- DropIndex
DROP INDEX "erp_payroll_records_period_idx";

-- AlterTable
ALTER TABLE "erp_payroll_records" DROP COLUMN "amount",
DROP COLUMN "currency",
DROP COLUMN "date",
DROP COLUMN "employeeName",
DROP COLUMN "notes",
DROP COLUMN "period",
DROP COLUMN "userId",
ADD COLUMN     "amountEncrypted" TEXT NOT NULL,
ADD COLUMN     "employeeId" TEXT NOT NULL,
ADD COLUMN     "month" INTEGER NOT NULL,
ADD COLUMN     "paymentDate" TIMESTAMP(3),
ADD COLUMN     "year" INTEGER NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "erp_employees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "department" TEXT NOT NULL DEFAULT 'GENERAL',
    "hiringDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salaryEncrypted" TEXT,
    "contractUrlEncrypted" TEXT,
    "encryptionKeyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "erp_employees_userId_key" ON "erp_employees"("userId");

-- CreateIndex
CREATE INDEX "erp_employees_tenantId_idx" ON "erp_employees"("tenantId");

-- CreateIndex
CREATE INDEX "erp_employees_userId_idx" ON "erp_employees"("userId");

-- CreateIndex
CREATE INDEX "erp_payroll_records_employeeId_idx" ON "erp_payroll_records"("employeeId");

-- AddForeignKey
ALTER TABLE "erp_employees" ADD CONSTRAINT "erp_employees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_employees" ADD CONSTRAINT "erp_employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_payroll_records" ADD CONSTRAINT "erp_payroll_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "erp_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
