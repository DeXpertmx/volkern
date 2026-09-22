-- Health-check diario de conectividad: marca de la última verificación activa
-- de la capa (sonda contra `property_details`), visible en el panel de admin.
--
-- El estado (`estado`) se sigue moviendo solo con tráfico real o con el botón
-- «Probar»; esta marca refleja cuándo se verificó a propósito, sin esperar
-- eventos: si el proveedor revoca las credenciales un martes sin tráfico, el
-- panel ya no sigue verde «porque sí».

ALTER TABLE "connectivity_providers" ADD COLUMN     "ultimaVerificacion" TIMESTAMP(3);
