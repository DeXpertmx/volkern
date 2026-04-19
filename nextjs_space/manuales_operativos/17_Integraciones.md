# 17. Integraciones y Webhooks

## 1. Nombre del hub
Hub de Integraciones, APIs y Conectores de Terceros.

## 2. Propósito operativo
Servir de puente entre el ecosistema aislado de Volkern y el mundo exterior. Permite conectar pasarelas de pago, proveedores de envíos logísticos (Ej: DHL, FedEx), servicios de correo masivo o sistemas contables legados, garantizando la seguridad de las llaves compartidas.

## 3. Quién lo usa
- Administradores de Sistemas (SysAdmins).
- Desarrolladores o Integradores externos.
- SuperAdmins.

## 4. Qué ve el usuario al entrar por primera vez
- **App Marketplace:** Un catálogo de conectores nativos pre-construidos ("One-click installs").
- Panel de Webhooks: Para disparar notificaciones hacia el exterior.
- Gestor de API Keys: Emisión de tokens de acceso para scripts externos.

## 5. Qué puede hacer
- Inyectar las credenciales (API Keys) de proveedores externos para que Volkern las use (Ej: Stripe Secret Key).
- Crear endpoints (Webhooks) para que Volkern avise a un servidor externo cuando ocurre un evento (Ej: `ON_INVOICE_PAID`).
- Monitorizar el registro de intentos fallidos (Logs de Integración).

## 6. Qué no puede hacer
- No puede alterar el comportamiento base de Volkern; solo se suscriben a eventos.
- No puede extraer la Master Key de Volkern desde este Hub.

## 7. Qué ayudas necesita el administrador de tenant
- Ayuda en el cifrado seguro: Todo token de terceros guardado aquí debe usar KMS o encriptación simétrica.
- Entendimiento del formato JSON de los webhooks salientes.

## 8. Problemas o dudas frecuentes
- **"Stripe dejó de cobrar"**: Generalmente significa que la API Key caducó o el webhook configurado del lado de Stripe está respondiendo error 500.
- **"El webhook no dispara"**: Verificar que la URL receptora (Payload URL) tenga un certificado SSL válido y responda en menos de 3 segundos (Timeout).

## 9. Reglas de jerarquía y seguridad
- Solo un `SuperAdmin` tiene acceso a este hub. Un vendedor nunca debería ver las llaves secretas de facturación.
- Todas las credenciales externas guardadas se encriptan At-Rest.

## 10. Flujo normal de uso
1. El Tenant decide cobrar por internet. El SuperAdmin abre una cuenta en Stripe.
2. Ingresa al Hub de Integraciones, selecciona "Stripe" en el catálogo.
3. Pega su `Secret_Key`. Volkern la encripta en su base de datos.
4. El SuperAdmin activa la integración.
5. Inmediatamente el "Portal de Miembros" mostrará el botón "Pagar con Tarjeta" a los clientes.

## 11. Indicadores operativos importantes
- Tasa de Éxito de los Webhooks salientes.
- Latencia de respuestas de las APIs conectadas.

## 12. Escalamiento cuando algo falla
1. Si un conector de terceros empieza a devolver HTTP 429 (Too Many Requests), el administrador debe implementar pausas en el envío o subir el plan con su proveedor.

---

### Resumen para soporte y administración
1. **Centro Nervioso Externo:** Volkern es autosuficiente, pero aquí es donde lo haces "hablar" con el resto de internet.
2. **Cuidado con las Llaves:** Pagar las API Keys aquí les otorga el mismo rigor de encriptación que el Vault Financiero. Nunca las pegues en chats.
3. **Reintentos (Retries):** Si el servidor destino del Webhook está caído, Volkern intentará enviarlo de nuevo varias veces con Backoff Exponencial antes de marcarlo como Fallido.
4. **Desarrollo a la Medida:** Si un conector no existe en el Marketplace, siempre puedes usar Webhooks Genéricos y programar tu propio puente en un servidor "Lambda/Edge".
5. **Auditoría:** Todo cambio a la configuración de un Webhook queda marcado en el Trust Protocol para evitar redirecciones maliciosas.
