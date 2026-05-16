# Manual de Operaciones y Soporte (AIOps & Telegram Gateway)

Este manual detalla los procedimientos para que el equipo de administradores u operadores monitorice y controle la salud del sistema Volkern utilizando la interfaz de Telegram (ChatOps) y entienda las decisiones autónomas del motor AIOps.

## 1. El Health Score Unificado
El sistema condensa la complejidad de las métricas de infraestructura (tasas de error, demoras en colas, incidentes abiertos) en un único indicador de 0 a 100.

* **🟢 90-100 (Óptimo):** Todo fluye. Tasa de error natural.
* **🟡 70-89 (Precaución):** Existen demoras o picos inusuales. El sistema de reintentos está conteniendo la falla.
* **🔴 <70 (Crítico):** Fallo generalizado (ej. caída de AEAT prolongada) o saturación inminente de los workers.

Todos los días a las 08:00 AM, el sistema envía un **Resumen Ejecutivo** automático al grupo de Telegram administrador con el Health Score, la tasa de error vs el baseline semanal y previsiones de capacidad.

## 2. Gestión de Incidentes (Incident Lifecycle)
Cuando una métrica se desvía peligrosamente de la norma histórica, el sistema crea un "Incidente" en lugar de enviar alertas repetitivas (spam).

**Ciclo de Vida:**
1. **OPEN:** El sistema detecta la anomalía (ej. `AEAT_ERROR_RATE_SPIKE`) y avisa por Telegram.
2. **ACKNOWLEDGED (Reconocido):** El administrador toma control del incidente mediante ChatOps. Esto silencia alertas subsecuentes sobre el mismo problema.
3. **RESOLVED:** El sistema detecta de forma autónoma que las métricas han vuelto a la normalidad y cierra el incidente, enviando confirmación.

## 3. Catálogo de Comandos de ChatOps (Telegram)

Los operadores autorizados pueden interactuar con la infraestructura fiscal desde Telegram:

### `/fiscal_status`
* **Uso:** Diagnóstico en tiempo real bajo demanda.
* **Respuesta:** Muestra el estado de la conexión, tamaño de las colas de procesamiento, facturas aceptadas/rechazadas y el Root Cause Analysis si hay algún problema activo.

### `/fiscal_ack <ID_DEL_INCIDENTE>`
* **Uso:** Tomar conocimiento de un incidente abierto.
* **Efecto:** Cambia el estado del incidente a ACKNOWLEDGED y registra la acción en el AuditLog. Indica al equipo que alguien ya está mitigando la falla.

### `/fiscal_retry_failed`
* **Uso:** Recuperación ante desastres (Disaster Recovery).
* **Efecto:** Mueve masivamente todas las facturas en estado "FAILED" (después de agotar los reintentos automáticos) nuevamente a la cola principal. Útil después de que la entidad gubernamental (AEAT) se recupera de una caída masiva.

### `/fiscal_ai_forecast`
* **Uso:** Inteligencia de negocio predictiva para un tenant específico.
* **Respuesta:** Analiza los patrones de facturación de los últimos 30 días y estima el volumen total facturado y el IVA proyectado al cierre del periodo.

## 4. Motor de Auto-Healing (AIOps)
Volkern tiene capacidad de **Sanación Autónoma**. Si el sistema diagnostica un fallo estructural (por ejemplo, un tenant introdujo un certificado corrupto que genera miles de errores en bucle), el sistema puede ejecutar acciones preventivas.

* **Ejemplo de Acción Autónoma:** `PAUSE_AFFECTED_TENANTS`.
* **Comportamiento:** El motor suspende los envíos asíncronos de un inquilino específico para no saturar las colas globales ni degradar la "reputación" de envío ante el gobierno. Se notificará a los administradores con el diagnóstico de causa raíz.
* **Acción Humana Requerida:** Verificar el certificado del cliente, solucionarlo y reanudar la cola manualmente.
