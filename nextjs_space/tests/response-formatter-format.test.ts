import { describe, it, expect } from 'vitest';
import { ResponseFormatterAgent, type FormatParams, type FormattedResponse } from '@/lib/agents/response-formatter';

const formatter = new ResponseFormatterAgent();

// Helper
function fmt(overrides: Partial<FormatParams> = {}): Promise<FormattedResponse> {
  return formatter.format({
    intent: 'consulta_general',
    action: 'execute',
    success: true,
    ...overrides,
  });
}

// ─── Estructura de respuesta ──────────────────────────────────────────
describe('format — estructura', () => {
  it('debe devolver text, emoji, type', async () => {
    const r = await fmt();
    expect(typeof r.text).toBe('string');
    expect(r.text.length).toBeGreaterThan(0);
    expect(typeof r.emoji).toBe('string');
    expect(['success', 'error', 'info', 'warning', 'confirmation']).toContain(r.type);
  });

  it('debe incluir metadata con intent y action', async () => {
    const r = await fmt({ intent: 'crear_lead', action: 'execute', success: true });
    expect(r.metadata?.intent).toBe('crear_lead');
    expect(r.metadata?.action).toBe('execute');
    expect(r.metadata?.success).toBe(true);
  });

  it('debe incluir confirmationId en metadata si se proporciona', async () => {
    const r = await fmt({ confirmationId: 'conf-123' });
    expect(r.metadata?.confirmationId).toBe('conf-123');
  });
});

// ─── Intents comunes ─────────────────────────────────────────────────
describe('format — crear_lead', () => {
  it('execute exitoso debe mencionar el nombre', async () => {
    const r = await fmt({ intent: 'crear_lead', action: 'execute', success: true, data: { nombre: 'Juan', email: 'juan@test.com' } });
    expect(r.text).toContain('Juan');
    expect(r.text).toContain('juan@test.com');
    expect(r.type).toBe('success');
  });

  it('execute con error debe mostrar el error', async () => {
    const r = await fmt({ intent: 'crear_lead', action: 'error', success: false, error: 'Email duplicado' });
    expect(r.text).toContain('Email duplicado');
    expect(r.type).toBe('error');
  });

  it('ask_clarification debe mencionar missingParams', async () => {
    const r = await fmt({ intent: 'crear_lead', action: 'ask_clarification', success: false, missingParams: ['nombre', 'email'] });
    expect(r.text).toContain('nombre');
    expect(r.text).toContain('email');
  });
});

describe('format — agendar_cita', () => {
  it('execute debe mencionar la fecha', async () => {
    const r = await fmt({ intent: 'agendar_cita', action: 'execute', success: true, data: { fechaHora: '2026-06-15T10:00:00Z' } });
    expect(r.text).toContain('Cita agendada');
  });

  it('ask_clarification debe pedir datos', async () => {
    const r = await fmt({ intent: 'agendar_cita', action: 'ask_clarification', success: false });
    expect(r.text).toContain('fecha');
    expect(r.text).toContain('hora');
  });
});

describe('format — mis_citas', () => {
  it('execute con citas debe listarlas', async () => {
    const r = await fmt({
      intent: 'mis_citas',
      action: 'execute',
      success: true,
      data: { citas: [{ lead: { nombre: 'Juan' }, fechaHora: '2026-06-15T10:00:00Z', estado: 'confirmada' }], timezone: 'UTC' },
    });
    expect(r.text).toContain('Juan');
    expect(r.text).toContain('✅');
  });

  it('execute sin citas debe mostrar vacío', async () => {
    const r = await fmt({ intent: 'mis_citas', action: 'execute', success: true, data: { citas: [] } });
    expect(r.text).toContain('No tienes');
  });
});

describe('format — buscar_lead', () => {
  it('execute con leads debe listarlos', async () => {
    const r = await fmt({
      intent: 'buscar_lead',
      action: 'execute',
      success: true,
      data: { leads: [{ name: 'Juan', email: 'juan@test.com', phone: '+34600123456' }], count: 1 },
    });
    expect(r.text).toContain('Juan');
    expect(r.text).toContain('juan@test.com');
    expect(r.emoji).toBe('🔍');
  });

  it('execute sin leads debe mostrar vacío', async () => {
    const r = await fmt({ intent: 'buscar_lead', action: 'execute', success: true, data: { leads: [] } });
    expect(r.text).toContain('No se encontraron');
  });

  it('ask_clarification debe pedir nombre o email', async () => {
    const r = await fmt({ intent: 'buscar_lead', action: 'ask_clarification', success: false });
    expect(r.text).toContain('nombre');
  });
});

describe('format — registrar_gasto', () => {
  it('execute debe mostrar monto y concepto', async () => {
    const r = await fmt({ intent: 'registrar_gasto', action: 'execute', success: true, data: { concepto: 'Material oficina', monto: 150 } });
    expect(r.text).toContain('Material oficina');
    expect(r.text).toContain('150');
    expect(r.emoji).toBe('💰');
  });
});

describe('format — crear_tarea', () => {
  it('execute debe mostrar título', async () => {
    const r = await fmt({ intent: 'crear_tarea', action: 'execute', success: true, data: { titulo: 'Llamar a cliente' } });
    expect(r.text).toContain('Llamar a cliente');
  });
});

// ─── Acciones especiales ─────────────────────────────────────────────
describe('format — fallback_to_human', () => {
  it('debe indicar intervención humana', async () => {
    const r = await fmt({ intent: 'consulta_general', action: 'fallback_to_human', success: false });
    expect(r.text).toContain('agente');
  });
});

describe('format — reject', () => {
  it('debe pedir reformular', async () => {
    const r = await fmt({ intent: 'consulta_general', action: 'reject', success: false });
    expect(r.text.length).toBeGreaterThan(10);
  });
});

describe('format — confirmation_pending', () => {
  it('debe pedir confirmación SÍ/NO', async () => {
    const r = await fmt({ intent: 'cancelar_cita', action: 'confirmation_pending', success: false });
    expect(r.text).toContain('SÍ');
    expect(r.type).toBe('warning');
  });

  it('quickReplies debe ser SÍ/NO', async () => {
    const r = await fmt({ intent: 'cancelar_cita', action: 'confirmation_pending', success: false });
    expect(r.quickReplies).toEqual(['SÍ', 'NO']);
  });
});

// ─── rate_limited ────────────────────────────────────────────────────
describe('format — rate_limited', () => {
  it('debe devolver mensaje de rate limit', async () => {
    const r = await fmt({ intent: 'rate_limited' });
    expect(r.text).toContain('Demasiados');
    expect(r.type).toBe('warning');
    expect(r.emoji).toBe('⏳');
  });
});

// ─── Emojis por intent ───────────────────────────────────────────────
describe('format — emojis', () => {
  it('crear_lead debe tener 👤', async () => {
    const r = await fmt({ intent: 'crear_lead', action: 'execute', success: true, data: { nombre: 'X' } });
    expect(r.emoji).toBe('👤');
  });

  it('agendar_cita debe tener 📅', async () => {
    const r = await fmt({ intent: 'agendar_cita', action: 'execute', success: true, data: {} });
    expect(r.emoji).toBe('📅');
  });

  it('crear_factura debe tener 🧾', async () => {
    const r = await fmt({ intent: 'crear_factura', action: 'execute', success: true, data: { invoice: { sequenceNumber: 'F-001' } } });
    expect(r.emoji).toBe('🧾');
  });

  it('intent desconocido debe tener emoji por defecto (info)', async () => {
    const r = await fmt({ intent: 'intent_inexistente', action: 'execute', success: true, data: {} });
    expect(r.emoji).toBe('✅');
  });
});

// ─── Quick replies ───────────────────────────────────────────────────
describe('format — quickReplies', () => {
  it('crear_lead execute debe sugerir siguientes pasos', async () => {
    const r = await fmt({ intent: 'crear_lead', action: 'execute', success: true, data: { nombre: 'X' } });
    expect(r.quickReplies).not.toBeUndefined();
    expect(r.quickReplies!).toContain('➕ Otro lead');
  });

  it('mis_citas execute debe sugerir filtros', async () => {
    const r = await fmt({ intent: 'mis_citas', action: 'execute', success: true, data: { citas: [] } });
    expect(r.quickReplies).not.toBeUndefined();
    expect(r.quickReplies!).toContain('📅 Hoy');
  });

  it('registrar_gasto execute debe sugerir acciones', async () => {
    const r = await fmt({ intent: 'registrar_gasto', action: 'execute', success: true, data: { monto: 100 } });
    expect(r.quickReplies).not.toBeUndefined();
    expect(r.quickReplies!).toContain('💰 Otro gasto');
  });

  it('ask_clarification para buscar_lead debe tener quickReplies', async () => {
    const r = await fmt({ intent: 'buscar_lead', action: 'ask_clarification', success: false });
    expect(r.quickReplies).toContain('👤 Ver todos');
  });
});

// ─── detectar_ghosting (leads inactivos) ──────────────────────────────
describe('format — detectar_ghosting', () => {
  it('lista los leads fantasma en vez del genérico ¡Hecho!', async () => {
    const r = await fmt({
      intent: 'detectar_ghosting',
      action: 'execute',
      success: true,
      data: [
        { nombre: 'Eduardo Cázares', horasInactivo: 120, draftRescate: '¿Seguimos con el Penthouse?' },
        { nombre: 'Sophie Laurent', horasInactivo: 72 },
      ],
    });
    expect(r.emoji).toBe('👻');
    expect(r.text).toContain('*Leads fantasma (2):*');
    expect(r.text).toContain('Eduardo Cázares — inactivo 120h (~5 días)');
    expect(r.text).toContain('Sophie Laurent — inactivo 72h (~3 días)');
    expect(r.text).toContain('💬 ¿Seguimos con el Penthouse?');
    expect(r.text).not.toContain('¡Hecho!');
  });

  it('sin leads fantasma devuelve mensaje de tranquilidad', async () => {
    const r = await fmt({ intent: 'detectar_ghosting', action: 'execute', success: true, data: [] });
    expect(r.text).toContain('No hay leads fantasma');
  });
});

// ─── Intent desconocido (usa consulta_general como fallback) ─────────
describe('format — fallback a consulta_general', () => {
  it('execute exitoso con intent desconocido usa plantilla genérica', async () => {
    const r = await fmt({ intent: 'xyz_inexistente', action: 'execute', success: true, data: {} });
    expect(r.text).toBe('✅ ¡Hecho! ¿Necesitas algo más?');
  });

  it('error con intent desconocido usa plantilla genérica', async () => {
    const r = await fmt({ intent: 'xyz_inexistente', action: 'error', success: false, error: 'BOOM' });
    expect(r.text).toContain('BOOM');
  });
});

// ─── Casos borde ─────────────────────────────────────────────────────
describe('format — edge cases', () => {
  it('data undefined no debe romper', async () => {
    const r = await fmt({ intent: 'crear_lead', action: 'execute', success: true });
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('data con nombre vacío', async () => {
    const r = await fmt({ intent: 'crear_lead', action: 'execute', success: true, data: { nombre: '', email: '' } });
    expect(r.text).toContain('nuevo');
  });

  it('mis_negocios con data en array', async () => {
    const r = await fmt({
      intent: 'mis_negocios',
      action: 'execute',
      success: true,
      data: { deals: [{ titulo: 'Deal A', monto: 5000, etapa: 'negociacion', lead: { nombre: 'Juan' } }] },
    });
    expect(r.text).toContain('Deal A');
    expect(r.text).toContain('Juan');
  });
});
