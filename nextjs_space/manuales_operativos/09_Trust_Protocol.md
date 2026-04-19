# 9. Trust Protocol / Auditoría

## 1. Nombre del hub
Trust Protocol (Cumplimiento Fiscal y Auditoría Integral).

## 2. Propósito operativo
Fungir como la "Caja Negra" inmutable de todas las operaciones del ecosistema Volkern. Asegura que ninguna factura se altere sin dejar rastro (Cumplimiento VeriFactu), consolida los registros de quién hizo qué (`SalesOrderAudit`) y por qué la Inteligencia Artificial tomó decisiones (`AiDecisionLog`), garantizando evidencia forense.

## 3. Quién lo usa
- Oficiales de Cumplimiento (Compliance Officers).
- Auditores Externos o Fiscales.
- Administradores de Tenant (SuperAdmins) para resolución de disputas.

## 4. Qué ve el usuario al entrar por primera vez
- **Dashboard de Integridad:** Un panel con semáforos (Verde/Rojo) sobre el estado de la Cadena de Bloques Fiscal (VeriFactu Chain) y la sincronización de la Bóveda (Vault).
- Buscador Forense: Filtros para rastrear operaciones por ID de usuario, transacción, o AI.
- Visor del **AiDecisionLog**: Para investigar "Por qué la IA sugirió descontar un 10% a este cliente".

## 5. Qué puede hacer
- Buscar y exportar registros inmutables de facturación.
- Auditar la cadena de hashes (`parentFingerprint` -> `currentFingerprint`) para asegurar que no hay facturas "fantasma" o borradas.
- Verificar el registro de cualquier modificación a precios, permisos o roles críticos.

## 6. Qué no puede hacer
- **Nadie, ni siquiera un SuperAdmin, puede "Borrar" un registro de este Hub.** Todo es de solo-lectura (Read-Only) por diseño.
- No puede alterar retrospectivamente un hash de facturación para "arreglar" un error contable. Si hay error, se hace nota de crédito, pero el hash queda.

## 7. Qué ayudas necesita el administrador de tenant
- Soporte técnico complejo si el "Semáforo VeriFactu" se pone rojo, indicando una fisura en la cadena de bloques (Chain Breach).
- Entendimiento de las leyes fiscales de envío automático a entidades gubernamentales (como Hacienda en España).

## 8. Problemas o dudas frecuentes
- **"El auditor fiscal me pide evidencia de la correlación de facturas"**: El administrador solo debe descargar el reporte del Trust Protocol, que incluye las firmas criptográficas anidadas.
- **"El vendedor jura que no bajó el precio"**: En el buscador forense aparecerá la fecha, IP, y sesión de quién aplicó un descuento, o si fue una acción autónoma de Gemma (IA).

## 9. Reglas de jerarquía y seguridad
- **Segregación de Deberes:** Solo el rol más alto (`SuperAdmin` o `Compliance`) tiene acceso a este Hub.
- **Integridad:** Las escrituras a esta base de datos ocurren de manera asíncrona a través de eventos blindados desde el resto de Hubs.

## 10. Flujo normal de uso
1. Un Administrador recibe un reclamo o una auditoría de hacienda.
2. Ingresa al Trust Protocol.
3. Busca el "Entity ID" (Factura, Pedido o Empleado) en el visor forense.
4. Descarga la evidencia de "AiDecisionLog" o el Árbol de Auditoría.
5. Emite un reporte certificado, imposible de repudiar.

## 11. Indicadores operativos importantes
- Estado del Hash Fiscal (Chain Integrity Status).
- Total de intervenciones de IA bloqueadas por baja confianza (<70% Confidence Score).
- Anomalías de firmas en el Payroll Vault.

## 12. Escalamiento cuando algo falla
1. Una rotura en la cadena VeriFactu (`parentFingerprint` perdido) requiere una intervención inmediata del nivel 3 (Ingeniería).
2. Si el log de auditoría deja de sincronizarse, reiniciar los listeners del bus de eventos.

---

### Resumen para soporte y administración
1. **Es el seguro de vida del negocio:** Volkern garantiza la confianza porque no permite la manipulación post-venta. Este Hub lo demuestra matemáticamente.
2. **AI Auditability:** A diferencia de otras herramientas, aquí la IA no actúa "en la sombra". Todo lo que recomienda u orquesta Gemma queda atestiguado en el `AiDecisionLog`.
3. **VeriFactu Compliance:** Es el pilar legal para la emisión de facturas en Europa/LATAM de manera regulada.
4. **Acceso Restringido Extremo:** No des este rol a supervisores comerciales, es material estrictamente financiero y legal.
5. **No hay Botón de Edición:** Por diseño arquitectónico, el Trust Protocol es la memoria inquebrantable de la compañía.
