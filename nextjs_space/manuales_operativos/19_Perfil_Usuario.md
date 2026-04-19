# 19. Perfil de Usuario y Preferencias Personales

## 1. Nombre del hub
Mi Perfil (User Profile & Security).

## 2. Propósito operativo
Permitir a cada individuo de la plataforma (empleado, vendedor, manager) gestionar sus preferencias personales, configuración de cuenta y la seguridad de su sesión independiente de las reglas globales del Tenant.

## 3. Quién lo usa
- Todos los usuarios registrados en Volkern (Contactos con login válido).

## 4. Qué ve el usuario al entrar por primera vez
- Resumen de sus datos personales (Nombre, Puesto, Email de login).
- Centro de Seguridad (Cambio de contraseña, MFA/2FA).
- Centro de Preferencias (Idioma, Tema Oscuro/Claro, Frecuencia de Notificaciones).
- Su avatar y foto de perfil.

## 5. Qué puede hacer
- Subir una foto de perfil (Que verán sus compañeros en chats y comentarios).
- Cambiar su contraseña personal.
- Habilitar Autenticación de Dos Factores (2FA) escaneando un código QR.
- Silenciar notificaciones por correo (Opt-out) en caso de sobrecarga.
- Cambiar el idioma de su interfaz local (Si la empresa lo permite).

## 6. Qué no puede hacer
- **No puede cambiarse el rol a sí mismo** (No puede promoverse de 'Vendedor' a 'SuperAdmin').
- No puede modificar sus propios salarios o condiciones laborales (Eso pertenece a HR Hub).
- No puede cambiar la moneda base en la que el sistema procesa.

## 7. Qué ayudas necesita el administrador de tenant
- Asistir a usuarios que han perdido su dispositivo 2FA y necesitan un "Reseteo de 2FA".
- Asistir en reseteos de contraseña (Password Reset Link).

## 8. Problemas o dudas frecuentes
- **"Olvidé mi contraseña"**: Si no tiene sesión, el usuario debe usar el enlace "Forgot Password" del login base. Si tiene sesión, puede cambiarla desde este Hub siempre y cuando sepa la actual.
- **"No recibo notificaciones"**: Generalmente el usuario desmarcó accidentalmente las casillas en el Centro de Preferencias.
- **"Mi foto no se sube"**: El archivo excede el tamaño máximo permitido (Ej: 2MB).

## 9. Reglas de jerarquía y seguridad
- **Seguridad Soberana:** Incluso si eres un Administrador, no puedes ver la contraseña de los usuarios; los hashes bcrypt se alojan de manera segura en el Core.
- El 2FA, cuando es activado por el usuario o forzado por la política de la empresa, es el mejor mitigador contra robo de credenciales.

## 10. Flujo normal de uso
1. Empleado es dado de alta por HR. Recibe email y entra al sistema.
2. Inmediatamente va a "Mi Perfil", sube una foto sonriendo.
3. Activa 2FA por indicación de su departamento de sistemas, escanea el QR con su móvil (Google Authenticator).
4. Elige "Tema Oscuro" para aliviar fatiga visual y guarda los cambios.
5. Inicia su jornada laboral en sus Hubs respectivos.

## 11. Indicadores operativos importantes
- Porcentaje de usuarios que han habilitado el 2FA.
- Volumen de tickets de soporte por reseteo de contraseñas.

## 12. Escalamiento cuando algo falla
1. Si el 2FA de un usuario se desincroniza totalmente, un SuperAdmin desde el panel del Hub Core/HR debe buscar el registro de sesión y presionar "Remove 2FA", obligando al usuario a volver a configurarlo.

---

### Resumen para soporte y administración
1. **Promueve el 2FA:** Más del 80% de los hackeos en SaaS ocurren por contraseñas débiles. Haz obligatorio el 2FA desde la configuración global para forzar a los usuarios a usar este Hub.
2. **Personalización Local:** El idioma y tema (Light/Dark) alivianan el uso de la app. Un vendedor cansado comete errores, cuidar la ergonomía visual importa.
3. **Gestión de Estrés por Notificación:** Si un empleado se queja de "Mucho ruido de emails", dirígelo a su centro de preferencias para que las apague y solo use la campanita in-app (Comms Hub).
4. **La Foto Humaniza:** Fomentar fotos de perfiles reales agiliza la adopción interna, especialmente cuando interactúan a través de comentarios en facturas y procesos.
5. **No Intervengas Directamente:** Como admin, no puedes "editar" la vida digital personal de un empleado; si olvidan sus datos, siempre manda el enlace automatizado de recuperación. No cambies contraseñas a mano.
