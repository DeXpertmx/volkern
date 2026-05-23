import { describe, it, expect } from 'vitest';
import {
  getGemmaSLAPrompt,
  GEMMA_SLA_SYSTEM_PROMPT,
  type GemmaSLARequest,
} from '@/lib/support/gemma-sla-prompts';

function makeRequest(overrides: Partial<GemmaSLARequest> = {}): GemmaSLARequest {
  return {
    tenantId: 'tenant-1',
    eventType: 'SLA_CHECK',
    ticketId: 'ticket-1',
    timestamp: new Date().toISOString(),
    contextSnapshot: {
      ticket: {
        priority: 'high',
        status: 'open',
        slaDueAt: new Date(Date.now() + 3600000).toISOString(),
        assignedId: 'agent-1',
        subject: 'Test ticket',
        description: 'Test description',
      },
    },
    policy: { allowed_actions: ['notify', 'escalate'], critical: false },
    ...overrides,
  };
}

describe('GEMMA_SLA_SYSTEM_PROMPT', () => {
  it('debe ser un string no vacío', () => {
    expect(typeof GEMMA_SLA_SYSTEM_PROMPT).toBe('string');
    expect(GEMMA_SLA_SYSTEM_PROMPT.length).toBeGreaterThan(50);
  });

  it('debe contener instrucciones JSON', () => {
    expect(GEMMA_SLA_SYSTEM_PROMPT).toContain('JSON');
    expect(GEMMA_SLA_SYSTEM_PROMPT).toContain('STRICT');
  });
});

describe('getGemmaSLAPrompt — SLA_CHECK', () => {
  it('debe incluir tenantId y ticketId', () => {
    const prompt = getGemmaSLAPrompt(makeRequest({ eventType: 'SLA_CHECK' }));
    expect(prompt).toContain('tenant-1');
    expect(prompt).toContain('ticket-1');
  });

  it('debe incluir ANALYZE_SLA_RISK', () => {
    const prompt = getGemmaSLAPrompt(makeRequest({ eventType: 'SLA_CHECK' }));
    expect(prompt).toContain('ANALYZE_SLA_RISK');
  });

  it('debe incluir el contexto del ticket', () => {
    const request = makeRequest({
      eventType: 'SLA_CHECK',
      contextSnapshot: {
        ticket: {
          priority: 'critical',
          status: 'open',
          slaDueAt: '2026-01-15T00:00:00Z',
        },
        timeRemaining: '2h',
        lastActivity: '2026-01-14T20:00:00Z',
        threshold: '4h',
      },
    });
    const prompt = getGemmaSLAPrompt(request);
    expect(prompt).toContain('critical');
    expect(prompt).toContain('2h');
    expect(prompt).toContain('4h');
  });

  it('debe pedir salida JSON con campos esperados', () => {
    const prompt = getGemmaSLAPrompt(makeRequest({ eventType: 'SLA_CHECK' }));
    expect(prompt).toContain('suggestionId');
    expect(prompt).toContain('SLA_WARNING');
    expect(prompt).toContain('suggestedActions');
  });
});

describe('getGemmaSLAPrompt — SLA_BREACH', () => {
  it('debe incluir ORCHESTRATE_BREACH_ESCALATION', () => {
    const request = makeRequest({
      eventType: 'SLA_BREACH',
      contextSnapshot: {
        ticket: {
          priority: 'critical',
          status: 'overdue',
          slaDueAt: '2026-01-14T00:00:00Z',
          assignedId: 'agent-1',
        },
        overdueTime: '4h',
        timeline: [{ action: 'created', date: '2026-01-13' }],
      },
    });
    const prompt = getGemmaSLAPrompt(request);
    expect(prompt).toContain('ORCHESTRATE_BREACH_ESCALATION');
    expect(prompt).toContain('4h');
  });

  it('debe pedir salida JSON tipo SLA_BREACH', () => {
    const request = makeRequest({ eventType: 'SLA_BREACH' });
    const prompt = getGemmaSLAPrompt(request);
    expect(prompt).toContain('SLA_BREACH');
  });
});

describe('getGemmaSLAPrompt — RESOLUTION_COILOT', () => {
  it('debe incluir RESOLUTION_SUGGESTION', () => {
    const request = makeRequest({
      eventType: 'RESOLUTION_COILOT',
      contextSnapshot: {
        ticket: {
          subject: 'Factura duplicada',
          description: 'Cliente reporta cargo doble',
          entityType: 'INVOICE',
          entityId: 'inv-123',
        },
      },
    });
    const prompt = getGemmaSLAPrompt(request);
    expect(prompt).toContain('RESOLUTION_SUGGESTION');
    expect(prompt).toContain('Factura duplicada');
  });

  it('debe pedir salida con severity low', () => {
    const request = makeRequest({ eventType: 'RESOLUTION_COILOT' });
    const prompt = getGemmaSLAPrompt(request);
    expect(prompt).toContain('low');
  });
});

describe('getGemmaSLAPrompt — ESCALATE_REQUEST', () => {
  it('debe incluir General Support para eventType no reconocido', () => {
    const request = makeRequest({ eventType: 'ESCALATE_REQUEST' });
    const prompt = getGemmaSLAPrompt(request);
    expect(prompt).toContain('General Support');
    expect(prompt).toContain('ticket-1');
  });
});
