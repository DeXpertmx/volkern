-- Las alertas de conversión juzgan la actividad RECIENTE del código, no la
-- estancia: una consulta para dentro de seis meses es un intento de hoy. Hasta
-- ahora los índices eran por fecha de entrada (check-in), que es la ventana del
-- informe de rendimiento. Este índice sirve la consulta de la alerta.
CREATE INDEX "hospitality_promo_consulta_tenantId_fecha_idx"
  ON "hospitality_promo_consulta"("tenantId", "fecha");
