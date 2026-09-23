-- AlterTable
ALTER TABLE "erp_employees" ADD COLUMN     "allowedTeleworkLat" DOUBLE PRECISION,
ADD COLUMN     "allowedTeleworkLng" DOUBLE PRECISION,
ADD COLUMN     "isTeleworkAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teleworkRadius" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "erp_attendance_logs" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "integrityHash" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "isAnomaly" BOOLEAN NOT NULL DEFAULT false,
    "anomalyType" TEXT,

    CONSTRAINT "erp_attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_attendance_challenges" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidenceUrl" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_attendance_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_attendance_logs_tenantId_idx" ON "erp_attendance_logs"("tenantId");

-- CreateIndex
CREATE INDEX "erp_attendance_logs_employeeId_idx" ON "erp_attendance_logs"("employeeId");

-- CreateIndex
CREATE INDEX "erp_attendance_logs_timestamp_idx" ON "erp_attendance_logs"("timestamp");

-- CreateIndex
CREATE INDEX "erp_attendance_challenges_attendanceId_idx" ON "erp_attendance_challenges"("attendanceId");

-- AddForeignKey
ALTER TABLE "erp_attendance_logs" ADD CONSTRAINT "erp_attendance_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "erp_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_attendance_challenges" ADD CONSTRAINT "erp_attendance_challenges_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "erp_attendance_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
