# 18. Configuración del Tenant y Preferencias Maestras

## 1. Nombre del hub
Configuración Global del Tenant (Tenant Settings).

## 2. Propósito operativo
Actúa como el panel de control maestro para la organización entera. Aquí se configuran los parámetros "por defecto" que dictan cómo operan los demás módulos (Ej: Zona horaria, logo de la empresa, impuestos estándar, políticas de margen). Es el ADN no-criptográfico de la empresa.

## 3. Quién lo usa
- SuperAdmins.
- Administradores del Sistema.
- Directores Financieros (Para definir los umbrales de impuestos).

## 4. Qué ve el usuario al entrar por primera vez
- Formulario de **Branding de la Empresa**: Logo, colores corporativos, dominio web y correos de contacto oficiales.
- Pestañas de Preferencias Regionales (Timezone, Moneda Base).
- Pestaña Fiscal: Configuraciones por defecto como `defaultIva` y `defaultIrpf`.
- Políticas de Seguridad: Configuraciones de expiración de sesiones y caducidad de contraseñas.

## 5. Qué puede hacer
- Cambiar la marca comercial que los clientes ven en los PDFs de facturas, correos y en el Portal de Miembros.
- Ajustar la Moneda Base del Tenant (Si la cambias de EUR a USD, no recalcula el historial, pero afecta a las ventas nuevas).
- Ajustar el límite base del **Margin Guard** (Ej: Elevar la política de rentabilidad mínima del 5% al 10%).

## 6. Qué no puede hacer
- **No puede cambiar el "Tenant Slug"**. Ese es un identificador inmutable en la base de datos usado para enrutar usuarios.
- No puede alterar la Master Key o Vault desde aquí (El proceso de rescate de llaves es de consola/servidor, no web).

## 7. Qué ayudas necesita el administrador de tenant
- Soporte para subir imágenes en resoluciones y formatos óptimos (PNG/SVG) para evitar que los PDF se vean distorsionados.
- Ayuda de soporte nivel 3 si necesitan hacer una migración total de Tenant Slug (Procedimiento excepcional).

## 8. Problemas o dudas frecuentes
- **"Mis vendedores no pueden vender nada, el Margin Guard bloquea todo"**: Seguramente el SuperAdmin subió el límite de margen aquí en la configuración a un valor irreal, afectando a todo el Hub de Ventas en cascada.
- **"Las fechas en los contratos salen un día desfasadas"**: La zona horaria del Tenant no coincide con el país real de operaciones.

## 9. Reglas de jerarquía y seguridad
- Solo un `SuperAdmin` tiene acceso de escritura a este módulo. Un administrador básico podrá, acaso, ver los parámetros sin editarlos.

## 10. Flujo normal de uso
1. Durante el "Onboarding", el SuperAdmin define su logo, nombre fiscal, moneda `EUR` y huso horario `Europe/Madrid`.
2. Tres meses después, las leyes fiscales de su país suben el IVA.
3. El SuperAdmin ingresa al hub, va a la pestaña Fiscal, y cambia `defaultIva` de 21.0 a 22.0.
4. Instantáneamente, todas las nuevas cotizaciones y facturas aplicarán la nueva regla de forma global.

## 11. Indicadores operativos importantes
- Estado del perfil de Tenant (100% completado = Logo, NIF y Políticas definidos).
- Historial de cambios en políticas de margen.

## 12. Escalamiento cuando algo falla
1. Si un cambio en el branding no se refleja en el Portal, pedir a los usuarios forzar refresco (borrar cache), o invalidar la caché CDN de Vercel/NextJS si el tenant está servido estáticamente.

---

### Resumen para soporte y administración
1. **Configuración en Cascada:** Lo que pones aquí afecta a toda la empresa. Piensa antes de cambiar un impuesto maestro.
2. **Branding Consistente:** Las configuraciones de colores y logo son lo primero que ve tu cliente al abrir el portal; mantenlas profesionales.
3. **Timezones:** Ignorar la zona horaria aquí causará problemas y discrepancias en los registros de auditoría y vencimientos de firmas.
4. **Respaldo de Auditoría:** Si alguien te pregunta por qué una venta se bloqueó hace un año, el registro histórico te dirá que el margen permitido en ese momento era distinto.
5. **Autosuficiencia Admin:** El objetivo es que la empresa no tenga que llamar a "IT" o al proveedor del software solo para subir una nueva versión del logo institucional.
