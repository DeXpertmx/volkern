import { describe, it, expect } from 'vitest';
import {
  isValidPermission,
  isValidModule,
  isRBACUserContext,
  isRolePermissionsMap,
  DEFAULT_MODULE_PERMISSIONS,
  ALL_MODULES,
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  MODULE_LABELS,
} from '@/lib/rbac-types';

// ==================== isValidPermission ====================
describe('isValidPermission', () => {
  it('debe aceptar permisos básicos válidos', () => {
    expect(isValidPermission('ver')).toBe(true);
    expect(isValidPermission('crear')).toBe(true);
    expect(isValidPermission('editar')).toBe(true);
    expect(isValidPermission('eliminar')).toBe(true);
  });

  it('debe aceptar permisos avanzados válidos', () => {
    expect(isValidPermission('asignar')).toBe(true);
    expect(isValidPermission('exportar')).toBe(true);
    expect(isValidPermission('gestionar')).toBe(true);
    expect(isValidPermission('inscribir')).toBe(true);
    expect(isValidPermission('publicar')).toBe(true);
    expect(isValidPermission('activar')).toBe(true);
    expect(isValidPermission('enviar')).toBe(true);
    expect(isValidPermission('responder')).toBe(true);
    expect(isValidPermission('invitar')).toBe(true);
  });

  it('debe rechazar permisos inválidos', () => {
    expect(isValidPermission('borrar')).toBe(false);
    expect(isValidPermission('leer')).toBe(false);
    expect(isValidPermission('admin')).toBe(false);
  });

  it('debe rechazar strings vacíos', () => {
    expect(isValidPermission('')).toBe(false);
  });

  it('los 13 permisos de ALL_PERMISSIONS deben ser válidos', () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(isValidPermission(perm)).toBe(true);
    }
  });
});

// ==================== isValidModule ====================
describe('isValidModule', () => {
  it('debe aceptar módulos válidos', () => {
    expect(isValidModule('leads')).toBe(true);
    expect(isValidModule('citas')).toBe(true);
    expect(isValidModule('estudiantes')).toBe(true);
    expect(isValidModule('cursos')).toBe(true);
    expect(isValidModule('automatizaciones')).toBe(true);
    expect(isValidModule('campanas')).toBe(true);
    expect(isValidModule('mensajes')).toBe(true);
    expect(isValidModule('analytics')).toBe(true);
    expect(isValidModule('configuracion')).toBe(true);
    expect(isValidModule('equipo')).toBe(true);
    expect(isValidModule('whitelabel')).toBe(true);
    expect(isValidModule('telefonia')).toBe(true);
    expect(isValidModule('pages')).toBe(true);
  });

  it('debe rechazar módulos inválidos', () => {
    expect(isValidModule('finanzas')).toBe(false);
    expect(isValidModule('inventario')).toBe(false);
    expect(isValidModule('proyectos')).toBe(false);
  });

  it('debe rechazar strings vacíos', () => {
    expect(isValidModule('')).toBe(false);
  });

  it('los 13 módulos de ALL_MODULES deben ser válidos', () => {
    for (const mod of ALL_MODULES) {
      expect(isValidModule(mod)).toBe(true);
    }
  });
});

// ==================== isRBACUserContext ====================
describe('isRBACUserContext', () => {
  it('debe aceptar un contexto de usuario completo', () => {
    expect(isRBACUserContext({
      userId: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      tenantId: 'tenant-1',
      roleId: 'role-1',
    })).toBe(true);
  });

  it('debe aceptar contexto con tenantId y roleId null', () => {
    expect(isRBACUserContext({
      userId: 'user-2',
      email: 'admin@example.com',
      name: null,
      image: null,
      tenantId: null,
      roleId: null,
    })).toBe(true);
  });

  it('debe rechazar null', () => {
    expect(isRBACUserContext(null)).toBe(false);
  });

  it('debe rechazar objetos sin userId', () => {
    expect(isRBACUserContext({
      email: 'test@test.com',
      tenantId: 't1',
    })).toBe(false);
  });

  it('debe rechazar objetos sin email', () => {
    expect(isRBACUserContext({
      userId: 'u1',
      tenantId: 't1',
    })).toBe(false);
  });

  it('debe rechazar tenantId que no es string ni null', () => {
    expect(isRBACUserContext({
      userId: 'u1',
      email: 'e@e.com',
      tenantId: 123,
      roleId: null,
    })).toBe(false);
  });

  it('debe rechazar roleId que no es string ni null', () => {
    expect(isRBACUserContext({
      userId: 'u1',
      email: 'e@e.com',
      tenantId: null,
      roleId: 456,
    })).toBe(false);
  });

  it('debe rechazar arrays', () => {
    expect(isRBACUserContext([1, 2, 3])).toBe(false);
  });

  it('debe rechazar strings', () => {
    expect(isRBACUserContext('not an object')).toBe(false);
  });
});

// ==================== isRolePermissionsMap ====================
describe('isRolePermissionsMap', () => {
  it('debe aceptar un map de permisos válido', () => {
    expect(isRolePermissionsMap({
      leads: { ver: true, crear: false, editar: true, eliminar: false },
      citas: { ver: true, crear: true, editar: false, eliminar: false },
    })).toBe(true);
  });

  it('debe aceptar un objeto vacío', () => {
    expect(isRolePermissionsMap({})).toBe(true);
  });

  it('debe rechazar null', () => {
    expect(isRolePermissionsMap(null)).toBe(false);
  });

  it('debe rechazar strings', () => {
    expect(isRolePermissionsMap('not an object')).toBe(false);
  });

  it('debe rechazar arrays', () => {
    expect(isRolePermissionsMap([1, 2, 3])).toBe(false);
  });

  it('debe rechazar si un módulo no es un objeto', () => {
    expect(isRolePermissionsMap({
      leads: 'not an object',
    })).toBe(false);
  });

  it('debe rechazar si un permiso no es boolean', () => {
    expect(isRolePermissionsMap({
      leads: { ver: 'yes' },
    })).toBe(false);
  });

  it('debe aceptar un solo módulo con permisos válidos', () => {
    expect(isRolePermissionsMap({
      configuracion: DEFAULT_MODULE_PERMISSIONS,
    })).toBe(true);
  });
});

// ==================== DEFAULT_MODULE_PERMISSIONS ====================
describe('DEFAULT_MODULE_PERMISSIONS', () => {
  it('debe tener todos los permisos en false', () => {
    const values = Object.values(DEFAULT_MODULE_PERMISSIONS);
    expect(values.length).toBeGreaterThan(6);
    for (const v of values) {
      expect(v).toBe(false);
    }
  });

  it('debe incluir los 7 permisos base', () => {
    expect(DEFAULT_MODULE_PERMISSIONS.ver).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.crear).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.editar).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.eliminar).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.asignar).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.exportar).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.gestionar).toBe(false);
  });

  it('debe incluir permisos extendidos', () => {
    expect(DEFAULT_MODULE_PERMISSIONS.inscribir).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.publicar).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.activar).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.enviar).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.responder).toBe(false);
    expect(DEFAULT_MODULE_PERMISSIONS.invitar).toBe(false);
  });
});

// ==================== ALL_MODULES ====================
describe('ALL_MODULES', () => {
  it('debe tener exactamente 13 módulos', () => {
    expect(ALL_MODULES).toHaveLength(13);
  });

  it('no debe tener duplicados', () => {
    const unique = new Set(ALL_MODULES);
    expect(unique.size).toBe(ALL_MODULES.length);
  });

  it('debe incluir módulos CRM base', () => {
    expect(ALL_MODULES).toContain('leads');
    expect(ALL_MODULES).toContain('citas');
    expect(ALL_MODULES).toContain('mensajes');
    expect(ALL_MODULES).toContain('analytics');
    expect(ALL_MODULES).toContain('configuracion');
  });

  it('debe incluir módulos de academia', () => {
    expect(ALL_MODULES).toContain('estudiantes');
    expect(ALL_MODULES).toContain('cursos');
  });

  it('debe incluir módulos de automatización', () => {
    expect(ALL_MODULES).toContain('automatizaciones');
    expect(ALL_MODULES).toContain('campanas');
  });
});

// ==================== ALL_PERMISSIONS ====================
describe('ALL_PERMISSIONS', () => {
  it('debe tener exactamente 13 permisos', () => {
    expect(ALL_PERMISSIONS).toHaveLength(13);
  });

  it('no debe tener duplicados', () => {
    const unique = new Set(ALL_PERMISSIONS);
    expect(unique.size).toBe(ALL_PERMISSIONS.length);
  });

  it('debe incluir permisos CRUD base', () => {
    expect(ALL_PERMISSIONS).toContain('ver');
    expect(ALL_PERMISSIONS).toContain('crear');
    expect(ALL_PERMISSIONS).toContain('editar');
    expect(ALL_PERMISSIONS).toContain('eliminar');
  });
});

// ==================== PERMISSION_LABELS ====================
describe('PERMISSION_LABELS', () => {
  it('debe tener label para cada permiso en ALL_PERMISSIONS', () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(PERMISSION_LABELS[perm]).toBeTruthy();
      expect(typeof PERMISSION_LABELS[perm]).toBe('string');
    }
  });

  it('debe tener labels capitalizados en español', () => {
    expect(PERMISSION_LABELS.ver).toBe('Ver');
    expect(PERMISSION_LABELS.crear).toBe('Crear');
    expect(PERMISSION_LABELS.editar).toBe('Editar');
    expect(PERMISSION_LABELS.eliminar).toBe('Eliminar');
    expect(PERMISSION_LABELS.gestionar).toBe('Gestionar');
    expect(PERMISSION_LABELS.asignar).toBe('Asignar');
  });

  it('labels para permisos extendidos', () => {
    expect(PERMISSION_LABELS.inscribir).toBe('Inscribir');
    expect(PERMISSION_LABELS.publicar).toBe('Publicar');
    expect(PERMISSION_LABELS.invitar).toBe('Invitar');
  });
});

// ==================== MODULE_LABELS ====================
describe('MODULE_LABELS', () => {
  it('debe tener label para cada módulo en ALL_MODULES', () => {
    for (const mod of ALL_MODULES) {
      expect(MODULE_LABELS[mod]).toBeTruthy();
      expect(typeof MODULE_LABELS[mod]).toBe('string');
    }
  });

  it('debe tener labels legibles', () => {
    expect(MODULE_LABELS.leads).toBe('Leads');
    expect(MODULE_LABELS.citas).toBe('Citas');
    expect(MODULE_LABELS.automatizaciones).toBe('Automatizaciones');
    expect(MODULE_LABELS.whitelabel).toBe('White Label');
    expect(MODULE_LABELS.telefonia).toBe('Telefonía');
    expect(MODULE_LABELS.pages).toBe('Páginas');
  });

  it('debe tener labels para academia', () => {
    expect(MODULE_LABELS.estudiantes).toBe('Estudiantes');
    expect(MODULE_LABELS.cursos).toBe('Cursos');
  });
});
