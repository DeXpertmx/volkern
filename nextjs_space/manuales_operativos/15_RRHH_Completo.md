# 15. Recursos Humanos, Talento y Desempeño

## 1. Nombre del hub
HR Core, Desempeño y Cultura Organizacional.

## 2. Propósito operativo
Más allá de la nómina (Payroll Vault), este hub gestiona el ciclo de vida del talento: reclutamiento, evaluaciones 360, control de ausencias (vacaciones, bajas médicas) y registro de jornadas de tiempo. Construye el "Digital Twin" (Gemelo Digital) del empleado en la organización.

## 3. Quién lo usa
- Especialistas en Selección y Reclutamiento.
- HR Business Partners.
- Todos los empleados (Autogestión de permisos).
- Supervisores (Para aprobar vacaciones o evaluar).

## 4. Qué ve el usuario al entrar por primera vez
- **El Empleado:** Su portal personal (Mi Perfil) con saldo de días de vacaciones, historial de feedback, y botón de "Picar entrada/salida" si corresponde.
- **HR Admin:** El organigrama completo (Org Chart), alertas de contratos por vencer y dashboard de clima laboral.

## 5. Qué puede hacer
- Solicitar y aprobar vacaciones o permisos (Time Off).
- Realizar y registrar Evaluaciones de Desempeño periódicas.
- Iniciar procesos de Reclutamiento (ATS - Applicant Tracking System) y seguimiento de candidatos.
- Controlar turnos y marcajes horarios.

## 6. Qué no puede hacer
- Un empleado no puede aprobarse sus propias ausencias, requiere flujo jerárquico.
- Borrar el historial de desempeño (Asegura transparencia frente a litigios laborales).

## 7. Qué ayudas necesita el administrador de tenant
- Configuración de bolsas de horas libres (Ej: 30 días naturales vs 22 días laborables por país).
- Definir la matriz jerárquica: Quién es jefe de quién, ya que esto rige el motor de aprobaciones.

## 8. Problemas o dudas frecuentes
- **"Solicité vacaciones y a mi jefe no le llegó aviso"**: El `Contact` del empleado no tiene asignado correctamente su campo `managerId`.
- **"El reloj de control de horario falló"**: Validar que la restricción de Geocerca (GPS/IP) no esté bloqueando el marcaje desde el móvil del empleado.

## 9. Reglas de jerarquía y seguridad
- Visibilidad Asimétrica: Un manager puede ver los historiales disciplinarios de sus reportes directos, pero no los salarios (Salvo que tenga permisos de Payroll explícitos). Los empleados solo ven lo suyo.

## 10. Flujo normal de uso (Ausencias)
1. El empleado abre su app móvil Volkern y pide "Vacaciones del 10 al 15".
2. El sistema verifica si tiene saldo positivo en la bolsa de horas anual.
3. El Manager recibe la notificación en el "Comms Hub" y presiona "Aprobar".
4. El sistema ajusta el calendario, marca al empleado como `AWAY` para esas fechas.
5. El sistema notifica al Orquestador (Producción/Ventas) que ese talento no estará disponible para asignar cargas de trabajo esos días.

## 11. Indicadores operativos importantes
- ENPS (Employee Net Promoter Score).
- Tasa de Ausentismo.
- Tiempo promedio para Contratar (Time to Fill).

## 12. Escalamiento cuando algo falla
1. Alertas de nómina: Si las horas no cuadran al final del mes, el manager debe forzar un override manual en el marcaje antes del "Sellado de Nómina".

---

### Resumen para soporte y administración
1. **La Estructura Organizativa es Clave:** Si el Organigrama es un caos, los flujos de aprobación (vacaciones, viáticos) colapsarán. Mantenlo actualizado.
2. **Entrelazado de Tiempo y Dinero:** Las ausencias injustificadas calculadas aquí impactarán directamente el cálculo automático en el Payroll Vault.
3. **Historial Inmutable:** Los reportes disciplinarios y las bajas deben documentarse aquí a fondo, pues alimentan la protección legal de la empresa.
4. **Autoservicio:** El objetivo de HR no es registrar papelería. Capacita a tu personal para que pidan sus constancias laborales y vacaciones directo desde su portal.
5. **Onboarding Digital:** Al dar de alta un talento nuevo, dispárale un flujo que lo mande automáticamente al "Academy Hub" para sus primeros cursos mandatorios.
