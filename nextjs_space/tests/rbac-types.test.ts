import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODULE_PERMISSIONS,
  ALL_MODULES,
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  MODULE_LABELS,
  isValidPermission,
  isValidModule,
  isRBACUserContext,
  isRolePermissionsMap,
} from '@/lib/rbac-types';

// ─── DEFAULT_MODULE_PERMISSIONS ───────────────────────────────────────────────

describe('DEFAULT_MODULE_PERMISSIONS', () => {
  it('debe ser un objeto', () => {
    expect(typeof DEFAULT_MODULE_PERMISSIONS).toBe('object');
    expect(DEFAULT_MODULE_PERMISSIONS).not.toBeNull();
  });

  it('debe tener todas las claves de permiso base con valor false', () => {
    const baseKeys = ['ver', 'crear', 'editar', 'eliminar', 'asignar', 'exportar', 'gestionar'];
    for (const key of baseKeys) {
      expect(key in DEFAULT_MODULE_PERMISSIONS).toBe(true);
      expect(DEFAULT_MODULE_PERMISSIONS[key]).toBe(false);
    }
  });

  it('debe tener claves extendidas con valor false', () => {
    const extendedKeys = ['inscribir', 'publicar', 'activar', 'enviar', 'responder', 'invitar'];
    for (const key of extendedKeys) {
      expect(key in DEFAULT_MODULE_PERMISSIONS).toBe(true);
      expect(DEFAULT_MODULE_PERMISSIONS[key]).toBe(false);
    }
  });

  it('no debe tener ningún permiso en true por defecto', () => {
    const values = Object.values(DEFAULT_MODULE_PERMISSIONS);
    expect(values.every(v => v === false)).toBe(true);
  });

  it('debe ser inmutable en el test (copia independiente)', () => {
    const copy = { ...DEFAULT_MODULE_PERMISSIONS };
    copy.ver = true;
    expect(DEFAULT_MODULE_PERMISSIONS.ver).toBe(false);
  });
});

// ─── ALL_MODULES ──────────────────────────────────────────────────────────────

describe('ALL_MODULES', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(ALL_MODULES)).toBe(true);
  });

  it('debe contener módulos esperados', () => {
    const expectedModules = ['leads', 'citas', 'estudiantes', 'cursos', 'automatizaciones',
      'campanas', 'mensajes', 'analytics', 'configuracion', 'equipo',
      'whitelabel', 'telefonia', 'pages'];
    for (const mod of expectedModules) {
      expect(ALL_MODULES).toContain(mod);
    }
  });

  it('todos los elementos deben ser strings', () => {
    for (const mod of ALL_MODULES) {
      expect(typeof mod).toBe('string');
    }
  });

  it('no debe tener duplicados', () => {
    expect(new Set(ALL_MODULES).size).toBe(ALL_MODULES.length);
  });

  it('cada módulo debe tener label en MODULE_LABELS', () => {
    for (const mod of ALL_MODULES) {
      expect(mod in MODULE_LABELS).toBe(true);
    }
  });
});

// ─── ALL_PERMISSIONS ──────────────────────────────────────────────────────────

describe('ALL_PERMISSIONS', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(ALL_PERMISSIONS)).toBe(true);
  });

  it('debe contener permisos base', () => {
    const basePerms = ['ver', 'crear', 'editar', 'eliminar', 'asignar', 'exportar', 'gestionar'];
    for (const perm of basePerms) {
      expect(ALL_PERMISSIONS).toContain(perm);
    }
  });

  it('debe contener permisos extendidos', () => {
    const extendedPerms = ['inscribir', 'publicar', 'activar', 'enviar', 'responder', 'invitar'];
    for (const perm of extendedPerms) {
      expect(ALL_PERMISSIONS).toContain(perm);
    }
  });

  it('no debe tener duplicados', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('cada permiso debe tener label en PERMISSION_LABELS', () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(perm in PERMISSION_LABELS).toBe(true);
    }
  });
});

// ─── PERMISSION_LABELS ────────────────────────────────────────────────────────

describe('PERMISSION_LABELS', () => {
  it('debe ser un objeto', () => {
    expect(typeof PERMISSION_LABELS).toBe('object');
  });

  it('todas las claves deben estar en ALL_PERMISSIONS', () => {
    const keys = Object.keys(PERMISSION_LABELS);
    for (const key of keys) {
      expect(ALL_PERMISSIONS).toContain(key);
    }
  });

  it('todos los valores deben ser strings no vacíos', () => {
    const entries = Object.entries(PERMISSION_LABELS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('debe tener labels en español para permisos clave', () => {
    expect(PERMISSION_LABELS.ver).toBe('Ver');
    expect(PERMISSION_LABELS.crear).toBe('Crear');
    expect(PERMISSION_LABELS.editar).toBe('Editar');
    expect(PERMISSION_LABELS.eliminar).toBe('Eliminar');
    expect(PERMISSION_LABELS.gestionar).toBe('Gestionar');
  });
});

// ─── MODULE_LABELS ────────────────────────────────────────────────────────────

describe('MODULE_LABELS', () => {
  it('debe ser un objeto', () => {
    expect(typeof MODULE_LABELS).toBe('object');
  });

  it('todas las claves deben estar en ALL_MODULES', () => {
    const keys = Object.keys(MODULE_LABELS);
    for (const key of keys) {
      expect(ALL_MODULES).toContain(key);
    }
  });

  it('todos los valores deben ser strings no vacíos', () => {
    const entries = Object.entries(MODULE_LABELS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [_, value] of entries) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('debe tener labels descriptivos', () => {
    expect(MODULE_LABELS.leads).toBe('Leads');
    expect(MODULE_LABELS.citas).toBe('Citas');
    expect(MODULE_LABELS.analytics).toBe('Analíticas');
  });
});

// ─── isValidPermission ────────────────────────────────────────────────────────

describe('isValidPermission', () => {
  it('debe devolver true para permisos válidos', () => {
    expect(isValidPermission('ver')).toBe(true);
    expect(isValidPermission('crear')).toBe(true);
    expect(isValidPermission('editar')).toBe(true);
    expect(isValidPermission('eliminar')).toBe(true);
    expect(isValidPermission('gestionar')).toBe(true);
    expect(isValidPermission('inscribir')).toBe(true);
  });

  it('debe devolver false para permisos inválidos', () => {
    expect(isValidPermission('borrar')).toBe(false);
    expect(isValidPermission('leer')).toBe(false);
    expect(isValidPermission('admin')).toBe(false);
  });

  it('debe devolver false para string vacío', () => {
    expect(isValidPermission('')).toBe(false);
  });

  it('debe devolver false para valores no string', () => {
    expect(isValidPermission(123 as any)).toBe(false);
    expect(isValidPermission(null as any)).toBe(false);
    expect(isValidPermission(undefined as any)).toBe(false);
  });

  it('debe ser case-sensitive', () => {
    expect(isValidPermission('VER')).toBe(false);
    expect(isValidPermission('Crear')).toBe(false);
  });
});

// ─── isValidModule ────────────────────────────────────────────────────────────

describe('isValidModule', () => {
  it('debe devolver true para módulos válidos', () => {
    expect(isValidModule('leads')).toBe(true);
    expect(isValidModule('citas')).toBe(true);
    expect(isValidModule('estudiantes')).toBe(true);
    expect(isValidModule('cursos')).toBe(true);
    expect(isValidModule('telefonia')).toBe(true);
    expect(isValidModule('pages')).toBe(true);
  });

  it('debe devolver false para módulos inválidos', () => {
    expect(isValidModule('finanzas')).toBe(false);
    expect(isValidModule('inventario')).toBe(false);
    expect(isValidModule('tickets')).toBe(false);
  });

  it('debe devolver false para string vacío', () => {
    expect(isValidModule('')).toBe(false);
  });

  it('debe devolver false para valores no string', () => {
    expect(isValidModule(123 as any)).toBe(false);
    expect(isValidModule(null as any)).toBe(false);
    expect(isValidModule(undefined as any)).toBe(false);
  });
});

// ─── isRBACUserContext ────────────────────────────────────────────────────────

describe('isRBACUserContext', () => {
  it('debe validar un contexto completo', () => {
    const ctx = {
      userId: 'user-1',
      email: 'test@volkern.app',
      name: 'Test User',
      image: null,
      tenantId: 'tenant-1',
      roleId: 'role-1',
    };
    expect(isRBACUserContext(ctx)).toBe(true);
  });

  it('debe aceptar null en tenantId y roleId', () => {
    const ctx = {
      userId: 'user-1',
      email: 'test@volkern.app',
      name: null,
      image: null,
      tenantId: null,
      roleId: null,
    };
    expect(isRBACUserContext(ctx)).toBe(true);
  });

  it('debe rechazar si falta userId', () => {
    const ctx = {
      email: 'test@volkern.app',
      name: null,
      image: null,
      tenantId: 'tenant-1',
      roleId: null,
    };
    expect(isRBACUserContext(ctx)).toBe(false);
  });

  it('debe rechazar si falta email', () => {
    const ctx = {
      userId: 'user-1',
      name: null,
      image: null,
      tenantId: 'tenant-1',
      roleId: null,
    };
    expect(isRBACUserContext(ctx)).toBe(false);
  });

  it('debe rechazar null', () => {
    expect(isRBACUserContext(null)).toBe(false);
  });

  it('debe rechazar objetos vacíos', () => {
    expect(isRBACUserContext({})).toBe(false);
  });

  it('debe rechazar valores primitivos', () => {
    expect(isRBACUserContext('string')).toBe(false);
    expect(isRBACUserContext(123)).toBe(false);
    expect(isRBACUserContext(undefined)).toBe(false);
  });

  it('debe rechazar si userId no es string', () => {
    expect(isRBACUserContext({ userId: 123, email: 'test@test.com', tenantId: null, roleId: null })).toBe(false);
  });
});

// ─── isRolePermissionsMap ─────────────────────────────────────────────────────

describe('isRolePermissionsMap', () => {
  it('debe validar un mapa de permisos válido', () => {
    const map = {
      leads: { ver: true, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false },
      citas: { ver: true, crear: true, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false },
    };
    expect(isRolePermissionsMap(map)).toBe(true);
  });

  it('debe validar un mapa vacío', () => {
    expect(isRolePermissionsMap({})).toBe(true);
  });

  it('debe rechazar si un valor de módulo no es un objeto', () => {
    const map = {
      leads: 'not-an-object',
    };
    expect(isRolePermissionsMap(map)).toBe(false);
  });

  it('debe rechazar si un permiso no es booleano', () => {
    const map = {
      leads: { ver: 'yes', crear: false },
    };
    expect(isRolePermissionsMap(map)).toBe(false);
  });

  it('debe rechazar null', () => {
    expect(isRolePermissionsMap(null)).toBe(false);
  });

  it('debe aceptar arrays vacíos (typeof array es object, no tiene claves inválidas)', () => {
    expect(isRolePermissionsMap([])).toBe(true);
  });

  it('debe aceptar permisos con claves extra', () => {
    const map: any = {
      leads: { ver: true, crear: false, custom_action: true },
    };
    expect(isRolePermissionsMap(map)).toBe(true);
  });

  it('arrays con elementos válidos pasan (typeof array === object, no se discrimina)', () => {
    expect(isRolePermissionsMap([{ ver: true }])).toBe(true);
  });

  it('debe rechazar arrays con elementos inválidos (índices con valores no objeto)', () => {
    expect(isRolePermissionsMap(['not-an-object'])).toBe(false);
  });
});
