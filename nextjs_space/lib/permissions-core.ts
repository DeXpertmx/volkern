/**
 * Reglas de permisos, sin acceso a datos.
 *
 * Vive aparte de `lib/permissions.ts` por una razón concreta: la interfaz tiene
 * que decidir si muestra una acción con **la misma** regla que decide si la API
 * la acepta. Si el navegador reimplementara la comprobación, bastaría con que
 * una de las dos cambiara para que la interfaz ofreciera botones que el backend
 * rechaza (o escondiera acciones que sí están permitidas).
 *
 * Este módulo no importa `@/lib/db` ni nada de servidor: se puede usar desde un
 * componente de cliente. Las funciones que sí tocan la base siguen en
 * `lib/permissions.ts`, que reexporta todo lo de aquí para no romper a nadie.
 */


/**
 * Sistema de permisos y roles para Volkern CRM
 * 
 * Este módulo gestiona los permisos de usuario basados en roles
 * y proporciona funciones de verificación de permisos.
 */


// Tipos de permisos
export type PermissionModule = 
  | 'leads' 
  | 'citas' 
  | 'estudiantes' 
  | 'cursos' 
  | 'automatizaciones' 
  | 'campanas' 
  | 'ads'
  | 'mensajes' 
  | 'analytics' 
  | 'configuracion' 
  | 'equipo' 
  | 'whitelabel' 
  | 'telefonia'
  | 'pages'
  // Hospitality: capacidades del módulo de alojamiento. Están separadas en
  // cuatro áreas porque son cuatro trabajos distintos en una propiedad real
  // (quien recibe reservas no es necesariamente quien limpia, ni quien
  // configura los canales, ni quien ve el dinero).
  | 'hospitality_reservas'
  | 'hospitality_operaciones'
  | 'hospitality_mantenimiento'
  | 'hospitality_integraciones'
  | 'hospitality_finanzas'
  | 'hospitality_comunicaciones'
  | 'hospitality_automatizaciones'
  // El huésped no ve el módulo de reservas del alojamiento recortado: ve el
  // suyo. Es un módulo aparte a propósito, para que conceder "ver reservas"
  // —las del tenant entero— nunca sea el camino para dar acceso a un huésped.
  | 'hospitality_misreservas';

export type PermissionAction = 
  | 'ver' 
  | 'crear' 
  | 'editar' 
  | 'eliminar' 
  | 'asignar' 
  | 'exportar' 
  | 'gestionar' 
  | 'inscribir' 
  | 'publicar' 
  | 'activar' 
  | 'enviar' 
  | 'responder' 
  | 'invitar'
  // Cancelar no es eliminar: la reserva cancelada sigue existiendo, con su
  // historial y sus pagos. Confundirlas haría que quien puede borrar borre
  // sin dejar rastro, y que quien solo corrige una reserva pueda anularla.
  | 'cancelar'
  // Alcance, no acceso: `ver` abre un módulo, `ver_todos` decide si además se
  // ve todo lo de la cuenta o solo lo propio. Sin ella, un comercial entra al
  // pipeline y ve los leads que tiene asignados. Está separada de `ver` porque
  // conceder el módulo no debería conceder los datos de los demás.
  | 'ver_todos'
  // Entregar las llaves no es limpiar la habitación, ni configurar un canal es
  // firmar en nombre del propietario, ni ver una reserva es ver el pasaporte
  // del huésped. Cada una de estas acciones se concede por separado.
  | 'checkin'
  | 'administrar'
  | 'documento_completo'
  | 'roles';

export interface ModulePermissions {
  [action: string]: boolean;
}

// Todos los módulos conocidos por el sistema. Usado por getVisibleModules
// cuando el rol usa el wildcard { all: true }.
export const ALL_PERMISSION_MODULES: PermissionModule[] = [
  'leads',
  'citas',
  'estudiantes',
  'cursos',
  'automatizaciones',
  'campanas',
  'ads',
  'mensajes',
  'analytics',
  'configuracion',
  'equipo',
  'whitelabel',
  'telefonia',
  'pages',
  'hospitality_reservas',
  'hospitality_operaciones',
  'hospitality_mantenimiento',
  'hospitality_integraciones',
  'hospitality_finanzas',
  'hospitality_comunicaciones',
  'hospitality_automatizaciones',
  'hospitality_misreservas',
];

export interface RolePermissions {
  [module: string]: ModulePermissions;
}

export interface UserWithRole {
  id: string;
  roleId: string | null;
  tenantId: string | null;
  role?: {
    id: string;
    nombre: string;
    // `unknown` y no `any`: el rol viene de Prisma como JSON, y aquí solo se lee.
    // Pedir el tipo exacto obligaba a cada capa a redeclararlo, y una de ellas
    // (`authenticateRequest`) ya lo declaraba opcional y rompía el tipado.
    permisos?: unknown;
  } | null;
}

/**
 * Verifica si un usuario tiene un permiso específico
 */
export function hasPermisoDeRol(
  role: UserWithRole['role'],
  module: PermissionModule,
  action: PermissionAction
): boolean {
  if (!role) {
    return false;
  }

  // Superadmin tiene todos los permisos
  if (role.nombre === 'Superadmin') {
    return true;
  }

  // Permisos pueden venir como shape por módulo ({ leads: { ver: true } })
  // o con wildcard ({ all: true }, usado por scripts/bootstrap-admin.ts).
  const permissions = role.permisos as Record<string, unknown>;

  if (!permissions) {
    return false;
  }

  // Wildcard { all: true } = acceso total a todos los módulos. Sin esto, los
  // admins creados con ese shape recibían 403 en rutas como GET /api/deals
  // (hasPermission('leads','ver')).
  if (permissions.all === true) {
    return true;
  }

  const modulePerms = permissions[module];
  if (modulePerms === undefined) {
    return false;
  }

  // Módulo concedido entero (permisos[module] === true)
  if (modulePerms === true) {
    return true;
  }

  return (modulePerms as ModulePermissions)[action] === true;
}

/**
 * Comprueba si el usuario (con su rol) tiene un permiso.
 *
 * Es la puerta del servidor: exige que venga un usuario. La interfaz, que no
 * tiene usuario sino el rol de la sesión, usa `hasPermisoDeRol` directamente
 * —la misma lógica, no una copia—.
 */
export function hasPermission(
  user: UserWithRole | null,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  if (!user || !user.role) {
    return false;
  }

  return hasPermisoDeRol(user.role, module, action);
}

/**
 * Verifica si un usuario puede ver un módulo completo
 */
export function canViewModule(
  user: UserWithRole | null,
  module: PermissionModule
): boolean {
  return hasPermission(user, module, 'ver');
}

/**
 * Obtiene todos los módulos visibles para un usuario
 */
export function getVisibleModules(user: UserWithRole | null): PermissionModule[] {
  if (!user || !user.role) {
    return [];
  }

  const permissions = user.role.permisos as Record<string, unknown>;
  
  if (!permissions) {
    return [];
  }

  // Wildcard { all: true } = todos los módulos visibles
  if (permissions.all === true) {
    return ALL_PERMISSION_MODULES;
  }

  return Object.keys(permissions).filter(module => {
    const perms = permissions[module];
    return perms === true || (perms as ModulePermissions)?.ver === true;
  }) as PermissionModule[];
}

/**
 * Obtiene los permisos completos de un usuario
 */
export function getUserPermissions(user: UserWithRole | null): RolePermissions | null {
  if (!user || !user.role) {
    return null;
  }

  return user.role.permisos as RolePermissions;
}

/**
 * Verifica si un usuario pertenece al mismo tenant que un recurso
 */
export function isSameTenant(userTenantId: string | null, resourceTenantId: string | null): boolean {
  if (!userTenantId || !resourceTenantId) {
    return false;
  }

  return userTenantId === resourceTenantId;
}

/**
 * Verifica si un usuario puede gestionar a otro usuario
 */
export function canManageUser(
  currentUser: UserWithRole | null,
  targetUser: UserWithRole | null
): boolean {
  if (!currentUser || !targetUser) {
    return false;
  }

  // Debe pertenecer al mismo tenant
  if (!isSameTenant(currentUser.tenantId, targetUser.tenantId)) {
    return false;
  }

  // Debe tener permiso de equipo.editar o equipo.eliminar
  return hasPermission(currentUser, 'equipo', 'editar') || 
         hasPermission(currentUser, 'equipo', 'eliminar');
}

/**
 * Verifica si un usuario puede asignar leads
 */
export function canAssignLeads(user: UserWithRole | null): boolean {
  return hasPermission(user, 'leads', 'asignar');
}

/**
 * La llave del alcance completo del pipeline.
 *
 * Se declara aquí, y no suelta en cada sitio, porque la lee la regla de alcance
 * (`canOnlySeeOwnLeads`) y la reparte el paso de herencia
 * (`lib/roles-rollout.ts`): si una de las dos cambiara de acción, la herencia
 * copiaría una llave que nadie lee y el alcance se recortaría sin avisar.
 */
export const PERMISO_PIPELINE_COMPLETO = { modulo: 'leads', accion: 'ver_todos' } as const;

/**
 * Verifica si un usuario solo puede ver sus propios leads.
 *
 * El alcance es un permiso, no un nombre: `leads.ver` abre el pipeline y
 * `leads.ver_todos` concede verlo entero; sin esa segunda llave, quien entra ve
 * solo lo que tiene asignado. Antes esto se decidía por el nombre del rol
 * («Sales Agent», «Support»), así que renombrar el rol concedía o retiraba el
 * alcance sin que nadie lo hubiera pedido, y cualquier rol nuevo creado con esa
 * etiqueta heredaba la restricción.
 *
 * Devuelve `true` cuando no hay usuario o no hay rol: ante la duda, el alcance
 * recortado. La ruta que la usa ya exige `leads.ver` por separado.
 */
export function canOnlySeeOwnLeads(user: UserWithRole | null): boolean {
  return !hasPermission(
    user,
    PERMISO_PIPELINE_COMPLETO.modulo,
    PERMISO_PIPELINE_COMPLETO.accion
  );
}

/**
 * Obtiene los nombres de roles disponibles
 */
export const PREDEFINED_ROLES = [
  'Superadmin',
  'Admin',
  'Sales Agent',
  'Support',
  'Instructor',
] as const;

export type PredefinedRole = typeof PREDEFINED_ROLES[number];

/**
 * Obtiene la descripción de un rol
 */
export function getRoleDescription(roleName: string): string {
  const descriptions: Record<string, string> = {
    'Superadmin': 'Acceso total a todas las funcionalidades y configuración del sistema',
    'Admin': 'Gestión completa del CRM, usuarios y configuración',
    'Sales Agent': 'Gestión de leads, citas y comunicaciones',
    'Support': 'Atención al cliente, consultas de estudiantes y soporte',
    'Instructor': 'Gestión de cursos, estudiantes y contenido educativo',
  };

  return descriptions[roleName] || 'Rol personalizado';
}

