import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Helpers ────────────────────────────────────────────────
function check(schema: z.ZodTypeAny, data: unknown) {
  return schema.safeParse(data);
}
function ok(schema: z.ZodTypeAny, data: unknown) {
  const r = check(schema, data);
  if (!r.success) console.error('Expected OK but failed:', JSON.stringify(r.error.issues));
  expect(r.success).toBe(true);
  return r.success ? r.data : undefined;
}
function fail(schema: z.ZodTypeAny, data: unknown, pathContains?: string) {
  const r = check(schema, data);
  expect(r.success).toBe(false);
  if (pathContains !== undefined) {
    const paths = r.success ? [] : r.error.issues.map(i => i.path.join('.'));
    expect(paths.some(p => p.includes(pathContains))).toBe(true);
  }
}

// ─── Imports ────────────────────────────────────────────────
import {
  CatalogoItemCreateSchema,
  CatalogoItemUpdateSchema,
  FieldDefinitionCreateSchema,
  FieldDefinitionUpdateSchema,
  FieldDefinitionsReorderSchema,
  FieldDefinitionPresetApplySchema,
  ServicioCreateSchema,
  ServicioUpdateSchema,
  DigitalCardUpsertSchema,
  DigitalCardConnectSchema,
  DigitalCardScanSchema,
  AssetCreateSchema,
} from '@/lib/validation/schemas/inventory';

import {
  CampaignMessageSchema,
  CampaignCreateSchema,
  CampaignUpdateSchema,
  MarketingAiGenerateSchema,
  MarketingAiGenerateSeoSchema,
  MarketingAiGenerateBlockSchema,
  AutomationRuleCreateSchema,
  AutomationRuleUpdateSchema,
  AutomationSimulateSchema,
  MarketingSuppressionSchema,
  SocialPublishSchema,
  WebFormSubmitSchema,
  QueueRetrySchema,
  EmailCampaignCreateSchema,
  EmailCampaignUpdateSchema,
  AudienceCreateSchema,
  AudienceUpdateSchema,
  EmailTemplateCreateSchema,
  SocialConfigSchema,
  SocialPostCreateSchema,
  EmailCampaignDeclararGanadorSchema,
  EmailCampaignConversionSchema,
  EmailCampaignPreviewSchema,
  EmailCampaignPreviewDataSchema,
  EmailCampaignTrackConversionSchema,
  BusinessEmailAccountCreateSchema,
  BusinessEmailConfigSchema,
  BusinessEmailDomainSchema,
} from '@/lib/validation/schemas/marketing';

import {
  ConfiguracionSaveSchema,
  DisponibilidadUpdateSchema,
  WhitelabelUpdateSchema,
  GuideQuerySchema,
  GuideContextSchema,
} from '@/lib/validation/schemas/settings';

import {
  PageCreateSchema,
  PageUpdateSchema,
  PagePublishSchema,
  CmsPageCreateSchema,
  CmsPageUpdateSchema,
  AiSuggestSchema,
  CmsTemplateSchema,
  KnowledgeCreateSchema,
  KnowledgeUpdateSchema,
} from '@/lib/validation/schemas/cms';

import {
  ExternalInvoiceCreateSchema,
  VerifyExpenseSchema,
  ZadarmaTestSchema,
  ZadarmaCallbackSchema,
  TelephonyConfigSchema,
  StripeInvoicingConfigSchema,
} from '@/lib/validation/schemas/finance';

// ═════════════════════════════════════════════════════════════
// INVENTORY
// ═════════════════════════════════════════════════════════════

describe('CatalogoItemCreateSchema', () => {
  const valid = { nombre: 'Servicio Premium', precioBase: 150 };

  it('debe aceptar datos mínimos', () => ok(CatalogoItemCreateSchema, valid));
  it('debe aplicar default tipo=servicio', () => {
    const r = ok(CatalogoItemCreateSchema, valid);
    expect(r.tipo).toBe('servicio');
  });
  it('debe aplicar default activo=true', () => {
    const r = ok(CatalogoItemCreateSchema, valid);
    expect(r.activo).toBe(true);
  });
  it('debe aplicar default destacado=false', () => {
    const r = ok(CatalogoItemCreateSchema, valid);
    expect(r.destacado).toBe(false);
  });
  it('debe aplicar default categoriaFiscal=general', () => {
    const r = ok(CatalogoItemCreateSchema, valid);
    expect(r.categoriaFiscal).toBe('general');
  });
  it('debe aplicar default unidad=unidad', () => {
    const r = ok(CatalogoItemCreateSchema, valid);
    expect(r.unidad).toBe('unidad');
  });
  it('debe coerce precioBase string a number', () => {
    const r = ok(CatalogoItemCreateSchema, { nombre: 'X', precioBase: '299.99' });
    expect(r.precioBase).toBe(299.99);
  });
  it('debe rechazar sin nombre', () => fail(CatalogoItemCreateSchema, { precioBase: 100 }, 'nombre'));
  it('debe rechazar tipo inválido', () => fail(CatalogoItemCreateSchema, { ...valid, tipo: 'bad' }, 'tipo'));
  it('debe aceptar tipo=curso', () => ok(CatalogoItemCreateSchema, { ...valid, tipo: 'curso' }));
  it('debe aceptar isManufactured con BOM', () => {
    ok(CatalogoItemCreateSchema, {
      ...valid,
      isManufactured: true,
      bom: {
        laborCost: '50',
        overheadCost: '10',
        components: [{ componentId: 'c123', quantityRequired: '2', unit: 'kg' }]
      }
    });
  });
  it('debe coerce costOfAcquisition string a number', () => {
    const r = ok(CatalogoItemCreateSchema, { ...valid, costOfAcquisition: '50.50' });
    expect(r.costOfAcquisition).toBe(50.5);
  });
  it('debe aceptar metadata y customFieldValues como record', () => {
    ok(CatalogoItemCreateSchema, { ...valid, metadata: { foo: 'bar' }, customFieldValues: { color: 'red' } });
  });
  it('debe aceptar categorias y etiquetas como arrays', () => {
    ok(CatalogoItemCreateSchema, { ...valid, categorias: ['cat1'], etiquetas: ['tag1', 'tag2'] });
  });
});

describe('CatalogoItemUpdateSchema', () => {
  it('debe aceptar objeto vacío (todo opcional)', () => ok(CatalogoItemUpdateSchema, {}));
  it('debe aceptar actualización parcial', () => ok(CatalogoItemUpdateSchema, { nombre: 'Nuevo', activo: false }));
  it('debe coerce precioBase', () => {
    const r = ok(CatalogoItemUpdateSchema, { precioBase: '99.99' });
    expect(r.precioBase).toBe(99.99);
  });
  it('debe rechazar nombre vacío', () => fail(CatalogoItemUpdateSchema, { nombre: '' }, 'nombre'));
});

describe('FieldDefinitionCreateSchema', () => {
  const valid = { fieldKey: 'my_field', label: 'Mi Campo', type: 'text' };

  it('debe aceptar datos mínimos', () => ok(FieldDefinitionCreateSchema, valid));
  it('debe rechazar fieldKey con espacios', () => fail(FieldDefinitionCreateSchema, { ...valid, fieldKey: 'my field' }, 'fieldKey'));
  it('debe rechazar fieldKey empezando con número', () => fail(FieldDefinitionCreateSchema, { ...valid, fieldKey: '1bad' }, 'fieldKey'));
  it('debe aceptar fieldKey con _ y números', () => ok(FieldDefinitionCreateSchema, { ...valid, fieldKey: 'field_123' }));
  it('debe aceptar todos los tipos válidos', () => {
    for (const t of ['text', 'number', 'select', 'boolean', 'date', 'url', 'textarea']) {
      ok(FieldDefinitionCreateSchema, { ...valid, type: t, options: t === 'select' ? ['A'] : undefined });
    }
  });
  it('debe rechazar type=select sin options', () => fail(FieldDefinitionCreateSchema, { ...valid, type: 'select' }, 'options'));
  it('debe rechazar type inválido', () => fail(FieldDefinitionCreateSchema, { ...valid, type: 'badtype' }));
  it('debe aplicar default required=false', () => {
    const r = ok(FieldDefinitionCreateSchema, valid);
    expect(r.required).toBe(false);
  });
});

describe('FieldDefinitionUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(FieldDefinitionUpdateSchema, {}));
  it('debe aceptar type=select con options', () => ok(FieldDefinitionUpdateSchema, { type: 'select', options: ['A'] }));
});

describe('FieldDefinitionsReorderSchema', () => {
  it('debe aceptar array de IDs', () => ok(FieldDefinitionsReorderSchema, { orderedIds: ['a', 'b', 'c'] }));
  it('debe rechazar array vacío', () => fail(FieldDefinitionsReorderSchema, { orderedIds: [] }, 'orderedIds'));
});

describe('FieldDefinitionPresetApplySchema', () => {
  it('debe aceptar con industria', () => ok(FieldDefinitionPresetApplySchema, { industria: 'legal' }));
  it('debe aplicar default sobreescribir=false', () => {
    const r = ok(FieldDefinitionPresetApplySchema, { industria: 'tech' });
    expect(r.sobreescribir).toBe(false);
  });
  it('debe rechazar sin industria', () => fail(FieldDefinitionPresetApplySchema, {}, 'industria'));
});

describe('ServicioCreateSchema', () => {
  const valid = { nombre: 'Consulta', moneda: 'EUR', precio: 100, duracionMinutos: 60 };

  it('debe aceptar datos completos', () => ok(ServicioCreateSchema, valid));
  it('debe aceptar duracion_minutos como alternativa', () => ok(ServicioCreateSchema, { ...valid, duracionMinutos: undefined, duracion_minutos: '45' }));
  it('debe rechazar sin duración', () => fail(ServicioCreateSchema, { nombre: 'X', moneda: 'EUR', precio: 100 }, 'duracionMinutos'));
  it('debe coerce precio string a number', () => {
    const r = ok(ServicioCreateSchema, { ...valid, precio: '200' });
    expect(r.precio).toBe(200);
  });
  it('debe aplicar default modalidad=presencial', () => {
    const r = ok(ServicioCreateSchema, valid);
    expect(r.modalidad).toBe('presencial');
  });
});

describe('ServicioUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(ServicioUpdateSchema, {}));
  it('debe aceptar activo=false', () => ok(ServicioUpdateSchema, { activo: false }));
});

describe('DigitalCardUpsertSchema', () => {
  const valid = { nombre: 'Juan Pérez' };

  it('debe aceptar datos mínimos', () => ok(DigitalCardUpsertSchema, valid));
  it('debe aplicar template default=modern', () => {
    const r = ok(DigitalCardUpsertSchema, valid);
    expect(r.template).toBe('modern');
  });
  it('debe aplicar fontFamily default=Inter', () => {
    const r = ok(DigitalCardUpsertSchema, valid);
    expect(r.fontFamily).toBe('Inter');
  });
  it('debe rechazar color hex inválido', () => fail(DigitalCardUpsertSchema, { ...valid, colorPrimario: 'red' }, 'colorPrimario'));
  it('debe aceptar colores hex válidos', () => ok(DigitalCardUpsertSchema, { ...valid, colorPrimario: '#FF5733', colorFondo: '#000000' }));
  it('debe aceptar todos los templates', () => {
    for (const t of ['modern', 'classic', 'minimal', 'bold', 'elegant']) {
      ok(DigitalCardUpsertSchema, { ...valid, template: t });
    }
  });
  it('debe aceptar todos los layoutStyles', () => {
    for (const s of ['standard', 'compact', 'wide', 'creative']) {
      ok(DigitalCardUpsertSchema, { ...valid, layoutStyle: s });
    }
  });
  it('debe aceptar todos los backgroundPatterns', () => {
    for (const p of ['none', 'dots', 'lines', 'waves', 'grid']) {
      ok(DigitalCardUpsertSchema, { ...valid, backgroundPattern: p });
    }
  });
  it('debe aceptar email vacío o válido', () => {
    ok(DigitalCardUpsertSchema, { ...valid, email: '' });
    ok(DigitalCardUpsertSchema, { ...valid, email: 'test@example.com' });
  });
  it('debe rechazar email inválido', () => fail(DigitalCardUpsertSchema, { ...valid, email: 'bad-email' }));
  it('debe aceptar redesSociales como record', () => {
    ok(DigitalCardUpsertSchema, { ...valid, redesSociales: { linkedin: 'url', twitter: 'url' } });
  });
});

describe('DigitalCardConnectSchema', () => {
  const valid = { cardId: 'card123' };

  it('debe aceptar con email', () => ok(DigitalCardConnectSchema, { ...valid, email: 'a@b.com' }));
  it('debe aceptar con telefono', () => ok(DigitalCardConnectSchema, { ...valid, telefono: '123456' }));
  it('debe rechazar sin email ni telefono', () => fail(DigitalCardConnectSchema, { cardId: 'x' }));
  it('debe aceptar email vacío si hay teléfono', () => ok(DigitalCardConnectSchema, { ...valid, email: '', telefono: '123' }));
});

describe('DigitalCardScanSchema', () => {
  const valid = { nombre: 'Contacto Escaneado' };

  it('debe aceptar datos mínimos', () => ok(DigitalCardScanSchema, valid));
  it('debe aceptar email vacío o válido', () => {
    ok(DigitalCardScanSchema, { ...valid, email: '' });
    ok(DigitalCardScanSchema, { ...valid, email: 'scan@example.com' });
  });
  it('debe aceptar datosAdicionales', () => ok(DigitalCardScanSchema, { ...valid, datosAdicionales: { cargo: 'CEO' } }));
});

describe('AssetCreateSchema', () => {
  it('debe aceptar datos mínimos', () => ok(AssetCreateSchema, { name: 'Laptop Dell' }));
  it('debe coerce purchasePrice string a number', () => {
    const r = ok(AssetCreateSchema, { name: 'Laptop', purchasePrice: '1200.50' });
    expect(r.purchasePrice).toBe(1200.5);
  });
  it('debe permitir campos extra (passthrough)', () => {
    const r = ok(AssetCreateSchema, { name: 'Asset', customField: 'extra' });
    expect(r.customField).toBe('extra');
  });
  it('debe rechazar sin name', () => fail(AssetCreateSchema, {}, 'name'));
});

// ═════════════════════════════════════════════════════════════
// MARKETING
// ═════════════════════════════════════════════════════════════

describe('CampaignMessageSchema', () => {
  const valid = { canal: 'email', contenido: 'Hola {{nombre}}' };

  it('debe aceptar datos mínimos', () => ok(CampaignMessageSchema, valid));
  it('debe aplicar orden default=0', () => {
    const r = ok(CampaignMessageSchema, valid);
    expect(r.orden).toBe(0);
  });
  it('debe rechazar sin contenido', () => fail(CampaignMessageSchema, { canal: 'sms' }, 'contenido'));
  it('debe rechazar delayMinutos negativo', () => fail(CampaignMessageSchema, { ...valid, delayMinutos: -5 }, 'delayMinutos'));
  it('debe coerce orden string a number', () => {
    const r = ok(CampaignMessageSchema, { ...valid, orden: '3' });
    expect(r.orden).toBe(3);
  });
  it('debe aceptar porcentajeTrafico 0-100', () => {
    ok(CampaignMessageSchema, { ...valid, porcentajeTrafico: 0 });
    ok(CampaignMessageSchema, { ...valid, porcentajeTrafico: 100 });
  });
  it('debe rechazar porcentajeTrafico > 100', () => fail(CampaignMessageSchema, { ...valid, porcentajeTrafico: 101 }, 'porcentajeTrafico'));
  it('debe aceptar mediaUrl como URL', () => ok(CampaignMessageSchema, { ...valid, mediaUrl: 'https://img.com/pic.jpg' }));
  it('debe rechazar mediaUrl no URL', () => fail(CampaignMessageSchema, { ...valid, mediaUrl: 'not-url' }, 'mediaUrl'));
});

describe('CampaignCreateSchema', () => {
  const valid = { nombre: 'Campaña Verano', mensajes: [{ canal: 'email', contenido: 'Oferta' }] };

  it('debe aceptar datos mínimos', () => ok(CampaignCreateSchema, valid));
  it('debe aplicar default tipo=manual', () => {
    const r = ok(CampaignCreateSchema, valid);
    expect(r.tipo).toBe('manual');
  });
  it('debe aplicar targetType=todos por default', () => {
    const r = ok(CampaignCreateSchema, valid);
    expect(r.targetType).toBe('todos');
  });
  it('debe aceptar fechaProgramada ISO', () => ok(CampaignCreateSchema, { ...valid, fechaProgramada: '2025-12-25T10:00:00.000Z' }));
  it('debe rechazar fechaProgramada no ISO', () => fail(CampaignCreateSchema, { ...valid, fechaProgramada: 'navidad' }, 'fechaProgramada'));
  it('debe rechazar sin nombre', () => fail(CampaignCreateSchema, { mensajes: valid.mensajes }, 'nombre'));
});

describe('CampaignUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(CampaignUpdateSchema, {}));
});

describe('MarketingAiGenerateSchema', () => {
  it('debe aceptar con prompt', () => ok(MarketingAiGenerateSchema, { prompt: 'Copy para facebook' }));
  it('debe aplicar default platform=general', () => {
    const r = ok(MarketingAiGenerateSchema, { prompt: 'test' });
    expect(r.platform).toBe('general');
  });
  it('debe rechazar sin prompt', () => fail(MarketingAiGenerateSchema, {}));
});

describe('MarketingAiGenerateSeoSchema', () => {
  it('debe aceptar con pageTitle', () => ok(MarketingAiGenerateSeoSchema, { pageTitle: 'SEO Guide' }));
  it('debe aplicar default contentSnippet=""', () => {
    const r = ok(MarketingAiGenerateSeoSchema, { pageTitle: 'T' });
    expect(r.contentSnippet).toBe('');
  });
});

describe('MarketingAiGenerateBlockSchema', () => {
  it('debe aceptar con description', () => ok(MarketingAiGenerateBlockSchema, { description: 'Hero con CTA' }));
  it('debe aplicar default category=General', () => {
    const r = ok(MarketingAiGenerateBlockSchema, { description: 'D' });
    expect(r.category).toBe('General');
  });
});

describe('AutomationRuleCreateSchema', () => {
  const valid = { name: 'Lead Score > 80', trigger: 'lead.created' };

  it('debe aceptar datos mínimos', () => ok(AutomationRuleCreateSchema, valid));
  it('debe aplicar isActive=true', () => {
    const r = ok(AutomationRuleCreateSchema, valid);
    expect(r.isActive).toBe(true);
  });
  it('debe aplicar priority=0', () => {
    const r = ok(AutomationRuleCreateSchema, valid);
    expect(r.priority).toBe(0);
  });
  it('debe coerce priority string a number', () => {
    const r = ok(AutomationRuleCreateSchema, { ...valid, priority: '5' });
    expect(r.priority).toBe(5);
  });
});

describe('AutomationRuleUpdateSchema', () => {
  it('debe aceptar con ID', () => ok(AutomationRuleUpdateSchema, { id: 'rule-1' }));
  it('debe rechazar sin ID', () => fail(AutomationRuleUpdateSchema, { name: 'X' }, 'id'));
});

describe('AutomationSimulateSchema', () => {
  it('debe aceptar con rule', () => ok(AutomationSimulateSchema, { rule: { conditions: {}, actions: [] } }));
  it('debe aceptar con entityData', () => ok(AutomationSimulateSchema, { rule: { conditions: {}, actions: [] }, entityData: { score: 85 } }));
});

describe('MarketingSuppressionSchema', () => {
  it('debe aceptar con email', () => ok(MarketingSuppressionSchema, { email: 'unsub@example.com' }));
  it('debe rechazar email inválido', () => fail(MarketingSuppressionSchema, { email: 'bad' }, 'email'));
});

describe('SocialPublishSchema', () => {
  const valid = { platform: 'facebook', content: 'Nuevo post!' };

  it('debe aceptar datos mínimos', () => ok(SocialPublishSchema, valid));
  it('debe rechazar mediaUrls con URLs inválidas', () => fail(SocialPublishSchema, { ...valid, mediaUrls: ['bad'] }, 'mediaUrls'));
  it('debe aceptar scheduledAt ISO', () => ok(SocialPublishSchema, { ...valid, scheduledAt: '2025-06-01T09:00:00.000Z' }));
});

describe('WebFormSubmitSchema', () => {
  it('debe aceptar con formId y payload', () => ok(WebFormSubmitSchema, { formId: 'f1', payload: { name: 'Test', email: 'a@b.com' } }));
  it('debe rechazar sin formId', () => fail(WebFormSubmitSchema, { payload: {} }, 'formId'));
});

describe('QueueRetrySchema', () => {
  it('debe aceptar con queueName y jobId', () => ok(QueueRetrySchema, { queueName: 'emails', jobId: 'job-123' }));
  it('debe rechazar sin queueName', () => fail(QueueRetrySchema, { jobId: 'x' }, 'queueName'));
});

describe('EmailCampaignCreateSchema', () => {
  const valid = { nombre: 'Newsletter', asunto: 'Hola!', contenidoHTML: '<h1>Test</h1>' };

  it('debe aceptar datos mínimos', () => ok(EmailCampaignCreateSchema, valid));
  it('debe aplicar default tipoProgramacion=inmediato', () => {
    const r = ok(EmailCampaignCreateSchema, valid);
    expect(r.tipoProgramacion).toBe('inmediato');
  });
  it('debe rechazar sin contenidoHTML', () => fail(EmailCampaignCreateSchema, { nombre: 'X', asunto: 'Y' }, 'contenidoHTML'));
  it('debe aceptar remitenteEmail y responderA', () => {
    ok(EmailCampaignCreateSchema, { ...valid, remitenteEmail: 'from@test.com', responderA: 'reply@test.com' });
  });
  it('debe rechazar remitenteEmail inválido', () => fail(EmailCampaignCreateSchema, { ...valid, remitenteEmail: 'bad' }, 'remitenteEmail'));
  it('debe aceptar fechaEnvio ISO', () => ok(EmailCampaignCreateSchema, { ...valid, fechaEnvio: '2025-07-01T08:00:00.000Z' }));
});

describe('EmailCampaignUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(EmailCampaignUpdateSchema, {}));
});

describe('AudienceCreateSchema', () => {
  it('debe aceptar con nombre', () => ok(AudienceCreateSchema, { nombre: 'VIP' }));
  it('debe aplicar default filtros={}', () => {
    const r = ok(AudienceCreateSchema, { nombre: 'A' });
    expect(r.filtros).toEqual({});
  });
  it('debe aceptar filtros con scoreMin/scoreMax', () => {
    ok(AudienceCreateSchema, { nombre: 'Active', filtros: { scoreMin: '50', scoreMax: '500', tags: ['vip'] } });
  });
});

describe('AudienceUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(AudienceUpdateSchema, {}));
  it('debe aceptar filtros parciales', () => ok(AudienceUpdateSchema, { filtros: { tags: ['new'] } }));
});

describe('EmailTemplateCreateSchema', () => {
  const valid = { nombre: 'Welcome', contenidoHTML: '<div>Welcome!</div>' };

  it('debe aceptar datos mínimos', () => ok(EmailTemplateCreateSchema, valid));
  it('debe aplicar default categoria=general', () => {
    const r = ok(EmailTemplateCreateSchema, valid);
    expect(r.categoria).toBe('general');
  });
  it('debe aplicar default asuntoPorDefecto=""', () => {
    const r = ok(EmailTemplateCreateSchema, valid);
    expect(r.asuntoPorDefecto).toBe('');
  });
  it('debe aceptar variablesDisponibles', () => {
    ok(EmailTemplateCreateSchema, { ...valid, variablesDisponibles: ['nombre', 'email', 'fecha'] });
  });
});

describe('SocialConfigSchema', () => {
  it('debe aceptar con platform y accessToken', () => ok(SocialConfigSchema, { platform: 'linkedin', accessToken: 'token123' }));
  it('debe rechazar sin platform', () => fail(SocialConfigSchema, { accessToken: 'x' }, 'platform'));
  it('debe rechazar sin accessToken', () => fail(SocialConfigSchema, { platform: 'x' }, 'accessToken'));
});

describe('SocialPostCreateSchema', () => {
  const valid = { content: 'Post content', platforms: ['facebook'] };

  it('debe aceptar datos mínimos', () => ok(SocialPostCreateSchema, valid));
  it('debe aplicar default immediate=false', () => {
    const r = ok(SocialPostCreateSchema, valid);
    expect(r.immediate).toBe(false);
  });
  it('debe rechazar platforms vacío', () => fail(SocialPostCreateSchema, { content: 'X', platforms: [] }, 'platforms'));
  it('debe aceptar scheduledFor ISO', () => ok(SocialPostCreateSchema, { ...valid, scheduledFor: '2025-08-01T12:00:00.000Z' }));
});

describe('EmailCampaignDeclararGanadorSchema', () => {
  it('debe aceptar A', () => ok(EmailCampaignDeclararGanadorSchema, { ganador: 'A' }));
  it('debe aceptar B', () => ok(EmailCampaignDeclararGanadorSchema, { ganador: 'B' }));
  it('debe rechazar C', () => fail(EmailCampaignDeclararGanadorSchema, { ganador: 'C' }));
});

describe('EmailCampaignConversionSchema', () => {
  it('debe aceptar con recipientId', () => ok(EmailCampaignConversionSchema, { recipientId: 'rec-123' }));
  it('debe coerce valorConversion', () => {
    const r = ok(EmailCampaignConversionSchema, { recipientId: 'x', valorConversion: '99.99' });
    expect(r.valorConversion).toBe(99.99);
  });
});

describe('EmailCampaignPreviewSchema', () => {
  it('debe aceptar con leadId', () => ok(EmailCampaignPreviewSchema, { leadId: 'lead-1' }));
  it('debe aceptar sin leadId', () => ok(EmailCampaignPreviewSchema, {}));
});

describe('EmailCampaignPreviewDataSchema', () => {
  it('debe aplicar defaults vacíos', () => {
    const r = ok(EmailCampaignPreviewDataSchema, {});
    expect(r.contenidoHTML).toBe('');
    expect(r.asunto).toBe('');
  });
});

describe('EmailCampaignTrackConversionSchema', () => {
  it('debe aceptar objeto vacío', () => ok(EmailCampaignTrackConversionSchema, {}));
  it('debe coerce valor', () => {
    const r = ok(EmailCampaignTrackConversionSchema, { valor: '50', tipo: 'purchase' });
    expect(r.valor).toBe(50);
  });
});

describe('BusinessEmailAccountCreateSchema', () => {
  const valid = { domainId: 'dom-1', username: 'user', password: 'secret' };

  it('debe aceptar datos mínimos', () => ok(BusinessEmailAccountCreateSchema, valid));
  it('debe rechazar username vacío', () => fail(BusinessEmailAccountCreateSchema, { ...valid, username: '' }, 'username'));
  it('debe rechazar domainId vacío', () => fail(BusinessEmailAccountCreateSchema, { ...valid, domainId: '' }, 'domainId'));
});

describe('BusinessEmailConfigSchema', () => {
  it('debe aceptar enabled booleano', () => ok(BusinessEmailConfigSchema, { enabled: true }));
  it('debe rechazar enabled string', () => fail(BusinessEmailConfigSchema, { enabled: 'yes' }));
});

describe('BusinessEmailDomainSchema', () => {
  it('debe aceptar con domain', () => ok(BusinessEmailDomainSchema, { domain: 'example.com' }));
  it('debe rechazar domain vacío', () => fail(BusinessEmailDomainSchema, { domain: '' }));
});

// ═════════════════════════════════════════════════════════════
// SETTINGS
// ═════════════════════════════════════════════════════════════

describe('ConfiguracionSaveSchema', () => {
  it('debe aceptar cualquier record', () => {
    ok(ConfiguracionSaveSchema, { tema: 'oscuro', idioma: 'es', features: { ai: true } });
  });
  it('debe aceptar objeto vacío', () => ok(ConfiguracionSaveSchema, {}));
});

describe('DisponibilidadUpdateSchema', () => {
  const valid = { horarios: [{ diaSemana: 1 }] };

  it('debe aceptar datos mínimos', () => ok(DisponibilidadUpdateSchema, valid));
  it('debe aplicar default bloque 09:00-18:00', () => {
    const r = ok(DisponibilidadUpdateSchema, valid);
    const h = r.horarios[0];
    expect(h.bloques).toEqual([{ inicio: '09:00', fin: '18:00' }]);
    expect(h.intervaloMin).toBe(30);
  });
  it('debe rechazar horarios vacío', () => fail(DisponibilidadUpdateSchema, { horarios: [] }, 'horarios'));
  it('debe rechazar diaSemana > 6', () => fail(DisponibilidadUpdateSchema, { horarios: [{ diaSemana: 7 }] }, 'horarios'));
  it('debe rechazar diaSemana negativo', () => fail(DisponibilidadUpdateSchema, { horarios: [{ diaSemana: -1 }] }, 'horarios'));
  it('debe rechazar intervaloMin < 5', () => fail(DisponibilidadUpdateSchema, { horarios: [{ diaSemana: 0, intervaloMin: 2 }] }, 'horarios'));
  it('debe rechazar intervaloMin > 480', () => fail(DisponibilidadUpdateSchema, { horarios: [{ diaSemana: 0, intervaloMin: 500 }] }, 'horarios'));
  it('debe aceptar múltiples horarios', () => {
    ok(DisponibilidadUpdateSchema, {
      horarios: [
        { diaSemana: 0, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
        { diaSemana: 1, activo: false },
        { diaSemana: 6, intervaloMin: 60 },
      ]
    });
  });
});

describe('WhitelabelUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(WhitelabelUpdateSchema, {}));
  it('debe aceptar colores hex válidos', () => {
    ok(WhitelabelUpdateSchema, { colorPrimario: '#FF0000', colorSecundario: '#00FF00', colorAcento: '#0000FF' });
  });
  it('debe rechazar color hex inválido', () => fail(WhitelabelUpdateSchema, { colorPrimario: 'red' }, 'colorPrimario'));
  it('debe rechazar color hex de 3 caracteres', () => fail(WhitelabelUpdateSchema, { colorPrimario: '#FFF' }, 'colorPrimario'));
  it('debe aceptar dominio válido', () => ok(WhitelabelUpdateSchema, { dominio: 'mi-empresa.com' }));
  it('debe rechazar dominio inválido', () => fail(WhitelabelUpdateSchema, { dominio: 'bad' }, 'dominio'));
  it('debe aceptar dominio con subdominio', () => ok(WhitelabelUpdateSchema, { dominio: 'app.mi-empresa.co.uk' }));
  it('debe aceptar emailRemitente válido', () => ok(WhitelabelUpdateSchema, { emailRemitente: 'info@example.com' }));
  it('debe rechazar emailRemitente inválido', () => fail(WhitelabelUpdateSchema, { emailRemitente: 'bad' }, 'emailRemitente'));
  it('debe aceptar isGlobalUpdate', () => ok(WhitelabelUpdateSchema, { isGlobalUpdate: true }));
});

describe('GuideQuerySchema', () => {
  it('debe aceptar con query', () => ok(GuideQuerySchema, { query: 'cómo crear un lead' }));
  it('debe aceptar con hub', () => ok(GuideQuerySchema, { query: 'test', hub: 'crm' }));
  it('debe rechazar sin query', () => fail(GuideQuerySchema, {}, 'query'));
});

describe('GuideContextSchema', () => {
  it('debe aceptar objeto vacío', () => ok(GuideContextSchema, {}));
  it('debe aceptar con history', () => {
    ok(GuideContextSchema, {
      path: '/dashboard',
      query: 'ayuda',
      history: [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: '¿En qué te ayudo?' },
      ]
    });
  });
  it('debe rechazar history con role inválido', () => fail(GuideContextSchema, { history: [{ role: 'bot', content: 'x' }] }, 'history'));
});

// ═════════════════════════════════════════════════════════════
// CMS
// ═════════════════════════════════════════════════════════════

describe('PageCreateSchema', () => {
  const valid = { titulo: 'Landing Page' };

  it('debe aceptar datos mínimos', () => ok(PageCreateSchema, valid));
  it('debe aplicar default tipo=landing', () => {
    const r = ok(PageCreateSchema, valid);
    expect(r.tipo).toBe('landing');
  });
  it('debe aplicar default contenido={components:[]}', () => {
    const r = ok(PageCreateSchema, valid);
    expect(r.contenido).toEqual({ components: [] });
  });
  it('debe aceptar todos los tipos de página', () => {
    for (const t of ['landing', 'web', 'blog', 'product', 'service', 'checkout', 'thankyou', 'custom']) {
      ok(PageCreateSchema, { ...valid, tipo: t });
    }
  });
  it('debe rechazar tipo inválido', () => fail(PageCreateSchema, { ...valid, tipo: 'invalid' }));
  it('debe rechazar sin titulo', () => fail(PageCreateSchema, {}, 'titulo'));
  it('debe aceptar con metaTitulo y metaDescripcion', () => {
    ok(PageCreateSchema, { ...valid, metaTitulo: 'SEO Title', metaDescripcion: 'SEO Desc' });
  });
  it('debe aceptar servicioId y cursoId', () => {
    ok(PageCreateSchema, { ...valid, servicioId: 'svc-1', cursoId: 'crs-1' });
  });
});

describe('PageUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(PageUpdateSchema, {}));
  it('debe aceptar estado enum', () => {
    for (const e of ['draft', 'published', 'archived']) {
      ok(PageUpdateSchema, { estado: e });
    }
  });
  it('debe aceptar CSS y scripts', () => {
    ok(PageUpdateSchema, { cssPersonalizado: 'body { margin: 0; }', scriptsHead: '<script>...</script>' });
  });
});

describe('PagePublishSchema', () => {
  it('debe aceptar objeto vacío', () => ok(PagePublishSchema, {}));
  it('debe aceptar subdominio válido', () => ok(PagePublishSchema, { subdominio: 'mi-landing' }));
  it('debe rechazar subdominio con caracteres inválidos', () => fail(PagePublishSchema, { subdominio: 'mi_sitio!' }, 'subdominio'));
  it('debe aceptar subdominio con guiones', () => ok(PagePublishSchema, { subdominio: 'my-landing-page' }));
  it('debe rechazar subdominio empezando/terminando con guion', () => {
    fail(PagePublishSchema, { subdominio: '-bad' }, 'subdominio');
    fail(PagePublishSchema, { subdominio: 'bad-' }, 'subdominio');
  });
  it('debe aceptar dominioPersonalizado', () => ok(PagePublishSchema, { dominioPersonalizado: 'example.com' }));
  it('debe aceptar generarEmbed', () => ok(PagePublishSchema, { generarEmbed: true }));
});

describe('CmsPageCreateSchema', () => {
  const valid = { titulo: 'CMS Page' };

  it('debe aceptar datos mínimos', () => ok(CmsPageCreateSchema, valid));
  it('debe aplicar default tipo=landing', () => {
    const r = ok(CmsPageCreateSchema, valid);
    expect(r.tipo).toBe('landing');
  });
  it('debe aceptar global=true', () => ok(CmsPageCreateSchema, { ...valid, global: true }));
  it('debe aceptar template', () => ok(CmsPageCreateSchema, { ...valid, template: 'modern' }));
});

describe('CmsPageUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(CmsPageUpdateSchema, {}));
  it('debe aceptar estado', () => ok(CmsPageUpdateSchema, { estado: 'published' }));
  it('debe rechazar estado inválido', () => fail(CmsPageUpdateSchema, { estado: 'deleted' }));
});

describe('AiSuggestSchema', () => {
  it('debe aceptar con prompt', () => ok(AiSuggestSchema, { prompt: 'Hero section for SaaS' }));
  it('debe aceptar componentType', () => {
    for (const c of ['Hero', 'Features', 'FAQ', 'Testimonial', 'Pricing', 'Heading', 'Text']) {
      ok(AiSuggestSchema, { prompt: 'test', componentType: c });
    }
  });
  it('debe rechazar componentType inválido', () => fail(AiSuggestSchema, { prompt: 'x', componentType: 'BadType' }));
  it('debe rechazar sin prompt', () => fail(AiSuggestSchema, { componentType: 'Hero' }, 'prompt'));
});

describe('CmsTemplateSchema', () => {
  it('debe aceptar con type=email', () => ok(CmsTemplateSchema, { type: 'email' }));
  it('debe aceptar con type=document', () => ok(CmsTemplateSchema, { type: 'document' }));
  it('debe rechazar type inválido', () => fail(CmsTemplateSchema, { type: 'invalid' }));
  it('debe aceptar con id y projectData', () => {
    ok(CmsTemplateSchema, { type: 'email', id: 'tmp-1', projectData: { fonts: ['Inter'] } });
  });
});

describe('KnowledgeCreateSchema', () => {
  const valid = { title: 'How to onboard', content: 'Step 1...' };

  it('debe aceptar datos mínimos', () => ok(KnowledgeCreateSchema, valid));
  it('debe aplicar default category=SOP', () => {
    const r = ok(KnowledgeCreateSchema, valid);
    expect(r.category).toBe('SOP');
  });
  it('debe aceptar tags', () => ok(KnowledgeCreateSchema, { ...valid, tags: ['onboarding', 'guide'] }));
  it('debe aceptar isPublic', () => ok(KnowledgeCreateSchema, { ...valid, isPublic: true }));
  it('debe rechazar sin title', () => fail(KnowledgeCreateSchema, { content: 'x' }, 'title'));
  it('debe rechazar sin content', () => fail(KnowledgeCreateSchema, { title: 'x' }, 'content'));
});

describe('KnowledgeUpdateSchema', () => {
  it('debe aceptar objeto vacío', () => ok(KnowledgeUpdateSchema, {}));
  it('debe permitir campos extra (passthrough)', () => {
    const r = ok(KnowledgeUpdateSchema, { customField: 'extra', title: 'Updated' });
    expect(r.customField).toBe('extra');
  });
});

// ═════════════════════════════════════════════════════════════
// FINANCE
// ═════════════════════════════════════════════════════════════

describe('ExternalInvoiceCreateSchema', () => {
  const valid = { leadId: 'cuid12345678901234567890123', amount: 500 };

  it('debe aceptar con leadId', () => ok(ExternalInvoiceCreateSchema, valid));
  it('debe aceptar con contactId', () => {
    ok(ExternalInvoiceCreateSchema, { contactId: 'cuid12345678901234567890222', amount: 300 });
  });
  it('debe rechazar sin leadId ni contactId', () => fail(ExternalInvoiceCreateSchema, { amount: 100 }));
  it('no inventa una divisa cuando el cliente no la envía', () => {
    // La factura se emite en la moneda de reporte del tenant; el esquema no la fija.
    const r = ok(ExternalInvoiceCreateSchema, valid);
    expect(r.currency).toBeUndefined();
  });
  it('debe aplicar default description="Factura externa"', () => {
    const r = ok(ExternalInvoiceCreateSchema, valid);
    expect(r.description).toBe('Factura externa');
  });
  it('debe coerce amount string a number', () => {
    const r = ok(ExternalInvoiceCreateSchema, { ...valid, amount: '750.50' });
    expect(r.amount).toBe(750.5);
  });
  it('debe rechazar amount=0', () => fail(ExternalInvoiceCreateSchema, { ...valid, amount: 0 }, 'amount'));
  it('debe rechazar amount negativo', () => fail(ExternalInvoiceCreateSchema, { ...valid, amount: -100 }, 'amount'));
  it('debe aceptar items con quantity y price', () => {
    ok(ExternalInvoiceCreateSchema, {
      ...valid,
      items: [{ name: 'Service', quantity: '2', price: '100', taxRate: '21' }]
    });
  });
  it('debe rechazar item con price 0', () => {
    fail(ExternalInvoiceCreateSchema, {
      ...valid,
      items: [{ name: 'Free', quantity: 1, price: 0 }]
    }, 'price');
  });
  it('debe aceptar dueDate ISO', () => {
    ok(ExternalInvoiceCreateSchema, { ...valid, dueDate: '2025-12-31T23:59:59.000Z' });
  });
  it('debe rechazar currency con != 3 chars', () => {
    fail(ExternalInvoiceCreateSchema, { ...valid, currency: 'EU' }, 'currency');
    fail(ExternalInvoiceCreateSchema, { ...valid, currency: 'EURO' }, 'currency');
  });
});

describe('VerifyExpenseSchema', () => {
  const valid = { expenseId: 'exp-123', action: 'VALIDATE' };

  it('debe aceptar VALIDATE', () => ok(VerifyExpenseSchema, valid));
  it('debe aceptar REJECT', () => ok(VerifyExpenseSchema, { expenseId: 'x', action: 'REJECT' }));
  it('debe rechazar action inválido', () => fail(VerifyExpenseSchema, { expenseId: 'x', action: 'APPROVE' }));
  it('debe rechazar sin expenseId', () => fail(VerifyExpenseSchema, { action: 'VALIDATE' }, 'expenseId'));
  it('debe aceptar con metadata comments', () => {
    ok(VerifyExpenseSchema, { ...valid, metadata: { comments: 'Looks good', overrideLocation: true } });
  });
});

describe('ZadarmaTestSchema', () => {
  it('debe aceptar con apiKey y apiSecret', () => ok(ZadarmaTestSchema, { apiKey: 'key123', apiSecret: 'sec123' }));
  it('debe rechazar sin apiKey', () => fail(ZadarmaTestSchema, { apiSecret: 'x' }, 'apiKey'));
  it('debe rechazar sin apiSecret', () => fail(ZadarmaTestSchema, { apiKey: 'x' }, 'apiSecret'));
});

describe('ZadarmaCallbackSchema', () => {
  it('debe aceptar con destination', () => ok(ZadarmaCallbackSchema, { destination: '+34900123456' }));
  it('debe rechazar sin destination', () => fail(ZadarmaCallbackSchema, {}, 'destination'));
});

describe('TelephonyConfigSchema', () => {
  it('debe aceptar objeto vacío', () => ok(TelephonyConfigSchema, {}));
  it('debe aplicar default recordingEnabled=true', () => {
    const r = ok(TelephonyConfigSchema, {});
    expect(r.recordingEnabled).toBe(true);
  });
  it('debe aplicar default activo=true', () => {
    const r = ok(TelephonyConfigSchema, {});
    expect(r.activo).toBe(true);
  });
});

describe('StripeInvoicingConfigSchema', () => {
  it('debe aceptar objeto vacío', () => ok(StripeInvoicingConfigSchema, {}));
  it('debe aceptar activo=true', () => ok(StripeInvoicingConfigSchema, { activo: true }));
});
