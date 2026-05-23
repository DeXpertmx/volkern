import { describe, it, expect, vi } from 'vitest';
import {
  SkillContext,
  createSystemContext,
  createContextFromApiKey,
  createContextFromWebhook,
  createContextFromAutomation,
  createContextFromMCP,
} from '@/lib/skills/context';

// ─── SkillContext ─────────────────────────────────────────────────────
describe('SkillContext', () => {
  const baseContext = new SkillContext({ tenantId: 'tenant-1' });

  it('debe almacenar y retornar tenantId', () => {
    expect(baseContext.tenantId).toBe('tenant-1');
  });

  it('debe generar correlationId si no se proporciona', () => {
    expect(baseContext.correlationId).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('debe aceptar correlationId explícito', () => {
    const ctx = new SkillContext({ tenantId: 't1', correlationId: 'my-custom-corr-id' });
    expect(ctx.correlationId).toBe('my-custom-corr-id');
  });

  it('source por defecto debe ser system', () => {
    expect(baseContext.source).toBe('system');
  });

  it('permissions por defecto debe ser level=read con scopes vacíos', () => {
    expect(baseContext.permissions.level).toBe('read');
    expect(baseContext.permissions.scopes).toEqual([]);
  });

  it('debe aceptar userId, userEmail, userName', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      userId: 'user-1',
      userEmail: 'user@test.com',
      userName: 'Test User',
    });
    expect(ctx.userId).toBe('user-1');
    expect(ctx.userEmail).toBe('user@test.com');
    expect(ctx.userName).toBe('Test User');
  });
});

// ─── hasPermission ────────────────────────────────────────────────────
describe('hasPermission', () => {
  it('admin level debe tener todos los permisos', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'admin', scopes: [] },
    });
    expect(ctx.hasPermission('leads:read')).toBe(true);
    expect(ctx.hasPermission('leads:write')).toBe(true);
  });

  it('system level debe tener todos los permisos', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'system', scopes: [] },
    });
    expect(ctx.hasPermission('leads:read')).toBe(true);
  });

  it('write level solo debe tener los scopes especificados', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'write', scopes: ['leads:read', 'contacts:write'] },
    });
    expect(ctx.hasPermission('leads:read')).toBe(true);
    expect(ctx.hasPermission('contacts:write')).toBe(true);
    expect(ctx.hasPermission('bookings:create')).toBe(false);
  });

  it('read level solo debe tener los scopes especificados', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'read', scopes: ['analytics:read'] },
    });
    expect(ctx.hasPermission('analytics:read')).toBe(true);
    expect(ctx.hasPermission('leads:write')).toBe(false);
  });
});

// ─── hasRestriction ───────────────────────────────────────────────────
describe('hasRestriction', () => {
  it('debe devolver true si la restricción existe', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'write', scopes: ['*'], restrictions: ['no_delete'] },
    });
    expect(ctx.hasRestriction('no_delete')).toBe(true);
  });

  it('debe devolver false si la restricción no existe', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'write', scopes: ['*'] },
    });
    expect(ctx.hasRestriction('no_delete')).toBe(false);
  });

  it('debe devolver false si restrictions es undefined', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'read', scopes: [] },
    });
    expect(ctx.hasRestriction('anything')).toBe(false);
  });
});

// ─── canWrite / canDelete ─────────────────────────────────────────────
describe('canWrite', () => {
  it('write puede escribir', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'write', scopes: ['*'] },
    });
    expect(ctx.canWrite()).toBe(true);
  });

  it('read no puede escribir', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'read', scopes: ['*'] },
    });
    expect(ctx.canWrite()).toBe(false);
  });

  it('admin puede escribir', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'admin', scopes: ['*'] },
    });
    expect(ctx.canWrite()).toBe(true);
  });

  it('system puede escribir', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'system', scopes: ['*'] },
    });
    expect(ctx.canWrite()).toBe(true);
  });
});

describe('canDelete', () => {
  it('admin sin restricción no_delete puede borrar', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'admin', scopes: ['*'] },
    });
    expect(ctx.canDelete()).toBe(true);
  });

  it('admin con restricción no_delete no puede borrar', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'admin', scopes: ['*'], restrictions: ['no_delete'] },
    });
    expect(ctx.canDelete()).toBe(false);
  });

  it('write no puede borrar', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'write', scopes: ['*'] },
    });
    expect(ctx.canDelete()).toBe(false);
  });

  it('system sin restricción puede borrar', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'system', scopes: ['*'] },
    });
    expect(ctx.canDelete()).toBe(true);
  });
});

// ─── isExpired ────────────────────────────────────────────────────────
describe('isExpired', () => {
  it('sin expiresAt no está expirado', () => {
    const ctx = new SkillContext({ tenantId: 't1' });
    expect(ctx.isExpired()).toBe(false);
  });

  it('fecha futura no está expirado', () => {
    const future = new Date(Date.now() + 3600000);
    const ctx = new SkillContext({ tenantId: 't1', expiresAt: future });
    expect(ctx.isExpired()).toBe(false);
  });

  it('fecha pasada está expirado', () => {
    const past = new Date(Date.now() - 1000);
    const ctx = new SkillContext({ tenantId: 't1', expiresAt: past });
    expect(ctx.isExpired()).toBe(true);
  });
});

// ─── createChildContext ───────────────────────────────────────────────
describe('createChildContext', () => {
  it('debe heredar tenantId del padre', () => {
    const parent = new SkillContext({ tenantId: 'tenant-x' });
    const child = parent.createChildContext();
    expect(child.tenantId).toBe('tenant-x');
  });

  it('parentCorrelationId debe ser el correlationId del padre', () => {
    const parent = new SkillContext({ tenantId: 't1', correlationId: 'corr-parent' });
    const child = parent.createChildContext();
    expect(child.parentCorrelationId).toBe('corr-parent');
  });

  it('debe generar nuevo correlationId', () => {
    const parent = new SkillContext({ tenantId: 't1' });
    const child = parent.createChildContext();
    expect(child.correlationId).not.toBe(parent.correlationId);
    expect(child.correlationId).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('debe heredar permissions del padre', () => {
    const parent = new SkillContext({
      tenantId: 't1',
      permissions: { level: 'admin', scopes: ['*'] },
    });
    const child = parent.createChildContext();
    expect(child.permissions.level).toBe('admin');
    expect(child.permissions.scopes).toEqual(['*']);
  });

  it('debe aceptar overrides', () => {
    const parent = new SkillContext({ tenantId: 't1', userId: 'user-1' });
    const child = parent.createChildContext({ userId: 'user-2', source: 'api' });
    expect(child.userId).toBe('user-2');
    expect(child.source).toBe('api');
    expect(child.tenantId).toBe('t1'); // heredado
  });
});

// ─── toJSON / toLogContext ────────────────────────────────────────────
describe('toJSON', () => {
  it('debe devolver una copia de los datos', () => {
    const ctx = new SkillContext({ tenantId: 't1', userId: 'u1' });
    const json = ctx.toJSON();
    expect(json.tenantId).toBe('t1');
    expect(json.userId).toBe('u1');
    expect(json.correlationId).toBe(ctx.correlationId);
  });
});

describe('toLogContext', () => {
  it('debe devolver campos clave para logs', () => {
    const ctx = new SkillContext({
      tenantId: 't1',
      userId: 'u1',
      correlationId: 'corr-1',
      parentCorrelationId: 'parent-1',
      source: 'dashboard',
      permissions: { level: 'write', scopes: ['*'] },
    });
    const log = ctx.toLogContext();
    expect(log.tenantId).toBe('t1');
    expect(log.userId).toBe('u1');
    expect(log.correlationId).toBe('corr-1');
    expect(log.parentCorrelationId).toBe('parent-1');
    expect(log.source).toBe('dashboard');
    expect(log.permissionLevel).toBe('write');
  });
});

// ─── Factory functions ────────────────────────────────────────────────
describe('createSystemContext', () => {
  it('debe crear contexto con level=system y source=system', () => {
    const ctx = createSystemContext('tenant-x');
    expect(ctx.tenantId).toBe('tenant-x');
    expect(ctx.source).toBe('system');
    expect(ctx.permissions.level).toBe('system');
    expect(ctx.permissions.scopes).toEqual(['*']);
  });
});

describe('createContextFromApiKey', () => {
  it('debe crear contexto con level=write y source=api', () => {
    const ctx = createContextFromApiKey('tenant-x', ['leads:read', 'contacts:write'], 'req-1');
    expect(ctx.tenantId).toBe('tenant-x');
    expect(ctx.source).toBe('api');
    expect(ctx.permissions.level).toBe('write');
    expect(ctx.permissions.scopes).toEqual(['leads:read', 'contacts:write']);
    expect(ctx.requestId).toBe('req-1');
  });

  it('debe aceptar sourceDetails', () => {
    const ctx = createContextFromApiKey('t1', ['*'], undefined, { ip: '1.2.3.4', userAgent: 'TestAgent' });
    expect(ctx.sourceDetails).toEqual({ ip: '1.2.3.4', userAgent: 'TestAgent' });
  });
});

describe('createContextFromWebhook', () => {
  it('debe crear contexto con restricción no_delete', () => {
    const ctx = createContextFromWebhook('tenant-x', 'stripe', 'req-1');
    expect(ctx.tenantId).toBe('tenant-x');
    expect(ctx.source).toBe('webhook');
    expect(ctx.permissions.level).toBe('write');
    expect(ctx.permissions.restrictions).toContain('no_delete');
    expect(ctx.hasRestriction('no_delete')).toBe(true);
    expect(ctx.canDelete()).toBe(false);
  });

  it('debe guardar webhookType en sourceDetails', () => {
    const ctx = createContextFromWebhook('t1', 'chatwoot');
    expect(ctx.sourceDetails?.webhookType).toBe('chatwoot');
  });
});

describe('createContextFromAutomation', () => {
  it('debe crear contexto con level=system', () => {
    const ctx = createContextFromAutomation('tenant-x', 'automation-1', 'corr-1');
    expect(ctx.tenantId).toBe('tenant-x');
    expect(ctx.source).toBe('automation');
    expect(ctx.permissions.level).toBe('system');
    expect(ctx.permissions.scopes).toEqual(['*']);
    expect(ctx.correlationId).toBe('corr-1');
    expect(ctx.sourceDetails?.automationId).toBe('automation-1');
  });
});

describe('createContextFromMCP', () => {
  it('debe crear contexto con source=mcp', () => {
    const ctx = createContextFromMCP('tenant-x', 'agent-1', 'corr-1');
    expect(ctx.tenantId).toBe('tenant-x');
    expect(ctx.source).toBe('mcp');
    expect(ctx.permissions.level).toBe('write');
    expect(ctx.permissions.scopes).toEqual(['*']);
    expect(ctx.userId).toBe('agent-1');
    expect(ctx.correlationId).toBe('corr-1');
  });
});
