# 1. Primer Ingreso a la Plataforma

## 1. Nombre del hub
Génesis / Primer Ingreso (Autenticación y Onboarding).

## 2. Propósito operativo
Asegurar que cada usuario ingrese al ecosistema correcto (Tenant), con el rol adecuado y cumpliendo con las políticas de seguridad (Master Key / Vault) antes de ser redirigido a su área de trabajo correspondiente.

## 3. Quién lo usa
- Usuarios nuevos que reciben una invitación.
- Personal recurrente iniciando sesión.
- Administradores de Tenant (SuperAdmins) configurando parámetros iniciales.

## 4. Qué ve el usuario al entrar por primera vez
1. **Pantalla de Login Central:** Solicita credenciales y el "Tenant Slug" (Identificador único de empresa).
2. **Onboarding (Génesis):** Si es la primera vez que el Tenant se inicializa, el Administrador ve un asistente (Wizard) para configurar el ADN operativo, bóveda de seguridad (Vault) y anclaje GPS.
3. **Redirección de Hub:** Una vez autenticado, el usuario ve la pantalla principal (Dashboard) del Hub al que su rol tiene acceso predominante (por ejemplo, un Vendedor aterriza en el Hub de Ventas).

## 5. Qué puede hacer
- Iniciar sesión utilizando sus credenciales corporativas vinculadas al Tenant.
- Completar el flujo de "Onboarding" (exclusivo del administrador principal) para configurar la clave maestra.
- Aceptar invitaciones de ingreso.

## 6. Qué no puede hacer
- No puede acceder a datos sin especificar correctamente el Tenant.
- Un usuario base no puede alterar el "DNA" operativo o generar la llave maestra.
- No puede acceder a Hubs que no estén asignados a su rol (verá pantallas bloqueadas o simplemente no verá el botón en el menú lateral).

## 7. Qué ayudas necesita el administrador de tenant
- Instrucciones sobre cómo resguardar de forma segura la "Master Key" durante el proceso Génesis.
- Ayuda para comprender cómo asignar roles iniciales a su personal de apoyo.
- Enlace directo a soporte si ocurre un error 500 debido a credenciales corruptas o claves desincronizadas.

## 8. Problemas o dudas frecuentes
- **"El sistema dice 'Invalid Tenant'"**: El usuario está escribiendo mal el slug de la empresa.
- **"Error de integridad en MASTER_KEY"**: La clave maestra encriptada no coincide. Requiere re-sincronización en la base de datos por el administrador principal.
- **"Me redirige a una pantalla en blanco"**: El usuario no tiene ningún rol asignado o no tiene Hubs permitidos.

## 9. Reglas de jerarquía y seguridad
- **Tenant:** Es la frontera de hierro. Ningún usuario puede ver datos de otro Tenant.
- **Master Key / Vault:** Operaciones críticas requieren que el Vault esté desbloqueado y validado en la sesión activa.
- **Rol:** Define qué Hubs se iluminan en el menú lateral.

## 10. Flujo normal de uso
1. El usuario navega a la URL de acceso.
2. Introduce credenciales (Email + Password) y el Slug del Tenant.
3. El sistema valida (Verificando Bóveda Criptográfica si aplica).
4. El sistema busca el Rol del usuario.
5. El usuario es redirigido automáticamente al Hub (Dashboard) configurado por defecto para ese Rol.

## 11. Indicadores operativos importantes
- Tasa de éxito en el login.
- Alertas de intentos fallidos (prevención de fuerza bruta).
- Fallas de validación criptográfica de sesión.

## 12. Escalamiento cuando algo falla
1. Validar el Slug del Tenant.
2. Comprobar en base de datos si el usuario tiene `contactId` y `roles` asignados.
3. Enviar ticket a Soporte Técnico (Nivel 2) si hay un error persistente de Vault/MasterKey.

---

### Resumen para soporte y administración
1. **El Slug del Tenant es vital:** Sin él, el usuario no existe.
2. **El "Proceso Génesis" es único:** Sólo ocurre una vez por Tenant para sellar la base criptográfica.
3. **El redireccionamiento es por Rol:** Si un usuario no llega al lugar correcto, revisa sus roles en el Hub de HR/Roles.
4. **Error 500 en login:** Usualmente significa una desincronización de la Master Key; verifica el Vault.
5. **Permisos de visualización:** Los Hubs en el menú lateral son dinámicos y dependen enteramente del rol autorizado en la base de datos.
