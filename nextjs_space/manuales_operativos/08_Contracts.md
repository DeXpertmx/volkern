# 8. Contracts

## 1. Nombre del hub
Gestión y Cumplimiento de Contratos (Contracts Vault).

## 2. Propósito operativo
Centralizar, redactar, y firmar de manera jurídicamente vinculante cualquier acuerdo entre el Tenant y sus clientes, empleados o proveedores. Administra renovaciones y almacena las firmas digitales y evidencias criptográficas.

## 3. Quién lo usa
- Departamento Legal y Compliance.
- Equipo Comercial (para cierre de Acuerdos B2B).
- Equipo de Recursos Humanos (Contratos Laborales).

## 4. Qué ve el usuario al entrar por primera vez
- **Repositorio Contractual:** Visor de contratos Activos, Pendientes de Firma, y Expirados o a punto de renovarse.
- Creador de Plantillas (Templates) para acuerdos estándar (Ej: NDAs, Acuerdos de Servicio B2B).

## 5. Qué puede hacer
- Generar un nuevo contrato usando una plantilla pre-aprobada y poblarla con los datos del CRM (Cliente, Fechas, Valores).
- Despachar invitaciones de "Firma Electrónica" a terceros.
- Firmar documentos de forma interna utilizando la Autoridad Certificadora de Volkern.
- Monitorear el estado de vigencia y programar alarmas de renovación (Renegociación).

## 6. Qué no puede hacer
- **No puede alterar el contenido de un contrato una vez que se ha recopilado la primera firma.** (La inmutabilidad se sella en el momento que alguien firma).
- No puede borrar un documento firmado del repositorio sin dejar un rastro de auditoría de eliminación lógica.

## 7. Qué ayudas necesita el administrador de tenant
- Soporte en la carga inicial de machotes (Templates) legales.
- Ayuda para comprender cómo Volkern garantiza la validez de la firma electrónica frente a reguladores.

## 8. Problemas o dudas frecuentes
- **"Envié el contrato pero el cliente dice que el enlace no funciona"**: El token de firma suele expirar en 7 días por seguridad. Reenviar invitación.
- **"¿Cómo edito un contrato firmado con un error?"**: Imposible. Se debe ejecutar una "Anulación" (Void) y generar un nuevo documento o crear una Adenda.

## 9. Reglas de jerarquía y seguridad
- Nivel de acceso altamente compartimentado. Un vendedor ve sus contratos de venta, pero NO ve los contratos de HR.
- **Integridad:** Cada versión firmada incluye un Hash de integridad que Volkern ancla temporalmente.

## 10. Flujo normal de uso
1. Se negocia un gran acuerdo B2B en Ventas.
2. Se genera el Contrato vinculando al `Contact` y `Tenant`.
3. Se distribuye el correo mágico de firma a todas las partes.
4. Partes hacen clic, leen y "Firman Digitalmente".
5. El sistema sella el documento, emite un PDF final inmutable con certificados y notifica que el contrato está `ACTIVE`.

## 11. Indicadores operativos importantes
- Tiempos promedio de cierre (firma) de contratos.
- Volumen de Riesgo Contractual (Contratos por vencer en los próximos 30 días).
- Tasa de rechazo o anulación de contratos.

## 12. Escalamiento cuando algo falla
1. Problemas de Renderizado PDF (Documentos en blanco): Revisar los tags del template y el motor de PDF de fondo.
2. Discrepancias de certificados de firma: Involucrar al equipo de Trust Protocol.

---

### Resumen para soporte y administración
1. **Garante de Inmutabilidad:** En el mundo legal, modificar un byte invalida el documento. Por eso Volkern lo bloquea una vez iniciada la firma.
2. **Plantillas = Eficiencia:** Invertir tiempo en crear buenos templates ("Machotes") evita que los vendedores redacten cláusulas manuales que asuman riesgo no aprobado.
3. **Visibilidad Cruzada:** El Hub Contracts es el "cajón de documentos" donde otros Hubs depositan papeles importantes.
4. **Renovación Activa:** Las alertas del dashboard de Contratos son oro para el equipo comercial para retener clientes antes de que caduquen.
5. **No hay "ctrl-Z" tras la firma:** Para corregir, la vía legal en el ecosistema es Anular y Crear Nuevo, o crear una Adenda asociada.
