# Ficha Técnica: Web Creator Hub
**Páginas Web Nativas sin Plugins, sin Zapier y sin Fricción**

---

## 1. Descripción General (El Alcance)
El **Web Creator** de Volkern es un constructor de sitios web (CMS) embebido en el corazón del ERP. Nace para destruir la pesadilla operativa de tener el sitio web en WordPress o Shopify y tratar de conectarlo al sistema de inventarios y ventas mediante conectores frágiles. 

Con el Web Creator, si el Director Comercial cambia el precio de un SKU en el `Catalog Hub` o Logística pone un lote en cuarentena, la página web pública se actualiza en milisegundos. Tus Landing Pages y tu e-commerce son literalmente una ventana directa a la base de datos de Volkern.

---

## 2. Alcances y Funcionalidades Principales

### A. E-Commerce y Catálogo Nativo (Sin Sincronizaciones)
- **Stock en Tiempo Real:** El sitio web lee el mismo inventario que ven tus vendedores. Si un cliente compra la última pieza en línea, ningún vendedor podrá prometerla en mostrador.
- **Precios Dinámicos (Margin Guard):** Aplica descuentos por volumen en el sitio web respetando estrictamente las políticas de rentabilidad globales del Tenant.

### B. Marketing Integrado (Landing Pages)
- **Formularios Inyectados al CRM:** Crea un formulario de "Contáctanos" en el Web Creator. Cuando el visitante hace clic en "Enviar", no hay correos perdidos; el lead entra directamente al motor de `Marketing Hub`, activando el `LeadRouter` para asignarle un vendedor en segundos.
- **Portales de Pago Embebidos:** Flujos de pago impulsados por pasarelas seguras (Stripe) directamente en la página, generando la Factura en el `Finance Hub` instantáneamente.

---

## 3. Especificaciones Técnicas (Ficha Técnica Arquitectónica)

| Componente | Especificación Tecnológica |
| :--- | :--- |
| **Motor de Renderizado** | Basado en Next.js App Router (React). |
| **Optimización SEO (ISR)** | Utiliza *Incremental Static Regeneration* (ISR). Las páginas se generan estáticamente para cargar en menos de 50ms, pero se invalidan y regeneran silenciosamente en cuanto un dato cambia en el ERP, garantizando un score SEO de 100/100 en Google Lighthouse. |
| **Arquitectura Headless CMS** | El contenido se almacena en PostgreSQL con esquemas flexibles (Bloques JSONB) permitiendo diseños escalables sin la rigidez de las plantillas tradicionales. |
| **Seguridad Edge** | Al no tener plugins de terceros (A diferencia de WordPress), la superficie de ataque es virtualmente cero. Protegido detrás del mismo WAF y encriptación que el Vault Financiero de Volkern. |

---

## 4. El Poder de la IA y MCP en Web Creator

Crear una página de aterrizaje (Landing Page) para una campaña urgente solía requerir diseñadores y programadores. Con **Gemma 4**, es cuestión de segundos:

- **Generación de Sitios por Prompts (Generative UI):** Puedes pedirle a la IA: *"Gemma, créame una Landing Page para promocionar nuestro nuevo lote de Baterías de Litio. Usa el Catálogo para los specs, pon un formulario de captura y redacta el texto enfocado a ingenieros"*.
- La IA (a través del servidor MCP) lee los SKUs, redacta el HTML/React y te presenta la página lista para publicar.
- **Optimización Continua (A/B Testing IA):** El Agente Inteligente analiza el tráfico y sugiere: *"El título B está convirtiendo un 14% más. He actualizado la página principal para mostrar solo el título B"*.
- **SEO Autónomo:** Gemma rellena automáticamente los `Meta Tags`, descripciones y estructuración semántica basándose en el comportamiento de búsqueda actual de tu nicho.

---

## 5. Impacto en el Negocio (ROI)
1. **Erradicación de "Stack Costs":** Elimina las mensualidades de Shopify, Wix, Unbounce, Zapier y docenas de plugins de WordPress. Una sola plataforma consolida todo.
2. **Speed-to-Market Comercial:** ¿Tienes exceso de inventario? El equipo de ventas puede lanzar una página promocional web en 5 minutos y mandarla por correo (Marketing Hub). Cero cuellos de botella de TI.
3. **Conversión Imparable:** Al estar conectado al CRM nativo, los Leads de la web no se "enfrían" en una bandeja de entrada. Un vendedor los llama minutos después de que enviaron el formulario, aumentando la tasa de cierre exponencialmente.
