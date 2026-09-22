-- Canal de origen de las reseñas importadas (Booking.com, Airbnb…): la web y
-- Reportes lo enseñan junto al mes. Null en las nativas.
ALTER TABLE "hospitality_review" ADD COLUMN "canal" TEXT;

CREATE INDEX "hospitality_review_canal_idx" ON "hospitality_review"("canal");
