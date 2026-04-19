# 7. HR / Nómina / Beneficios

## 1. Nombre del hub
Centro de Talento y "Payroll Vault" (Nómina y Beneficios).

## 2. Propósito operativo
Gestionar de manera integral al personal: desde la estructura organizacional (roles y permisos), altas y bajas, hasta la ejecución infalible y encriptada de la nómina (Payroll Vault), calculando sueldos base, bonos, comisiones e impuestos retenidos.

## 3. Quién lo usa
- Gerentes de Recursos Humanos (HR).
- Administradores Financieros / Contadores (para firmar el Payroll Vault).
- Empleados (Portal de auto-consulta de recibos).

## 4. Qué ve el usuario al entrar por primera vez
- **Directorio Activo:** Lista de `Contacts` marcados como `isEmployee` y sus asignaciones.
- **Payroll Dashboard:** Calendario de cierres de nómina, total estimado de dispersión salarial y alertas de comisiones pendientes por verificar.
- **Roles & Permissions:** Matriz de control de acceso al sistema (Qué ve quién).

## 5. Qué puede hacer
- Dar de alta nuevos empleados e invitarlos al ecosistema.
- Asignar o revocar "Roles" que encienden o apagan el acceso a otros Hubs.
- Gestionar ingresos variables (comisiones atadas a las ventas del Hub CRM).
- Generar corridas de nómina, calcular deducciones fiscales (SS, IRPF) y aplicar firmas digitales para cerrar y dispersar.

## 6. Qué no puede hacer
- **Un analista de HR estándar no puede "Firmar y Sellar" una nómina definitiva.** Esto requiere el criptograma (Master Key) de un directivo.
- **No puede alterar una nómina ya sellada.** Cualquier cambio retroactivo requerirá un movimiento de corrección en el mes siguiente.

## 7. Qué ayudas necesita el administrador de tenant
- Configurar adecuadamente las tasas impositivas por default (`defaultIrpf`, cuotas patronales).
- Entender el vínculo entre una venta "Cerrada y Pagada" en el Hub de Ventas y cómo se calcula automáticamente como bono variable en este Hub.

## 8. Problemas o dudas frecuentes
- **"El vendedor no recibió su comisión"**: Generalmente ocurre si la factura (`Invoice`) asociada en el hub de Finanzas no ha sido marcada como `PAID`.
- **"No me deja cerrar la nómina"**: Faltan datos críticos como el NIF/CIF válido del empleado o el Vault detectó una anomalía matemática de seguridad.
- **"Me da error 403 al asignar roles"**: Necesitas privilegios de `SuperAdmin` para modificar los accesos base de otros.

## 9. Reglas de jerarquía y seguridad
- **Roles:** El Hub de HR es el motor que da vida a la seguridad de la plataforma. Modificar roles equivale a modificar la visibilidad de datos.
- **Vault Financiero:** Las corridas de nómina requieren un modelo de "Doble Firma" (Aprobador 1 + Ejecutor Master).

## 10. Flujo normal de uso (Cierre de Nómina)
1. Fin de mes: El sistema recolecta los sueldos base.
2. El sistema consulta las ventas y genera los Bonos Variables automáticos.
3. El responsable de HR añade bonos/deducciones manuales (`manualBonus`).
4. El sistema calcula las deducciones obligatorias.
5. El Director revisa el "Payroll Vault", lo aprueba e inyecta la firma criptográfica.
6. El sistema genera los recibos PDF (payslips) inmutables y los publica en el portal de los empleados.

## 11. Indicadores operativos importantes
- Costo Total de Nómina (Tendencias mes a mes).
- Rotación de Personal.
- Efectividad de pago de Comisiones vs Ventas Totales.

## 12. Escalamiento cuando algo falla
1. Problemas fiscales o de deducciones: Revisar las tablas maestras de IRPF.
2. Inconsistencias de roles de acceso: Desconectar al usuario y revisar la tabla pivote de Roles.
3. Fallo de sellado de nómina: Soporte de nivel 2 para validar la integridad del Vault Criptográfico.

---

### Resumen para soporte y administración
1. **Punto Único de Verdad de Accesos:** Si alguien no puede entrar a la plataforma o a un Hub, este es el lugar para revisarlo.
2. **Nómina Automatizada pero Auditada:** El sistema facilita el cálculo con datos del CRM, pero NADA se envía sin un clic explícito y firma digital de aprobación final.
3. **Comisiones Atadas a Recaudo:** Un vendedor puede vender mucho, pero la comisión automática solo detona si hay facturas pagadas (previniendo desfalcos de caja).
4. **La Privacidad es Ley:** Ni siquiera un administrador de Ventas puede ver la nómina de su equipo a menos que tenga el rol financiero.
5. **Inmutabilidad del Payslip:** Una vez sellada la nómina, el documento generado queda anclado criptográficamente para auditorías fiscales.
