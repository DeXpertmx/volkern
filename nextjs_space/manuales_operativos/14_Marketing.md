# 14. Marketing y Generación de Demanda

## 1. Nombre del hub
Hub de Marketing, Leads y Captación (Top of Funnel).

## 2. Propósito operativo
Gestionar el flujo de clientes potenciales antes de que se conviertan en Ventas reales. Conecta formularios externos, automatiza campañas de correo, califica (Scoring) el interés de los contactos y distribuye los prospectos (Leads) a los vendedores adecuados.

## 3. Quién lo usa
- Especialistas de Marketing.
- Equipo de SDRs (Sales Development Representatives).
- Directores Comerciales.

## 4. Qué ve el usuario al entrar por primera vez
- **Kanban de Leads:** Columnas visualizando los prospectos desde "Nuevo" hasta "Convertido".
- **Dashboard de Rendimiento de Campañas:** Métricas de apertura de correos, clics y costo de adquisición.
- Gestor de Embudos (Funnels) y Formularios web embedables.

## 5. Qué puede hacer
- Crear Landing Pages o formularios para inyectar contactos a Volkern desde el sitio web de la empresa.
- Etiquetar masivamente contactos para crear audiencias.
- Diseñar y disparar campañas masivas de correo utilizando el motor interno.
- Configurar reglas de "Lead Routing" (A qué vendedor le toca el siguiente prospecto).

## 6. Qué no puede hacer
- No puede hacer cotizaciones ni confirmar pedidos de venta; ese es terreno del Hub de Ventas. Su labor termina cuando el "Lead" se convierte en "Deal".
- No puede ignorar listas de bajas (Unsubscribes); el sistema bloquea envíos a correos que pidieron no recibir publicidad, garantizando cumplimiento GDPR.

## 7. Qué ayudas necesita el administrador de tenant
- Configuración de dominios remitentes seguros.
- Mapeo de integraciones externas si compran listas de contactos en plataformas de terceros.

## 8. Problemas o dudas frecuentes
- **"El Lead no llegó al vendedor"**: Probablemente las reglas de enrutamiento (Routing) tengan filtros muy restrictivos (Ej: Filtrando por país incorrecto).
- **"Baja tasa de apertura en campaña"**: Revisar la salud del dominio o consultar con el AI Copywriter interno para optimizar el asunto del correo.

## 9. Reglas de jerarquía y seguridad
- Las bases de datos de clientes son sensibles. Los SDRs base solo ven sus propios Leads asignados; no pueden descargar el CSV completo de la empresa.

## 10. Flujo normal de uso
1. Marketing crea una Campaña y pega un formulario de Volkern en la web.
2. Un visitante deja sus datos (Nombre, Email).
3. Volkern crea un `Lead` en el Kanban y avisa al equipo de SDR.
4. El SDR lo califica (Llama por teléfono).
5. Si el cliente tiene intención de compra, el SDR presiona "Convertir a Venta".
6. El flujo abandona Marketing y entra al Hub de Ventas como un `Deal`.

## 11. Indicadores operativos importantes
- Costo por Lead (CPL).
- Tasa de Conversión (Leads a Ventas Cerradas).
- Ratio de Apertura y Click-Through Rate (CTR) de campañas.

## 12. Escalamiento cuando algo falla
1. Si un formulario público lanza error 500 al cliente, verificar que el API Key público embebido en el código web no haya expirado o haya sido revocado en el hub de Integraciones.

---

### Resumen para soporte y administración
1. **La Frontera Lead vs Venta:** Marketing empuja, Ventas cierra. Mantén ambos Hubs limpios. No mezcles contactos de "suscripción al blog" con tus "cuentas B2B VIP". Usa las etiquetas (Tags) para segregarlos.
2. **Spam is Law:** Nunca desactives las protecciones anti-spam del Hub. Volkern cuida agresivamente la reputación de los dominios emisores.
3. **Puntuación de Leads (Scoring):** Usa la IA para asignar puntos. Si un cliente abrió 5 correos, el sistema debe alertar al vendedor para que llame de inmediato.
4. **Plantillas Compartidas:** Marketing debe subir las plantillas oficiales de correos y PDFs para que el Hub de Ventas no invente formatos no autorizados.
5. **Autosuficiencia en Web:** El creador de formularios está pensado para que Marketing no necesite depender de Ingeniería/Sistemas cada vez que lanza una promoción.
