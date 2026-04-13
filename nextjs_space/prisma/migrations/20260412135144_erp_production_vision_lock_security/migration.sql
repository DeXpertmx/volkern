-- AlterTable
ALTER TABLE "erp_production_logs" ADD COLUMN     "clientTimestamp" TIMESTAMP(3),
ADD COLUMN     "reportLat" DOUBLE PRECISION,
ADD COLUMN     "reportLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "erp_projects" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
