import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Webhooks ───────────────────────────────────────────────────
import {
  IncomingWebhookCreateSchema,
  BillingWebhookSchema,
  SignatureWebhookSchema,
  OutgoingWebhookCreateSchema,
  InboundInvoiceWebhookSchema,
} from '@/lib/validation/schemas/webhooks';

// ─── Subscriptions ──────────────────────────────────────────────
import {
  SubscriptionCreateSchema,
  FeatureLimitCheckSchema,
  CouponRedeemSchema,
  AdminCouponCreateSchema,
} from '@/lib/validation/schemas/subscriptions';

// ─── API Keys ───────────────────────────────────────────────────
import { ApiKeyCreateSchema } from '@/lib/validation/schemas/api-keys';

// ─── Contacts ───────────────────────────────────────────────────
import {
  ContactCreateSchema,
  ContactImportSchema,
} from '@/lib/validation/schemas/contacts';

// ─── Leads ──────────────────────────────────────────────────────
import {
  LeadCreateSchema,
  LeadNoteSchema,
  ExternalLeadImportSchema,
  LeadTaskSchema,
} from '@/lib/validation/schemas/leads';

// ─── Deals ──────────────────────────────────────────────────────
import { DealCreateSchema } from '@/lib/validation/schemas/deals';

// ─── Facturas / Fiscal ──────────────────────────────────────────
import {
  InvoiceCreateSchema,
  ContratoCreateSchema,
  PerfilFiscalCreateSchema,
  FiscalValidationSchema,
} from '@/lib/validation/schemas/facturas';

// ─── Equality ───────────────────────────────────────────────────
import {
  EqualityComplaintCreateSchema,
} from '@/lib/validation/schemas/equality';

// ─── Helper ─────────────────────────────────────────────────────
function check(schema: z.ZodTypeAny, data: unknown) {
  return schema.safeParse(data);
}

function ok(schema: z.ZodTypeAny, data: unknown) {
  const r = check(schema, data);
  if (!r.success) {
    console.error('Expected success but got:', JSON.stringify(r.error.issues, null, 2));
  }
  expect(r.success).toBe(true);
}

function fail(schema: z.ZodTypeAny, data: unknown, pathContains?: string) {
  const r = check(schema, data);
  expect(r.success).toBe(false);
  if (pathContains && !r.success) {
    const paths = r.error.issues.map(i => i.path.join('.'));
    expect(paths.some(p => p.includes(pathContains))).toBe(true);
  }
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Webhooks', () => {
  describe('IncomingWebhookCreateSchema', () => {
    const valid = {
      nombre: 'Webhook de Prueba',
      accion: 'crear_lead' as const,
    };

    it('debe aceptar datos válidos mínimos', () => {
      ok(IncomingWebhookCreateSchema, valid);
    });

    it('debe aceptar con automationId para disparar_automatizacion', () => {
      ok(IncomingWebhookCreateSchema, {
        ...valid,
        accion: 'disparar_automatizacion',
        automationId: 'cuid12345678901234567890',
      });
    });

    it('debe rechazar si accion es disparar_automatizacion sin automationId (refine)', () => {
      fail(IncomingWebhookCreateSchema, {
        ...valid,
        accion: 'disparar_automatizacion',
      }, 'automationId');
    });

    it('debe aceptar automationId opcional para otras acciones', () => {
      ok(IncomingWebhookCreateSchema, { ...valid, automationId: 'cuid12345678901234567890' });
    });

    it('debe rechazar nombre vacío', () => {
      fail(IncomingWebhookCreateSchema, { ...valid, nombre: '' }, 'nombre');
    });

    it('debe rechazar accion inválida', () => {
      fail(IncomingWebhookCreateSchema, { ...valid, accion: 'accion_falsa' }, 'accion');
    });

    it('debe aceptar campos opcionales de mapeo', () => {
      ok(IncomingWebhookCreateSchema, {
        ...valid,
        mapeoNombre: 'data.name',
        mapeoEmail: 'data.email',
        mapeoCustom: { extra: 'data.field' },
      });
    });
  });

  describe('BillingWebhookSchema', () => {
    it('debe aceptar payment_succeeded', () => {
      ok(BillingWebhookSchema, { event: 'payment_succeeded', subscriptionId: 'sub_123' });
    });

    it('debe aceptar subscription_cancelled', () => {
      ok(BillingWebhookSchema, { event: 'subscription_cancelled', subscriptionId: 'sub_456' });
    });

    it('debe rechazar event inválido', () => {
      fail(BillingWebhookSchema, { event: 'refund_processed', subscriptionId: 'sub_123' }, 'event');
    });

    it('debe rechazar sin subscriptionId', () => {
      fail(BillingWebhookSchema, { event: 'payment_succeeded' }, 'subscriptionId');
    });
  });

  describe('SignatureWebhookSchema (passthrough)', () => {
    it('debe aceptar campos conocidos', () => {
      ok(SignatureWebhookSchema, {
        event: 'signature_completed',
        documentId: 'doc_001',
        signerId: 'signer_abc',
        status: 'signed',
        signedAt: '2024-06-15T14:30:00.000Z',
      });
    });

    it('debe aceptar campos adicionales (passthrough)', () => {
      ok(SignatureWebhookSchema, {
        event: 'signature_completed',
        customField: 'value',
        otroDato: 123,
        nested: { deep: true },
      });
    });

    it('debe rechazar sin event', () => {
      fail(SignatureWebhookSchema, {}, 'event');
    });
  });

  describe('OutgoingWebhookCreateSchema', () => {
    const valid = {
      nombre: 'Outgoing Test',
      url: 'https://example.com/webhook',
      eventos: ['lead.created'],
    };

    it('debe aceptar datos válidos mínimos', () => {
      ok(OutgoingWebhookCreateSchema, valid);
    });

    it('debe aplicar defaults (metodoHttp=POST, maxReintentos=3, timeoutSegundos=30)', () => {
      const r = check(OutgoingWebhookCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.metodoHttp).toBe('POST');
        expect(r.data.maxReintentos).toBe(3);
        expect(r.data.timeoutSegundos).toBe(30);
      }
    });

    it('debe rechazar URL inválida', () => {
      fail(OutgoingWebhookCreateSchema, { ...valid, url: 'no-es-url' }, 'url');
    });

    it('debe rechazar eventos vacío', () => {
      fail(OutgoingWebhookCreateSchema, { ...valid, eventos: [] }, 'eventos');
    });
  });

  describe('InboundInvoiceWebhookSchema', () => {
    it('debe aceptar con data', () => {
      ok(InboundInvoiceWebhookSchema, {
        tenantId: 'tenant-001',
        data: { factura: 'info' },
      });
    });

    it('debe aplicar default format=volkern_json', () => {
      const r = check(InboundInvoiceWebhookSchema, { tenantId: 't1', data: {} });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.format).toBe('volkern_json');
    });

    it('debe rechazar sin data', () => {
      fail(InboundInvoiceWebhookSchema, { tenantId: 't1' }, 'data');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Subscriptions', () => {
  describe('SubscriptionCreateSchema', () => {
    it('debe aceptar plan starter', () => {
      ok(SubscriptionCreateSchema, { planId: 'starter' });
    });

    it('debe aceptar plan pro', () => {
      ok(SubscriptionCreateSchema, { planId: 'pro' });
    });

    it('debe aceptar plan agency-slot', () => {
      ok(SubscriptionCreateSchema, { planId: 'agency-slot' });
    });

    it('debe rechazar plan inválido', () => {
      fail(SubscriptionCreateSchema, { planId: 'enterprise' }, 'planId');
    });

    it('debe rechazar sin planId', () => {
      fail(SubscriptionCreateSchema, {}, 'planId');
    });
  });

  describe('FeatureLimitCheckSchema', () => {
    it('debe aceptar feature válido', () => {
      ok(FeatureLimitCheckSchema, { feature: 'leads' });
    });

    it('debe aceptar con amount', () => {
      ok(FeatureLimitCheckSchema, { feature: 'users', amount: 5 });
    });

    it('debe rechazar feature inválido', () => {
      fail(FeatureLimitCheckSchema, { feature: 'billing' }, 'feature');
    });

    it('debe rechazar amount <= 0', () => {
      fail(FeatureLimitCheckSchema, { feature: 'leads', amount: 0 }, 'amount');
    });
  });

  describe('CouponRedeemSchema', () => {
    it('debe aceptar cupón válido', () => {
      ok(CouponRedeemSchema, {
        code: 'BIENVENIDO10',
        email: 'user@test.com',
        tenantId: 'tenant-001',
      });
    });

    it('debe rechazar código vacío', () => {
      fail(CouponRedeemSchema, {
        code: '',
        email: 'user@test.com',
        tenantId: 'tenant-001',
      }, 'code');
    });

    it('debe rechazar email inválido', () => {
      fail(CouponRedeemSchema, {
        code: 'BIENVENIDO10',
        email: 'no-email',
        tenantId: 'tenant-001',
      }, 'email');
    });
  });

  describe('AdminCouponCreateSchema', () => {
    const valid = {
      justification: 'Campaña de verano 2024',
    };

    it('debe aceptar datos mínimos', () => {
      ok(AdminCouponCreateSchema, valid);
    });

    it('debe aplicar defaults (durationDays=30, discountPercent=0, limiteLeads=1000, limiteUsuarios=5)', () => {
      const r = check(AdminCouponCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.durationDays).toBe(30);
        expect(r.data.discountPercent).toBe(0);
        expect(r.data.limiteLeads).toBe(1000);
        expect(r.data.limiteUsuarios).toBe(5);
      }
    });

    it('debe rechazar justification vacía', () => {
      fail(AdminCouponCreateSchema, { justification: '' }, 'justification');
    });

    it('debe rechazar discountPercent > 100', () => {
      fail(AdminCouponCreateSchema, { ...valid, discountPercent: 150 }, 'discountPercent');
    });

    it('debe rechazar durationDays > 365', () => {
      fail(AdminCouponCreateSchema, { ...valid, durationDays: 400 }, 'durationDays');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// API KEYS
// ═══════════════════════════════════════════════════════════════════
describe('Zod — API Keys', () => {
  describe('ApiKeyCreateSchema', () => {
    const valid = {
      nombre: 'Production Key',
      scopes: ['leads:read', 'contacts:write'],
    };

    it('debe aceptar datos válidos', () => {
      ok(ApiKeyCreateSchema, valid);
    });

    it('debe aceptar con expiraEn opcional', () => {
      ok(ApiKeyCreateSchema, {
        ...valid,
        expiraEn: '2025-12-31T23:59:59.000Z',
      });
    });

    it('debe rechazar sin nombre', () => {
      fail(ApiKeyCreateSchema, { scopes: ['leads:read'] }, 'nombre');
    });

    it('debe rechazar sin scopes', () => {
      fail(ApiKeyCreateSchema, { nombre: 'Key' }, 'scopes');
    });

    it('debe rechazar scopes vacío', () => {
      fail(ApiKeyCreateSchema, { nombre: 'Key', scopes: [] }, 'scopes');
    });

    it('debe rechazar scope inválido', () => {
      fail(ApiKeyCreateSchema, { nombre: 'Key', scopes: ['invalid:scope'] }, 'scopes');
    });

    it('debe aceptar scopes válidos del sistema (leads, contacts, deals, automations, messages, tasks)', () => {
      ok(ApiKeyCreateSchema, {
        nombre: 'Full Key',
        scopes: ['leads:read', 'contacts:write', 'deals:read', 'automations:write', 'messages:read', 'tasks:delete'],
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Contacts', () => {
  describe('ContactCreateSchema', () => {
    const valid = {
      nombre: 'María García',
      email: 'maria@test.com',
    };

    it('debe aceptar datos mínimos', () => {
      ok(ContactCreateSchema, valid);
    });

    it('debe aplicar default tipo=person', () => {
      const r = check(ContactCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.tipo).toBe('person');
    });

    it('debe aceptar tipo company', () => {
      ok(ContactCreateSchema, { ...valid, tipo: 'company' });
    });

    it('debe rechazar nombre vacío', () => {
      fail(ContactCreateSchema, { ...valid, nombre: '' }, 'nombre');
    });

    it('debe rechazar email inválido', () => {
      fail(ContactCreateSchema, { ...valid, email: 'bad-email' }, 'email');
    });

    it('debe rechazar linkedin no URL', () => {
      fail(ContactCreateSchema, { ...valid, linkedin: 'not-a-url' }, 'linkedin');
    });

    it('debe aceptar linkedin URL válida', () => {
      ok(ContactCreateSchema, { ...valid, linkedin: 'https://linkedin.com/in/test' });
    });
  });

  describe('ContactImportSchema', () => {
    it('debe aceptar importación con 1 contacto', () => {
      ok(ContactImportSchema, {
        contacts: [{ nombre: 'Juan', email: 'juan@test.com' }],
      });
    });

    it('debe rechazar contacts vacío', () => {
      fail(ContactImportSchema, { contacts: [] }, 'contacts');
    });

    it('debe rechazar más de 500 contactos', () => {
      const contacts = Array.from({ length: 501 }, (_, i) => ({
        nombre: `Contacto ${i}`,
        email: `c${i}@test.com`,
      }));
      fail(ContactImportSchema, { contacts }, 'contacts');
    });

    it('debe aceptar 500 contactos (límite)', () => {
      const contacts = Array.from({ length: 500 }, (_, i) => ({
        nombre: `Contacto ${i}`,
        email: `c${i}@test.com`,
      }));
      ok(ContactImportSchema, { contacts });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Leads', () => {
  describe('LeadCreateSchema', () => {
    const valid = {
      nombre: 'Juan Pérez',
      email: 'juan@test.com',
    };

    it('debe aceptar datos mínimos', () => {
      ok(LeadCreateSchema, valid);
    });

    it('debe aceptar con campos opcionales', () => {
      ok(LeadCreateSchema, {
        ...valid,
        telefono: '+34600000000',
        empresa: 'Acme Corp',
        fuente: 'web',
        etapa: 'nuevo',
        scoreValue: 85,
        tags: 'vip,urgente',
      });
    });

    it('debe rechazar email inválido', () => {
      fail(LeadCreateSchema, { nombre: 'X', email: 'bad' }, 'email');
    });

    it('debe rechazar linkedin no URL', () => {
      fail(LeadCreateSchema, { ...valid, linkedin: 'no-url' }, 'linkedin');
    });
  });

  describe('LeadNoteSchema', () => {
    it('debe aceptar nota con sentimiento', () => {
      ok(LeadNoteSchema, {
        contenido: 'Cliente muy interesado en el producto',
        sentimiento: 'positivo',
      });
    });

    it('debe aceptar nota sin sentimiento', () => {
      ok(LeadNoteSchema, { contenido: 'Llamada de seguimiento' });
    });

    it('debe aceptar sentimiento neutral y negativo', () => {
      ok(LeadNoteSchema, { contenido: 'Ok', sentimiento: 'neutral' });
      ok(LeadNoteSchema, { contenido: 'Mal', sentimiento: 'negativo' });
    });

    it('debe rechazar sentimiento inválido', () => {
      fail(LeadNoteSchema, { contenido: 'Test', sentimiento: 'enojado' }, 'sentimiento');
    });

    it('debe rechazar contenido vacío', () => {
      fail(LeadNoteSchema, { contenido: '' }, 'contenido');
    });
  });

  describe('ExternalLeadImportSchema', () => {
    it('debe aceptar importación válida', () => {
      ok(ExternalLeadImportSchema, {
        leads: [
          { nombre: 'Lead 1', email: 'l1@test.com' },
          { nombre: 'Lead 2' }, // email opcional
        ],
      });
    });

    it('debe rechazar si no hay leads', () => {
      fail(ExternalLeadImportSchema, { leads: [] }, 'leads');
    });

    it('debe rechazar más de 500 leads', () => {
      const leads = Array.from({ length: 501 }, (_, i) => ({ nombre: `L${i}` }));
      fail(ExternalLeadImportSchema, { leads }, 'leads');
    });
  });

  describe('LeadTaskSchema', () => {
    it('debe aceptar tarea válida', () => {
      ok(LeadTaskSchema, {
        tipo: 'llamada',
        titulo: 'Llamar para seguimiento',
        fechaVencimiento: '2024-07-15T14:00:00.000Z',
      });
    });

    it('debe aceptar todos los tipos: llamada, email, reunion, recordatorio', () => {
      for (const tipo of ['llamada', 'email', 'reunion', 'recordatorio']) {
        ok(LeadTaskSchema, {
          tipo,
          titulo: `Tarea tipo ${tipo}`,
          fechaVencimiento: '2024-07-15T14:00:00.000Z',
        });
      }
    });

    it('debe rechazar tipo inválido', () => {
      fail(LeadTaskSchema, {
        tipo: 'whatsapp',
        titulo: 'Test',
        fechaVencimiento: '2024-07-15T14:00:00.000Z',
      }, 'tipo');
    });

    it('debe rechazar sin fechaVencimiento', () => {
      fail(LeadTaskSchema, { tipo: 'email', titulo: 'Test' }, 'fechaVencimiento');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// DEALS
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Deals', () => {
  describe('DealCreateSchema', () => {
    const valid = {
      titulo: 'Proyecto Web',
      valor: 5000,
      moneda: 'EUR',
    };

    it('debe aceptar datos mínimos', () => {
      ok(DealCreateSchema, valid);
    });

    it('debe aplicar defaults: etapa=calificacion, probabilidad=25, prioridad=media, estado=activo', () => {
      const r = check(DealCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.etapa).toBe('calificacion');
        expect(r.data.probabilidad).toBe(25);
        expect(r.data.prioridad).toBe('media');
        expect(r.data.estado).toBe('activo');
      }
    });

    it('debe aceptar con newContact anidado', () => {
      ok(DealCreateSchema, {
        ...valid,
        newContact: {
          nombre: 'Nuevo Contacto',
          email: 'nuevo@test.com',
        },
      });
    });

    it('debe aceptar todas las prioridades', () => {
      for (const p of ['baja', 'media', 'alta', 'urgente']) {
        ok(DealCreateSchema, { ...valid, prioridad: p as 'baja' | 'media' | 'alta' | 'urgente' });
      }
    });

    it('debe aceptar todos los estados', () => {
      for (const e of ['activo', 'ganado', 'perdido', 'pausado']) {
        ok(DealCreateSchema, { ...valid, estado: e as 'activo' | 'ganado' | 'perdido' | 'pausado' });
      }
    });

    it('debe rechazar probabilidad > 100', () => {
      fail(DealCreateSchema, { ...valid, probabilidad: 150 }, 'probabilidad');
    });

    it('debe rechazar probabilidad < 0', () => {
      fail(DealCreateSchema, { ...valid, probabilidad: -5 }, 'probabilidad');
    });

    it('debe rechazar valor negativo', () => {
      fail(DealCreateSchema, { ...valid, valor: -100 }, 'valor');
    });

    it('debe rechazar titulo vacío', () => {
      fail(DealCreateSchema, { ...valid, titulo: '' }, 'titulo');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// FACTURAS / FISCAL
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Facturas / Fiscal', () => {
  describe('InvoiceCreateSchema', () => {
    const valid = {
      numero: 'F-2024-001',
      fechaEmision: '2024-06-15T10:00:00.000Z',
      subtotal: 1000,
      total: 1210,
      moneda: 'EUR',
      items: [
        {
          concepto: 'Desarrollo Web',
          cantidad: 1,
          precioUnitario: 1000,
          total: 1000,
        },
        {
          concepto: 'Hosting',
          cantidad: 12,
          precioUnitario: 17.5,
          total: 210,
        },
      ],
    };

    it('debe aceptar factura válida con items', () => {
      ok(InvoiceCreateSchema, valid);
    });

    it('debe aplicar defaults: descuentoPorcentaje=0, descuentoMonto=0, impuestos=0, estado=borrador', () => {
      const r = check(InvoiceCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.descuentoPorcentaje).toBe(0);
        expect(r.data.descuentoMonto).toBe(0);
        expect(r.data.impuestos).toBe(0);
        expect(r.data.estado).toBe('borrador');
      }
    });

    it('debe rechazar sin items', () => {
      fail(InvoiceCreateSchema, { ...valid, items: [] }, 'items');
    });

    it('debe rechazar item con precioUnitario negativo', () => {
      fail(InvoiceCreateSchema, {
        ...valid,
        items: [{ concepto: 'X', cantidad: 1, precioUnitario: -10, total: 0 }],
      }, 'items');
    });

    it('debe rechazar item con cantidad <= 0', () => {
      fail(InvoiceCreateSchema, {
        ...valid,
        items: [{ concepto: 'X', cantidad: 0, precioUnitario: 10, total: 0 }],
      }, 'items');
    });

    it('debe aceptar todos los estados', () => {
      for (const e of ['borrador', 'emitida', 'pagada', 'anulada', 'vencida']) {
        ok(InvoiceCreateSchema, { ...valid, estado: e as 'borrador' });
      }
    });

    it('debe rechazar estado inválido', () => {
      fail(InvoiceCreateSchema, { ...valid, estado: 'perdida' }, 'estado');
    });

    it('debe aceptar items con tasaImpuestoId opcional', () => {
      ok(InvoiceCreateSchema, {
        ...valid,
        items: [{
          concepto: 'Consultoría',
          cantidad: 1,
          precioUnitario: 500,
          total: 500,
          tasaImpuestoId: 'cuid12345678901234567890123',
        }],
      });
    });
  });

  describe('ContratoCreateSchema', () => {
    const valid = {
      contactId: 'cuid12345678901234567890123',
      titulo: 'Contrato de Servicios',
      moneda: 'EUR',
    };

    it('debe aceptar datos mínimos', () => {
      ok(ContratoCreateSchema, valid);
    });

    it('debe aplicar default tipo=servicio', () => {
      const r = check(ContratoCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.tipo).toBe('servicio');
    });

    it('debe aceptar items con porcentajeImpuesto', () => {
      ok(ContratoCreateSchema, {
        ...valid,
        items: [{
          concepto: 'Servicio Mensual',
          cantidad: 12,
          precioUnitario: 250,
          porcentajeImpuesto: 21,
        }],
      });
    });

    it('debe rechazar contactId no válido (menos de 25 chars)', () => {
      fail(ContratoCreateSchema, { ...valid, contactId: 'corto' }, 'contactId');
    });

    it('debe aceptar todas las frecuencias de pago', () => {
      for (const f of ['mensual', 'trimestral', 'anual', 'unico']) {
        ok(ContratoCreateSchema, { ...valid, frecuenciaPago: f as 'mensual' });
      }
    });
  });

  describe('PerfilFiscalCreateSchema (refinements)', () => {
    const valid = {
      leadId: 'cuid12345678901234567890123',
      pais: 'ES',
      tipoIdFiscal: 'NIF',
      idFiscal: 'B76364192',
    };

    it('debe aceptar con leadId', () => {
      ok(PerfilFiscalCreateSchema, valid);
    });

    it('debe aceptar con contactId', () => {
      ok(PerfilFiscalCreateSchema, {
        contactId: 'cuid12345678901234567890123',
        pais: 'ES',
        tipoIdFiscal: 'CIF',
        idFiscal: 'A28015865',
      });
    });

    it('debe rechazar si no hay leadId ni contactId', () => {
      fail(PerfilFiscalCreateSchema, {
        pais: 'ES',
        tipoIdFiscal: 'NIF',
        idFiscal: '12345678Z',
      }, 'leadId');
    });

    it('debe rechazar si hay ambos leadId y contactId', () => {
      fail(PerfilFiscalCreateSchema, {
        leadId: 'cuid12345678901234567890123',
        contactId: 'cuid09876543210987654321098',
        pais: 'ES',
        tipoIdFiscal: 'NIF',
        idFiscal: '12345678Z',
      }, 'leadId');
    });

    it('debe rechazar sin pais', () => {
      fail(PerfilFiscalCreateSchema, {
        leadId: 'cuid12345678901234567890123',
        tipoIdFiscal: 'NIF',
        idFiscal: '12345678Z',
      }, 'pais');
    });
  });

  describe('FiscalValidationSchema', () => {
    it('debe aceptar validación NIF español', () => {
      ok(FiscalValidationSchema, {
        pais: 'ES',
        tipoIdFiscal: 'NIF',
        idFiscal: '12345678Z',
      });
    });

    it('debe aceptar validación CIF', () => {
      ok(FiscalValidationSchema, {
        pais: 'ES',
        tipoIdFiscal: 'CIF',
        idFiscal: 'B76364192',
      });
    });

    it('debe rechazar sin idFiscal', () => {
      fail(FiscalValidationSchema, { pais: 'ES', tipoIdFiscal: 'NIF' }, 'idFiscal');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// EQUALITY
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Equality', () => {
  describe('EqualityComplaintCreateSchema', () => {
    it('debe aceptar denuncia mínima', () => {
      ok(EqualityComplaintCreateSchema, {
        description: 'Descripción de la denuncia',
      });
    });

    it('debe aplicar default isAnonymous=false', () => {
      const r = check(EqualityComplaintCreateSchema, { description: 'Test' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.isAnonymous).toBe(false);
    });

    it('debe aceptar denuncia anónima', () => {
      ok(EqualityComplaintCreateSchema, {
        description: 'Denuncia anónima',
        isAnonymous: true,
      });
    });

    it('debe aceptar con categoría y attachments', () => {
      ok(EqualityComplaintCreateSchema, {
        description: 'Denuncia con evidencia',
        category: 'acoso',
        attachments: ['file1.pdf', 'file2.png'],
      });
    });

    it('debe rechazar descripción vacía', () => {
      fail(EqualityComplaintCreateSchema, { description: '' }, 'description');
    });

    it('debe rechazar sin descripción', () => {
      fail(EqualityComplaintCreateSchema, {}, 'description');
    });
  });
});
