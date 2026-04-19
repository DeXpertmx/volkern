# 3. Academia

## 1. Nombre del hub
Academia y Desarrollo de Talento (Skill-Guard).

## 2. Propósito operativo
Gestionar la capacitación, evaluar competencias técnicas, y actuar como el guardián de habilidades operativas (Skill-Guard). Garantiza que ninguna línea de producción o tarea especializada sea operada por personal sin certificación válida. Además, aloja el motor "Agent Skills" para conectar agentes IA.

## 3. Quién lo usa
- Personal de HR y Capacitación (Creadores de contenido).
- Empleados y Operarios (Alumnos).
- Agentes de Inteligencia Artificial (mediante conectividad MCP).
- Supervisores Operativos (para verificar certificaciones).

## 4. Qué ve el usuario al entrar por primera vez
- **El Empleado:** Ve su "Ruta de Aprendizaje", cursos pendientes, progreso, y sus certificados o "Skills" activos.
- **El Administrador:** Ve el gestor de cursos, panel de evaluaciones, y el "Agent Skills Module" (donde gestiona API Keys y credenciales para agentes de IA).

## 5. Qué puede hacer
- Completar cursos interactivos y responder evaluaciones.
- Obtener credenciales operativas.
- En el caso de IA, consumir herramientas conectadas vía MCP (Model Context Protocol).
- Los administradores pueden crear cursos, revocar habilidades caducadas o inyectar "manifiestos" de agentes de IA.

## 6. Qué no puede hacer
- **Un operario NO puede asignarse habilidades manualmente**, debe pasar las evaluaciones y obtener la aprobación criptográfica del sistema.
- Un agente IA no puede conectar al "Agent Skills Module" sin su clave API válida y registro en la Bóveda Criptográfica.

## 7. Qué ayudas necesita el administrador de tenant
- Instrucciones sobre cómo vincular la aprobación de un curso a una línea de Producción específica (Ej: "Certificación de CNC" obligatoria para la WorkOrder X).
- Ayuda para comprender cómo rotar las API Keys de los agentes MCP si existe sospecha de compromiso de seguridad.

## 8. Problemas o dudas frecuentes
- **"El Agente de IA no se conecta"**: Generalmente es un problema con el Manifest OpenAPI no generado o la clave revocada en el "Agent Skills Module".
- **"El operador está bloqueado en Producción"**: Probablemente su curso caducó, el Skill-Guard detendrá cualquier `WorkOrder` hasta que renueve su certificación.

## 9. Reglas de jerarquía y seguridad
- **Skill-Guard:** Es absoluto. La falta de una habilidad en HR anula los permisos en Producción.
- Los cursos y certificaciones mantienen un registro de auditoría.
- La conectividad de Agentes IA (MCP) opera bajo la jerarquía de Tenant, bloqueando cualquier fuga de datos entre inquilinos.

## 10. Flujo normal de uso
1. HR crea un curso y requiere una evaluación.
2. El operario ingresa, consume el material multimedia y responde.
3. El sistema valida y emite la habilidad técnica al perfil del usuario en la base de datos.
4. El Operario se presenta a su turno en Producción y el sistema le da luz verde.

## 11. Indicadores operativos importantes
- Tasa de finalización de cursos.
- Volumen de "Bloqueos" operativos por caducidad de Skills (Skill-Guard Interventions).
- Llamadas a la API por agentes MCP (Tráfico IA).

## 12. Escalamiento cuando algo falla
1. Si un Agente IA falla, el administrador debe verificar el "Agent Skills Panel" y revisar el Log de Conexiones API.
2. Si un empleado no logra ver su curso, validar que el curso esté publicado y no en DRAFT.

---

### Resumen para soporte y administración
1. **El concepto clave es "Skill-Guard":** La Academia no es solo para ver videos, es la llave de paso de seguridad industrial para otros módulos.
2. **Las Habilidades caducan:** Estar alerta a las alertas de renovación.
3. **Módulo de Agentes MCP:** Aquí conviven los humanos y la IA. Los "Skills" técnicos también se otorgan a la IA mediante integración MCP.
4. **La trazabilidad es vital:** Todo curso completado se refleja permanentemente en el `Contact` (Empleado).
5. **No hay "Bypasses" operativos simples:** Para saltar un bloqueo del Skill-Guard en producción, requiere intervención directa de un Supervisor de alto rango.
