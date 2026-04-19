# 20. Servidor MCP (Model Context Protocol)

## 1. Nombre del hub
Hub Operativo de MCP (Agent Skills & Context Gateway).

## 2. Propósito operativo
Permitir que la Inteligencia Artificial (Ej. Claude Desktop, Cursor, Gemma) "hable" de manera estandarizada y segura con Volkern. El MCP no es para humanos, es el canal oficial mediante el cual los Agentes Inteligentes extraen datos de la empresa (Inventario, Nóminas) o ejecutan acciones automáticas.

## 3. Quién lo usa
- Administradores de Sistemas (Configurando la conectividad).
- Desarrolladores de IA de la Empresa.
- Aplicaciones cliente (Ej. App de Escritorio de Claude o el terminal de Cursor).

## 4. Qué ve el usuario al entrar por primera vez
- **No tiene interfaz visual para usuarios base.** 
- Los Administradores acceden al "Agent Skills Panel" (Dentró de Academia / Core) para gestionar las llaves API del MCP.
- Los clientes ven el Manifiesto JSON (La lista de "Tools" y "Resources" que Volkern expone).

## 5. Qué puede hacer (El Agente IA)
- Usar las credenciales para solicitar el Manifiesto de Habilidades.
- Leer el catálogo de productos o checar el stock físico (`stock_query_level`).
- Validar márgenes de venta antes de proponer descuentos (`sales_calculate_margin`).
- Cualquier operación permitida expresamente en los `scopes` de la llave.

## 6. Qué no puede hacer
- **Un agente IA JAMÁS puede borrar (DELETE) registros base** mediante MCP, está diseñado como un protocolo de sugerencias y lectura (y escritura en hubs controlados como Cotizaciones).
- **No puede acceder sin Token Activo:** Si el token es revocado, la IA pierde acceso a Volkern en el mismo milisegundo.

## 7. Qué ayudas necesita el administrador de tenant
- Necesita entender cómo configurar su cliente MCP (Ej. Configurar `claude_desktop_config.json` para apuntar a la URL `/api/mcp` de su empresa).
- Proveer los `Bearer Tokens` generados a las personas adecuadas.

## 8. Problemas o dudas frecuentes
- **"Claude dice que no puede conectar al servidor MCP"**: El servidor puede estar detrás de un WAF (Web Application Firewall) que bloquea peticiones sin las cabeceras correctas, o el token de autenticación ha vencido.
- **"El Agente intenta hacer algo y falla"**: El administrador debe revisar si al agente le falta un "Scope" (Permiso) específico en la configuración de la llave API en Volkern.

## 9. Reglas de jerarquía y seguridad
- **Tokens Específicos por Agente:** Cada instancia de IA debe tener su propia llave (Ej: La IA del Vendedor A usa la llave X, la IA de Finanzas usa la llave Y). Esto garantiza que si Gemma de Finanzas comete un error, quede auditado bajo su nombre en el `AiDecisionLog`.
- **Ratelimiting (Límite de Peticiones):** Volkern capa el servidor MCP para evitar ataques de denegación de servicio (DDoS) si una IA entra en un bucle infinito de llamadas.

## 10. Flujo normal de uso
1. El Administrador genera un `API_KEY` para "Gemma-Sales-Bot".
2. El Vendedor configura su app cliente ingresando la URL del MCP y la llave.
3. El Vendedor le dice a la app: "Oye, ¿tenemos stock de las baterías SKU-123?"
4. La App utiliza el protocolo MCP, Volkern valida la llave, y ejecuta internamente `getAvailableStock()`.
5. Volkern retorna la respuesta JSON.
6. La IA lee el JSON y le contesta al Vendedor en lenguaje natural: "Sí, tenemos 50 piezas disponibles y ninguna reservada".

## 11. Indicadores operativos importantes
- Tráfico total del Servidor MCP.
- Tiempo de latencia por consulta de IA.
- Cantidad de rechazos por autenticación (Security Logs).

## 12. Escalamiento cuando algo falla
1. Si una IA comete errores garrafales recomendando precios absurdos, revocar la API Key inmediatamente y revisar el `AiDecisionLog` en el Trust Protocol para entender la alucinación.

---

### Resumen para soporte y administración
1. **MCP es la evolución de la API REST:** En lugar de darle a la IA 100 endpoints complejos, MCP le da un manual dinámico ("Tools") que la IA entiende cómo usar sola.
2. **Identidad de la IA:** Trata a las integraciones de IA como si fueran "Empleados virtuales". Dales un nombre, un rol, y audítalas.
3. **Peligro de Fuga de Llaves:** Un `API_KEY` con permisos de lectura totales es peligroso. Restringe los "Scopes" solo a lo que la IA necesita saber para su trabajo.
4. **Visibilidad en el Trust Protocol:** Recuerda a los usuarios que "Lo que hace la IA, Volkern lo sabe". Todas sus inferencias y consultas quedan anotadas.
5. **No es Inteligencia Autónoma:** El servidor MCP expone herramientas, pero la inteligencia reside en el modelo (Gemma/Claude) que decide qué herramienta llamar y cuándo.
