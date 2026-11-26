-- Tercer estado del recibo: un envío que no confirmó su desenlace (timeout,
-- error de red, 5xx) pudo salir. No se libera; se marca como incierto para que
-- el estado sea honesto sin abrir la puerta a un duplicado.
ALTER TABLE "whatsapp_send_receipts" DROP CONSTRAINT "whatsapp_send_receipts_status_check";
ALTER TABLE "whatsapp_send_receipts" ADD CONSTRAINT "whatsapp_send_receipts_status_check" CHECK ("status" IN ('en_curso', 'enviado', 'incierto'));
