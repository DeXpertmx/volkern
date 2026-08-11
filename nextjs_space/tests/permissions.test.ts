import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  canViewModule,
  getVisibleModules,
  getUserPermissions,
  isSameTenant,
  canManageUser,
  canAssignLeads,
  canOnlySeeOwnLeads,
  PREDEFINED_ROLES,
  getRoleDescription,
  type UserWithRole,
  type RolePermissions,
} from '@/lib/permissions';

// ─── Fixtures ──────────────────────────────────────────────────────────
function makeUser(overrides: Partial<UserWithRole> = {}): UserWithRole {
  return {
    id: 'user-1',
    roleId: 'role-1',
    tenantId: 'tenant-a',
    role: {
      id: 'role-1',
      nombre: 'Admin',
      permisos: {
        leads: { ver: true, crear: true, editar: true, eliminar: false, asignar: false },
        citas: { ver: true, crear: true },
        analytics: { ver: true },
        equipo: { ver: true, editar: true, eliminar: false, invitar: true },
      },
    },
    ...overrides,
  };
}

// ─── hasPermission ─────────────────────────────────────────────────────
describe('hasPermission', () => {
  it('debe devolver true si el usuario tiene el permiso', () => {
    const user = makeUser();
    expect(hasPermission(user, 'leads', 'ver')).toBe(true);
    expect(hasPermission(user, 'leads', 'crear')).toBe(true);
    expect(hasPermission(user, 'citas', 'ver')).toBe(true);
  });

  it('debe devolver false si el usuario no tiene el permiso', () => {
    const user = makeUser();
    expect(hasPermission(user, 'leads', 'eliminar')).toBe(false);
    expect(hasPermission(user, 'leads', 'asignar')).toBe(false);
  });

  it('debe devolver false si el módulo no existe en permisos', () => {
    const user = makeUser();
    expect(hasPermission(user, 'mensajes', 'ver')).toBe(false);
  });

  it('debe devolver false si el usuario es null', () => {
    expect(hasPermission(null, 'leads', 'ver')).toBe(false);
  });

  it('debe devolver false si el usuario no tiene role', () => {
    const user = makeUser({ role: null });
    expect(hasPermission(user, 'leads', 'ver')).toBe(false);
  });

  it('Superadmin debe tener todos los permisos', () => {
    const user = makeUser({
      role: { id: 'r-super', nombre: 'Superadmin', permisos: {} },
    });
    expect(hasPermission(user, 'leads', 'ver')).toBe(true);
    expect(hasPermission(user, 'leads', 'eliminar')).toBe(true);
    expect(hasPermission(user, 'whitelabel', 'gestionar')).toBe(true);
  });

  it('Superadmin debe tener permiso incluso con permisos undefined', () => {
    const user = makeUser({
      role: { id: 'r-super', nombre: 'Superadmin', permisos: undefined as any },
    });
    expect(hasPermission(user, 'leads', 'ver')).toBe(true);
  });

  it('debe devolver false si role.permisos es null', () => {
    const user = makeUser({
      role: { id: 'r-1', nombre: 'Admin', permisos: null as any },
    });
    expect(hasPermission(user, 'leads', 'ver')).toBe(false);
  });

  it('debe manejar acción inexistente en el módulo', () => {
    const user = makeUser();
    expect(hasPermission(user, 'leads', 'exportar')).toBe(false);
  });

  it('debe conceder todo con el wildcard { all: true } (shape de bootstrap-admin)', () => {
    const user = makeUser({
      role: { id: 'r-all', nombre: 'Admin', permisos: { all: true } },
    });
    expect(hasPermission(user, 'leads', 'ver')).toBe(true);
    expect(hasPermission(user, 'leads', 'crear')).toBe(true);
    expect(hasPermission(user, 'deals', 'ver')).toBe(true);
    expect(hasPermission(user, 'configuracion', 'editar')).toBe(true);
    expect(hasPermission(user, 'whitelabel', 'gestionar')).toBe(true);
  });

  it('debe conceder módulo completo si permisos[module] es true', () => {
    const user = makeUser({
      role: { id: 'r-mod', nombre: 'Admin', permisos: { leads: true } as any },
    });
    expect(hasPermission(user, 'leads', 'ver')).toBe(true);
    expect(hasPermission(user, 'leads', 'eliminar')).toBe(true);
    expect(hasPermission(user, 'citas', 'ver')).toBe(false);
  });
});

// ─── canViewModule ─────────────────────────────────────────────────────
describe('canViewModule', () => {
  it('debe devolver true si el usuario tiene permiso ver del módulo', () => {
    const user = makeUser();
    expect(canViewModule(user, 'leads')).toBe(true);
    expect(canViewModule(user, 'analytics')).toBe(true);
  });

  it('debe devolver false si el usuario no tiene permiso ver del módulo', () => {
    const user = makeUser({
      role: {
        id: 'r-1',
        nombre: 'Sales Agent',
        permisos: { leads: { ver: true, crear: true }, citas: { ver: true } },
      },
    });
    expect(canViewModule(user, 'equipo')).toBe(false);
  });

  it('debe devolver false si el usuario es null', () => {
    expect(canViewModule(null, 'leads')).toBe(false);
  });
});

// ─── getVisibleModules ─────────────────────────────────────────────────
describe('getVisibleModules', () => {
  it('debe devolver los módulos con ver: true', () => {
    const user = makeUser();
    const modules = getVisibleModules(user);
    expect(modules).toContain('leads');
    expect(modules).toContain('citas');
    expect(modules).toContain('analytics');
    expect(modules).toContain('equipo');
    expect(modules).not.toContain('mensajes');
  });

  it('no debe incluir módulos con ver: false', () => {
    const user = makeUser({
      role: {
        id: 'r-1', nombre: 'Limited', permisos: {
          leads: { ver: true },
          citas: { ver: false, crear: true },
        },
      },
    });
    const modules = getVisibleModules(user);
    expect(modules).toContain('leads');
    expect(modules).not.toContain('citas');
  });

  it('debe devolver [] si el usuario es null', () => {
    expect(getVisibleModules(null)).toEqual([]);
  });

  it('debe devolver [] si el usuario no tiene role', () => {
    expect(getVisibleModules(makeUser({ role: null }))).toEqual([]);
  });

  it('debe devolver [] si permisos es null', () => {
    const user = makeUser({ role: { id: 'r-1', nombre: 'X', permisos: null as any } });
    expect(getVisibleModules(user)).toEqual([]);
  });

  it('debe devolver todos los módulos con el wildcard { all: true }', () => {
    const user = makeUser({
      role: { id: 'r-all', nombre: 'Admin', permisos: { all: true } },
    });
    const modules = getVisibleModules(user);
    expect(modules).toContain('leads');
    expect(modules).toContain('cursos');
    expect(modules).toContain('whitelabel');
    expect(modules.length).toBeGreaterThan(5);
  });
});

// ─── getUserPermissions ────────────────────────────────────────────────
describe('getUserPermissions', () => {
  it('debe devolver el objeto de permisos completo', () => {
    const user = makeUser();
    const perms = getUserPermissions(user);
    expect(perms).toBeDefined();
    expect(perms!.leads.ver).toBe(true);
    expect(perms!.citas.crear).toBe(true);
  });

  it('debe devolver null si el usuario es null', () => {
    expect(getUserPermissions(null)).toBeNull();
  });

  it('debe devolver null si el usuario no tiene role', () => {
    expect(getUserPermissions(makeUser({ role: null }))).toBeNull();
  });
});

// ─── isSameTenant ──────────────────────────────────────────────────────
describe('isSameTenant', () => {
  it('debe devolver true para mismo tenant', () => {
    expect(isSameTenant('t1', 't1')).toBe(true);
  });

  it('debe devolver false para tenants diferentes', () => {
    expect(isSameTenant('t1', 't2')).toBe(false);
  });

  it('debe devolver false si alguno es null', () => {
    expect(isSameTenant(null, 't1')).toBe(false);
    expect(isSameTenant('t1', null)).toBe(false);
    expect(isSameTenant(null, null)).toBe(false);
  });

  it('debe devolver false si alguno es undefined', () => {
    expect(isSameTenant(undefined as any, 't1')).toBe(false);
  });
});

// ─── canManageUser ─────────────────────────────────────────────────────
describe('canManageUser', () => {
  it('debe devolver true si mismo tenant y permiso equipo.editar', () => {
    const current = makeUser();
    const target = makeUser({ id: 'user-2' });
    expect(canManageUser(current, target)).toBe(true);
  });

  it('debe devolver true si mismo tenant y permiso equipo.eliminar', () => {
    const current = makeUser({
      role: {
        id: 'r-1',
        nombre: 'Admin',
        permisos: { equipo: { ver: true, eliminar: true } },
      },
    });
    const target = makeUser({ id: 'user-2' });
    expect(canManageUser(current, target)).toBe(true);
  });

  it('debe devolver false si distinto tenant', () => {
    const current = makeUser();
    const target = makeUser({ id: 'user-2', tenantId: 'tenant-b' });
    expect(canManageUser(current, target)).toBe(false);
  });

  it('debe devolver false si mismo tenant pero sin permiso equipo', () => {
    const current = makeUser({
      role: {
        id: 'r-1',
        nombre: 'Sales Agent',
        permisos: { leads: { ver: true } },
      },
    });
    const target = makeUser({ id: 'user-2' });
    expect(canManageUser(current, target)).toBe(false);
  });

  it('debe devolver false si currentUser es null', () => {
    expect(canManageUser(null, makeUser())).toBe(false);
  });

  it('debe devolver false si targetUser es null', () => {
    expect(canManageUser(makeUser(), null)).toBe(false);
  });
});

// ─── canAssignLeads ────────────────────────────────────────────────────
describe('canAssignLeads', () => {
  it('debe devolver true si el usuario tiene leads.asignar', () => {
    const user = makeUser({
      role: {
        id: 'r-1',
        nombre: 'Admin',
        permisos: { leads: { ver: true, asignar: true } },
      },
    });
    expect(canAssignLeads(user)).toBe(true);
  });

  it('debe devolver false si el usuario no tiene leads.asignar', () => {
    const user = makeUser();
    expect(canAssignLeads(user)).toBe(false);
  });

  it('debe devolver false si el usuario es null', () => {
    expect(canAssignLeads(null)).toBe(false);
  });
});

// ─── canOnlySeeOwnLeads ────────────────────────────────────────────────
describe('canOnlySeeOwnLeads', () => {
  it('Sales Agent solo ve sus propios leads', () => {
    const user = makeUser({ role: { id: 'r-1', nombre: 'Sales Agent', permisos: {} } });
    expect(canOnlySeeOwnLeads(user)).toBe(true);
  });

  it('Support solo ve sus propios leads', () => {
    const user = makeUser({ role: { id: 'r-1', nombre: 'Support', permisos: {} } });
    expect(canOnlySeeOwnLeads(user)).toBe(true);
  });

  it('Admin ve todos los leads', () => {
    const user = makeUser();
    expect(canOnlySeeOwnLeads(user)).toBe(false);
  });

  it('Superadmin ve todos los leads', () => {
    const user = makeUser({ role: { id: 'r-1', nombre: 'Superadmin', permisos: {} } });
    expect(canOnlySeeOwnLeads(user)).toBe(false);
  });

  it('usuario sin role solo ve sus propios leads', () => {
    expect(canOnlySeeOwnLeads(null)).toBe(true);
    expect(canOnlySeeOwnLeads(makeUser({ role: null }))).toBe(true);
  });

  it('Instructor ve todos los leads', () => {
    const user = makeUser({ role: { id: 'r-1', nombre: 'Instructor', permisos: {} } });
    expect(canOnlySeeOwnLeads(user)).toBe(false);
  });
});

// ─── PREDEFINED_ROLES ──────────────────────────────────────────────────
describe('PREDEFINED_ROLES', () => {
  it('debe tener 5 roles predefinidos', () => {
    expect(PREDEFINED_ROLES).toHaveLength(5);
  });

  it('debe incluir Superadmin, Admin, Sales Agent, Support, Instructor', () => {
    expect(PREDEFINED_ROLES).toContain('Superadmin');
    expect(PREDEFINED_ROLES).toContain('Admin');
    expect(PREDEFINED_ROLES).toContain('Sales Agent');
    expect(PREDEFINED_ROLES).toContain('Support');
    expect(PREDEFINED_ROLES).toContain('Instructor');
  });

  it('no debe tener duplicados', () => {
    expect(new Set(PREDEFINED_ROLES).size).toBe(PREDEFINED_ROLES.length);
  });
});

// ─── getRoleDescription ────────────────────────────────────────────────
describe('getRoleDescription', () => {
  it('debe devolver descripción para Superadmin', () => {
    const desc = getRoleDescription('Superadmin');
    expect(desc).toContain('Acceso total');
    expect(desc.length).toBeGreaterThan(10);
  });

  it('debe devolver descripción para Admin', () => {
    const desc = getRoleDescription('Admin');
    expect(desc).toContain('Gestión');
  });

  it('debe devolver descripción para Sales Agent', () => {
    const desc = getRoleDescription('Sales Agent');
    expect(desc).toContain('leads');
  });

  it('debe devolver descripción para Support', () => {
    const desc = getRoleDescription('Support');
    expect(desc).toContain('Atención');
  });

  it('debe devolver descripción para Instructor', () => {
    const desc = getRoleDescription('Instructor');
    expect(desc).toContain('cursos');
  });

  it('debe devolver "Rol personalizado" para roles desconocidos', () => {
    expect(getRoleDescription('CustomRole')).toBe('Rol personalizado');
    expect(getRoleDescription('')).toBe('Rol personalizado');
  });
});
