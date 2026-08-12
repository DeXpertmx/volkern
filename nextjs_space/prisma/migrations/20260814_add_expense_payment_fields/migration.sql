-- Add payment terms captured from scanned invoices.
ALTER TABLE "erp_expenses"
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "paymentMethod" TEXT;
