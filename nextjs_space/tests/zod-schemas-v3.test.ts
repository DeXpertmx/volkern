import { describe, it, expect } from 'vitest';
import type { z } from 'zod';

// ── Users ──
import {
  UserCreateSchema,
  UserUpdateSchema,
  ProfileUpdateSchema,
  TwoFactorSchema,
  ChangePasswordSchema,
  SignupSchema,
  RecuperarPasswordSchema,
  ResetearPasswordSchema,
  RoleCreateSchema,
  RoleUpdateSchema,
  UserTenantCreateSchema,
} from '@/lib/validation/schemas/users';

// ── AI / Scoring ──
import {
  AiChatSchema,
  ScoringCalculateSchema,
  ScoreCategoryCreateSchema,
  ScoreCategoryUpdateSchema,
  ScoringRuleCreateSchema,
  ScoringRuleUpdateSchema,
  GemmaExecuteActionSchema,
  GemmaNotifySchema,
  MCPRequestSchema,
} from '@/lib/validation/schemas/ai';

// ── Automation ──
import {
  PipelineStageCreateSchema,
  PipelineStageReorderSchema,
  AutomationSchedulerActionSchema,
  AutomationWorkflowCreateSchema,
  AutomationExternalExecuteSchema,
} from '@/lib/validation/schemas/automation';

// ── Messaging ──
import {
  ImageGenerateSchema,
  MensajeEnviarSchema,
  DestinatarioSchema,
  AnytimebotSendSchema,
  ConversacionCreateSchema,
  ChatbotConfigSchema,
  ChatbotTestMessageSchema,
} from '@/lib/validation/schemas/messaging';

// ── Events ──
import {
  EventCreateSchema,
  EventPackSaveSchema,
  EventPackConfigSchema,
  EventPackMarketplaceSchema,
  VideoValidateSchema,
} from '@/lib/validation/schemas/events';

// ── ERP ──
import {
  HrVacationsAnalyzeSchema,
  InventoryConsumptionSchema,
  InventoryAdjustSchema,
  ProductionReportWasteSchema,
  ProductionScrapSchema,
  ProjectCreateSchema,
  SalesOrderCreateSchema,
  SupplierCreateSchema,
  WarehouseCreateSchema,
} from '@/lib/validation/schemas/erp';

// ── Skills ──
import {
  SkillExecuteSchema,
  AutomationCreateSchema,
  AutomationTestRunSchema,
  AutomationFromTemplateSchema,
  VolkernExecuteSchema,
} from '@/lib/validation/schemas/skills';

// ── Misc ──
import {
  AgencySlotCreateSchema,
  CanalWhatsAppCreateSchema,
  CanvaDesignCreateSchema,
  CuponValidarSchema,
  CustomerAuthLoginSchema,
  EstudianteUpdateSchema,
  InternalQueueEnqueueSchema,
  NotificationsSendSchema,
  PlaudernBotCreateSchema,
  PortalClaimSchema,
  PortalVerifySchema,
  PublicCitaCreateSchema,
  PublicLeadCreateSchema,
  QuizIntentoCreateSchema,
  SupportTicketCreateSchema,
  TareaEntregaSchema,
  TrialActionSchema,
  UploadPresignedSchema,
  SovereigntyAuditLogSchema,
  UserLayoutSchema,
} from '@/lib/validation/schemas/misc';

// ── Helpers ──

function check<T>(schema: z.ZodType<T>, data: unknown) {
  return schema.safeParse(data);
}

function ok<T>(schema: z.ZodType<T>, data: unknown) {
  const r = check(schema, data);
  if (!r.success) {
    console.error('Expected success but got:', JSON.stringify(r.error.issues, null, 2));
  }
  expect(r.success).toBe(true);
}

function fail<T>(schema: z.ZodType<T>, data: unknown, pathContains?: string) {
  const r = check(schema, data);
  expect(r.success).toBe(false);
  if (pathContains !== undefined && !r.success) {
    const paths = r.error.issues.map(i => i.path.join('.'));
    expect(paths.some(p => p.includes(pathContains))).toBe(true);
  }
}

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════

describe('UserCreateSchema', () => {
  const valid = {
    name: 'Test User',
    email: 'test@volkern.com',
  };

  it('debe aceptar datos mínimos', () => ok(UserCreateSchema, valid));
  it('debe aceptar con roleId y department', () => ok(UserCreateSchema, { ...valid, roleId: 'cuid12345678901234567890123', department: 'Engineering' }));
  it('debe aceptar roleId null', () => ok(UserCreateSchema, { ...valid, roleId: null }));
  it('debe rechazar email inválido', () => fail(UserCreateSchema, { ...valid, email: 'no-email' }, 'email'));
  it('debe rechazar sin name', () => fail(UserCreateSchema, { email: 'test@volkern.com' }, 'name'));
  it('debe rechazar sin email', () => fail(UserCreateSchema, { name: 'Test' }));
  it('debe aceptar telefono opcional', () => ok(UserCreateSchema, { ...valid, telefono: '+34600123456' }));
  it('debe rechazar roleId muy corto (< 25 chars)', () => fail(UserCreateSchema, { ...valid, roleId: 'short' }, 'roleId'));
});

describe('UserUpdateSchema', () => {
  it('debe aceptar update parcial', () => ok(UserUpdateSchema, { name: 'Nuevo Nombre' }));
  it('debe aceptar todos los campos', () => ok(UserUpdateSchema, {
    name: 'Updated',
    telefono: '+34600123456',
    timezone: 'Europe/Madrid',
    roleId: 'cuid12345678901234567890123',
    estado: 'activo',
    image: 'https://img.com/avatar.png',
  }));
  it('debe aceptar roleId null', () => ok(UserUpdateSchema, { roleId: null }));
  it('debe rechazar estado inválido', () => fail(UserUpdateSchema, { estado: 'baneado' }, 'estado'));
  it('debe aceptar todos los estados válidos', () => {
    for (const e of ['activo', 'inactivo', 'suspendido', 'invitado']) {
      ok(UserUpdateSchema, { estado: e });
    }
  });
});

describe('ProfileUpdateSchema', () => {
  it('debe aceptar perfil vacío (todos opcionales)', () => ok(ProfileUpdateSchema, {}));
  it('debe aceptar todos los campos de perfil', () => ok(ProfileUpdateSchema, {
    name: 'Perfil',
    telefono: '+34600123456',
    bookingSlug: 'mi-consulta',
    bookingTitle: 'Consulta',
    bookingBio: 'Bio...',
    bookingEnabled: true,
    timezone: 'Europe/Madrid',
    image: 'https://img.com/me.png',
  }));
  it('debe aceptar metadata como record', () => ok(ProfileUpdateSchema, { metadata: { color: 'blue', notifications: true } }));
});

describe('TwoFactorSchema', () => {
  it('debe aceptar enabled true', () => ok(TwoFactorSchema, { enabled: true }));
  it('debe aceptar enabled false', () => ok(TwoFactorSchema, { enabled: false }));
  it('debe rechazar sin enabled', () => fail(TwoFactorSchema, {}));
  it('debe rechazar enabled como string', () => fail(TwoFactorSchema, { enabled: 'yes' }));
});

describe('ChangePasswordSchema', () => {
  const valid = { currentPassword: 'OldP@ss1', newPassword: 'NewP@ssw0rd!' };

  it('debe aceptar passwords válidas', () => ok(ChangePasswordSchema, valid));
  it('debe rechazar newPassword sin mayúscula', () => fail(ChangePasswordSchema, { ...valid, newPassword: 'newp@ssw0rd!' }, 'newPassword'));
  it('debe rechazar newPassword sin minúscula', () => fail(ChangePasswordSchema, { ...valid, newPassword: 'NEWP@SSW0RD!' }, 'newPassword'));
  it('debe rechazar newPassword sin carácter especial', () => fail(ChangePasswordSchema, { ...valid, newPassword: 'NewPassw0rd' }, 'newPassword'));
  it('debe rechazar newPassword < 8 chars', () => fail(ChangePasswordSchema, { ...valid, newPassword: 'Np@1' }, 'newPassword'));
  it('debe rechazar currentPassword vacío', () => fail(ChangePasswordSchema, { ...valid, currentPassword: '' }, 'currentPassword'));
  it('debe rechazar sin currentPassword', () => fail(ChangePasswordSchema, { newPassword: 'NewP@ssw0rd!' }));
  it('debe rechazar sin newPassword', () => fail(ChangePasswordSchema, { currentPassword: 'OldP@ss1' }));
});

describe('SignupSchema', () => {
  const valid = {
    email: 'new@volkern.com',
    password: 'Str0ngP@ss!',
    fullName: 'Nuevo Usuario',
    companyName: 'Mi Empresa',
  };

  it('debe aceptar signup válido', () => ok(SignupSchema, valid));
  it('debe aceptar con couponCode', () => ok(SignupSchema, { ...valid, couponCode: 'WELCOME20' }));
  it('debe rechazar password débil', () => fail(SignupSchema, { ...valid, password: 'weak' }, 'password'));
  it('debe rechazar email inválido', () => fail(SignupSchema, { ...valid, email: 'no-email' }, 'email'));
  it('debe rechazar companyName vacío', () => fail(SignupSchema, { ...valid, companyName: '' }, 'companyName'));
  it('debe rechazar fullName vacío', () => fail(SignupSchema, { ...valid, fullName: '' }, 'fullName'));
});

describe('RecuperarPasswordSchema', () => {
  it('debe aceptar email válido', () => ok(RecuperarPasswordSchema, { email: 'user@volkern.com' }));
  it('debe rechazar email inválido', () => fail(RecuperarPasswordSchema, { email: 'no-email' }));
  it('debe rechazar sin email', () => fail(RecuperarPasswordSchema, {}));
});

describe('ResetearPasswordSchema', () => {
  it('debe aceptar token + password fuerte', () => ok(ResetearPasswordSchema, { token: 'reset-token-123', password: 'Str0ngP@ss!' }));
  it('debe rechazar token vacío', () => fail(ResetearPasswordSchema, { token: '', password: 'Str0ngP@ss!' }, 'token'));
  it('debe rechazar password débil', () => fail(ResetearPasswordSchema, { token: 'tok', password: 'débil' }, 'password'));
});

describe('RoleCreateSchema', () => {
  it('debe aceptar datos mínimos', () => ok(RoleCreateSchema, { nombre: 'Admin' }));
  it('debe aceptar con descripcion y permisos', () => ok(RoleCreateSchema, {
    nombre: 'Manager',
    descripcion: 'Gestor de equipo',
    permisos: { leads: { read: true, write: true } },
  }));
  it('debe rechazar sin nombre', () => fail(RoleCreateSchema, { descripcion: 'Sin nombre' }));
});

describe('RoleUpdateSchema', () => {
  it('debe aceptar update parcial', () => ok(RoleUpdateSchema, { descripcion: 'Actualizada' }));
  it('debe aceptar vacío', () => ok(RoleUpdateSchema, {}));
});

describe('UserTenantCreateSchema', () => {
  const valid = {
    empresa: 'Mi Empresa SL',
    subdomain: 'mi-empresa',
    email: 'admin@miempresa.com',
    password: 'Str0ngP@ss!',
    telegram: { botName: 'mi_bot', botToken: '123456:ABC-DEF' },
  };

  it('debe aceptar tenant válido', () => ok(UserTenantCreateSchema, valid));
  it('debe rechazar subdomain con mayúsculas', () => fail(UserTenantCreateSchema, { ...valid, subdomain: 'MiEmpresa' }, 'subdomain'));
  it('debe rechazar subdomain < 3 chars', () => fail(UserTenantCreateSchema, { ...valid, subdomain: 'ab' }, 'subdomain'));
  it('debe rechazar subdomain con caracteres inválidos', () => fail(UserTenantCreateSchema, { ...valid, subdomain: 'mi_empresa' }, 'subdomain'));
  it('debe rechazar sin telegram', () => fail(UserTenantCreateSchema, { ...valid, telegram: undefined }));
  it('debe rechazar telegram sin botName', () => fail(UserTenantCreateSchema, { ...valid, telegram: { botToken: '123' } }, 'botName'));
  it('debe rechazar password débil', () => fail(UserTenantCreateSchema, { ...valid, password: 'débil' }, 'password'));
});

// ═══════════════════════════════════════════════════════════════
// AI / SCORING
// ═══════════════════════════════════════════════════════════════

describe('AiChatSchema', () => {
  it('debe aceptar prompt mínimo', () => ok(AiChatSchema, { prompt: 'Hola' }));
  it('debe aceptar con model', () => ok(AiChatSchema, { prompt: 'Hola', model: 'gemini-flash' }));
  it('debe rechazar prompt vacío', () => fail(AiChatSchema, { prompt: '' }, 'prompt'));
  it('debe rechazar sin prompt', () => fail(AiChatSchema, { model: 'gpt4' }));
});

describe('ScoringCalculateSchema', () => {
  it('debe aceptar datos mínimos', () => ok(ScoringCalculateSchema, {
    leadId: 'lead-001',
    evento: 'email_opened',
    categoria: 'engagement',
  }));
  it('debe aceptar con detalles', () => ok(ScoringCalculateSchema, {
    leadId: 'lead-001',
    evento: 'email_opened',
    categoria: 'engagement',
    detalles: { campaignId: 'cmp-1', subject: 'Oferta' },
  }));
  it('debe rechazar sin leadId', () => fail(ScoringCalculateSchema, { evento: 'x', categoria: 'y' }, 'leadId'));
  it('debe rechazar sin evento', () => fail(ScoringCalculateSchema, { leadId: 'x', categoria: 'y' }, 'evento'));
});

describe('ScoreCategoryCreateSchema', () => {
  const valid = { nombre: 'Engagement', etiqueta: 'engagement', puntuacionMin: 0, puntuacionMax: 100 };

  it('debe aceptar categoría válida', () => ok(ScoreCategoryCreateSchema, valid));
  it('debe aplicar defaults (orden=0)', () => {
    const r = check(ScoreCategoryCreateSchema, valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.orden).toBe(0);
  });
  it('debe hacer coerce de puntuacionMin (string → number)', () => {
    const r = check(ScoreCategoryCreateSchema, { ...valid, puntuacionMin: '10', puntuacionMax: '90' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.puntuacionMin).toBe(10);
      expect(r.data.puntuacionMax).toBe(90);
    }
  });
  it('debe aceptar con color, icono, orden', () => ok(ScoreCategoryCreateSchema, {
    ...valid, color: '#ff0000', icono: 'Star', orden: 1,
  }));
});

describe('ScoreCategoryUpdateSchema (passthrough)', () => {
  it('debe aceptar update parcial', () => ok(ScoreCategoryUpdateSchema, { id: 'cat-1', nombre: 'Nuevo' }));
  it('debe permitir campos extra (passthrough)', () => ok(ScoreCategoryUpdateSchema, { id: 'cat-1', nombre: 'Nuevo', extraField: 'allowed' }));
  it('debe rechazar sin id', () => fail(ScoreCategoryUpdateSchema, { nombre: 'Sin ID' }));
});

describe('ScoringRuleCreateSchema', () => {
  const valid = {
    nombre: 'Email Open',
    categoria: 'engagement',
    evento: 'email_opened',
    puntos: 10,
  };

  it('debe aceptar regla válida', () => ok(ScoringRuleCreateSchema, valid));
  it('debe aplicar defaults (activo=true, orden=0, condiciones={})', () => {
    const r = check(ScoringRuleCreateSchema, valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.activo).toBe(true);
      expect(r.data.orden).toBe(0);
      expect(r.data.condiciones).toEqual({});
    }
  });
  it('debe aceptar con condiciones complejas', () => ok(ScoringRuleCreateSchema, {
    ...valid,
    condiciones: { minOpenCount: 3, sourceMustBe: 'email' },
  }));
  it('debe hacer coerce de puntos (string → number)', () => {
    const r = check(ScoringRuleCreateSchema, { ...valid, puntos: '25' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.puntos).toBe(25);
  });
  it('debe aceptar puntos negativos', () => ok(ScoringRuleCreateSchema, { ...valid, puntos: -5 }));
});

describe('ScoringRuleUpdateSchema (passthrough)', () => {
  it('debe aceptar update parcial', () => ok(ScoringRuleUpdateSchema, { id: 'rule-1', activo: false }));
  it('debe permitir campos extra (passthrough)', () => ok(ScoringRuleUpdateSchema, { id: 'rule-1', puntos: 20, extraField: true }));
});

describe('GemmaExecuteActionSchema', () => {
  it('debe aceptar datos válidos', () => ok(GemmaExecuteActionSchema, {
    actionId: 'action-001',
    operatorNote: 'Revisar manualmente',
  }));
  it('debe rechazar sin actionId', () => fail(GemmaExecuteActionSchema, { operatorNote: 'Nota' }, 'actionId'));
  it('debe rechazar sin operatorNote', () => fail(GemmaExecuteActionSchema, { actionId: 'act-1' }, 'operatorNote'));
});

describe('GemmaNotifySchema', () => {
  it('debe aceptar datos mínimos', () => ok(GemmaNotifySchema, {
    tenantId: 'tenant-1',
    gemmaOutput: { decision: 'approved', confidence: 0.95 },
  }));
  it('debe rechazar sin gemmaOutput', () => fail(GemmaNotifySchema, { tenantId: 't1' }, 'gemmaOutput'));
});

describe('MCPRequestSchema (passthrough)', () => {
  it('debe aceptar datos mínimos', () => ok(MCPRequestSchema, { method: 'tools/call' }));
  it('debe aceptar con id numérico', () => ok(MCPRequestSchema, { id: 42, method: 'tools/list' }));
  it('debe aceptar con id string', () => ok(MCPRequestSchema, { id: 'req-1', method: 'tools/call' }));
  it('debe aceptar vacío (todos opcionales)', () => ok(MCPRequestSchema, {}));
  it('debe permitir campos extra (passthrough)', () => ok(MCPRequestSchema, { method: 'test', jsonrpc: '2.0' }));
});

// ═══════════════════════════════════════════════════════════════
// AUTOMATION
// ═══════════════════════════════════════════════════════════════

describe('PipelineStageCreateSchema', () => {
  it('debe aceptar datos mínimos', () => ok(PipelineStageCreateSchema, { nombre: 'Prospección' }));
  it('debe aplicar defaults', () => {
    const r = check(PipelineStageCreateSchema, { nombre: 'P' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.probabilidad).toBe(50);
      expect(r.data.color).toBe('#3b82f6');
      expect(r.data.requiereAprobacion).toBe(false);
    }
  });
  it('debe rechazar probabilidad > 100', () => fail(PipelineStageCreateSchema, { nombre: 'P', probabilidad: 150 }, 'probabilidad'));
  it('debe rechazar probabilidad < 0', () => fail(PipelineStageCreateSchema, { nombre: 'P', probabilidad: -10 }, 'probabilidad'));
  it('debe aceptar probabilidad = 0', () => ok(PipelineStageCreateSchema, { nombre: 'Perdido', probabilidad: 0 }));
  it('debe aceptar probabilidad = 100', () => ok(PipelineStageCreateSchema, { nombre: 'Cerrado', probabilidad: 100 }));
});

describe('PipelineStageReorderSchema', () => {
  it('debe aceptar reorden mínimo', () => ok(PipelineStageReorderSchema, {
    stages: [{ id: 's1', orden: 0 }],
  }));
  it('debe aceptar múltiples stages', () => ok(PipelineStageReorderSchema, {
    stages: [
      { id: 's1', orden: 0 },
      { id: 's2', orden: 1 },
      { id: 's3', orden: 2 },
    ],
  }));
  it('debe rechazar stages vacío', () => fail(PipelineStageReorderSchema, { stages: [] }, 'stages'));
  it('debe rechazar sin stages', () => fail(PipelineStageReorderSchema, {}));
});

describe('AutomationSchedulerActionSchema (discriminatedUnion)', () => {
  it('debe aceptar create_job', () => ok(AutomationSchedulerActionSchema, {
    action: 'create_job',
    name: 'Daily Reminder',
    schedule: '0 9 * * *',
    event: 'daily_reminder',
  }));
  it('debe aceptar delete_job', () => ok(AutomationSchedulerActionSchema, {
    action: 'delete_job',
    jobId: 'job-123',
  }));
  it('debe aceptar scan_recovery', () => ok(AutomationSchedulerActionSchema, {
    action: 'scan_recovery',
    hours: 72,
    stages: ['calificado', 'propuesta'],
  }));
  it('debe aceptar recover_lead', () => ok(AutomationSchedulerActionSchema, {
    action: 'recover_lead',
    leadId: 'lead-001',
  }));
  it('debe rechazar action desconocida', () => fail(AutomationSchedulerActionSchema, { action: 'unknown' }));
  it('debe rechazar create_job sin name', () => fail(AutomationSchedulerActionSchema, { action: 'create_job', schedule: '* * * * *', event: 'test' }));
  it('debe rechazar delete_job sin jobId', () => fail(AutomationSchedulerActionSchema, { action: 'delete_job' }));
});

describe('AutomationWorkflowCreateSchema', () => {
  const valid = {
    n8nWorkflowId: 'wf-001',
    nombre: 'Email Onboarding',
    trigger: 'lead_created',
  };

  it('debe aceptar workflow válido', () => ok(AutomationWorkflowCreateSchema, valid));
  it('debe aceptar con webhookUrl', () => ok(AutomationWorkflowCreateSchema, { ...valid, webhookUrl: 'https://n8n.example.com/webhook/abc' }));
  it('debe aceptar webhookUrl string vacío', () => ok(AutomationWorkflowCreateSchema, { ...valid, webhookUrl: '' }));
  it('debe rechazar webhookUrl no URL', () => fail(AutomationWorkflowCreateSchema, { ...valid, webhookUrl: 'no-es-url' }, 'webhookUrl'));
  it('debe rechazar sin trigger', () => fail(AutomationWorkflowCreateSchema, { n8nWorkflowId: 'wf-1', nombre: 'WF' }));
});

describe('AutomationExternalExecuteSchema', () => {
  it('debe aceptar datos mínimos', () => ok(AutomationExternalExecuteSchema, { workflowId: 'wf-001' }));
  it('debe aplicar defaults', () => {
    const r = check(AutomationExternalExecuteSchema, { workflowId: 'wf-001' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.payload).toEqual({});
      expect(r.data.timeout).toBe(30000);
      expect(r.data.retryCount).toBe(3);
      expect(r.data.trigger).toBe('manual');
    }
  });
  it('debe rechazar timeout = 0 (no positivo)', () => fail(AutomationExternalExecuteSchema, { workflowId: 'wf-1', timeout: 0 }, 'timeout'));
  it('debe rechazar retryCount negativo', () => fail(AutomationExternalExecuteSchema, { workflowId: 'wf-1', retryCount: -1 }, 'retryCount'));
});

// ═══════════════════════════════════════════════════════════════
// MESSAGING
// ═══════════════════════════════════════════════════════════════

describe('ImageGenerateSchema', () => {
  it('debe aceptar prompt mínimo', () => ok(ImageGenerateSchema, { prompt: 'Un gato' }));
  it('debe aplicar default aspectRatio 1:1', () => {
    const r = check(ImageGenerateSchema, { prompt: 'test' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.aspectRatio).toBe('1:1');
  });
  it('debe aceptar todos los aspect ratios', () => {
    for (const ar of ['1:1', '16:9', '9:16', '4:3', '3:4']) {
      ok(ImageGenerateSchema, { prompt: 'test', aspectRatio: ar });
    }
  });
  it('debe rechazar aspect ratio inválido', () => fail(ImageGenerateSchema, { prompt: 'test', aspectRatio: '21:9' }, 'aspectRatio'));
});

describe('MensajeEnviarSchema', () => {
  it('debe aceptar datos mínimos', () => ok(MensajeEnviarSchema, {
    contenido: 'Hola',
    canal: 'whatsapp',
    destinatario: { nombre: 'Juan' },
  }));
  it('debe aceptar todos los canales', () => {
    for (const c of ['whatsapp', 'email', 'sms', 'telegram', 'facebook', 'instagram']) {
      ok(MensajeEnviarSchema, { contenido: 'H', canal: c });
    }
  });
  it('debe rechazar canal no soportado', () => fail(MensajeEnviarSchema, { contenido: 'H', canal: 'discord' }, 'canal'));
  it('debe aceptar con mediaUrl + mediaType', () => ok(MensajeEnviarSchema, {
    contenido: 'Mira esto',
    canal: 'whatsapp',
    mediaUrl: 'https://img.com/foto.jpg',
    mediaType: 'image',
  }));
  it('debe rechazar mediaType inválido', () => fail(MensajeEnviarSchema, {
    contenido: 'H', canal: 'whatsapp', mediaType: 'audio',
  }, 'mediaType'));
  it('debe rechazar contenido vacío', () => fail(MensajeEnviarSchema, { contenido: '', canal: 'whatsapp' }));
});

describe('DestinatarioSchema', () => {
  it('debe aceptar con nombre y email', () => ok(DestinatarioSchema, { nombre: 'Juan', email: 'juan@test.com' }));
  it('debe aceptar con nombre y telefono', () => ok(DestinatarioSchema, { nombre: 'Juan', telefono: '+34600123456' }));
  it('debe rechazar email inválido', () => fail(DestinatarioSchema, { nombre: 'Juan', email: 'no-email' }, 'email'));
  it('debe rechazar sin nombre', () => fail(DestinatarioSchema, { email: 'juan@test.com' }));
});

describe('AnytimebotSendSchema', () => {
  it('debe aceptar datos mínimos', () => ok(AnytimebotSendSchema, { to: '+34600123456', message: 'Hola' }));
  it('debe aplicar default messageType text', () => {
    const r = check(AnytimebotSendSchema, { to: '+34', message: 'Hola' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.messageType).toBe('text');
  });
  it('debe aceptar messageType template', () => ok(AnytimebotSendSchema, { to: '+34', message: 'Hola', messageType: 'template' }));
  it('debe rechazar messageType inválido', () => fail(AnytimebotSendSchema, { to: '+34', message: 'Hola', messageType: 'image' }));
});

describe('ConversacionCreateSchema', () => {
  it('debe aceptar datos mínimos', () => ok(ConversacionCreateSchema, {
    contactoNombre: 'Juan',
    canal: 'whatsapp',
  }));
  it('debe rechazar email inválido', () => fail(ConversacionCreateSchema, {
    contactoNombre: 'J', canal: 'w', contactoEmail: 'no-email',
  }, 'contactoEmail'));
  it('debe aceptar con leadId y estudianteId null', () => ok(ConversacionCreateSchema, {
    contactoNombre: 'J', canal: 'w', leadId: null, estudianteId: null,
  }));
});

describe('ChatbotConfigSchema', () => {
  it('debe aceptar config vacía', () => ok(ChatbotConfigSchema, {}));
  it('debe aceptar horario inicio/fin en rango', () => ok(ChatbotConfigSchema, { horarioInicio: 9, horarioFin: 18 }));
  it('debe hacer coerce de horario (string → number)', () => {
    const r = check(ChatbotConfigSchema, { horarioInicio: '9', horarioFin: '18' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.horarioInicio).toBe(9);
      expect(r.data.horarioFin).toBe(18);
    }
  });
  it('debe rechazar horarioInicio < 0', () => fail(ChatbotConfigSchema, { horarioInicio: -1 }, 'horarioInicio'));
  it('debe rechazar horarioInicio > 23', () => fail(ChatbotConfigSchema, { horarioInicio: 24 }, 'horarioInicio'));
  it('debe rechazar horarioFin > 23', () => fail(ChatbotConfigSchema, { horarioFin: 25 }, 'horarioFin'));
  it('debe aceptar todas las flags booleanas', () => ok(ChatbotConfigSchema, {
    activo: true,
    puedeAgendarCitas: false,
    puedeMostrarServicios: true,
    puedeTransferirHumano: false,
  }));
});

describe('ChatbotTestMessageSchema', () => {
  it('debe aceptar mensaje mínimo', () => ok(ChatbotTestMessageSchema, { message: 'Hola' }));
  it('debe aceptar con historial', () => ok(ChatbotTestMessageSchema, {
    message: 'Hola',
    conversationHistory: [
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¡Hola! ¿Cómo puedo ayudarte?' },
    ],
  }));
});

// ═══════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════

describe('EventCreateSchema', () => {
  it('debe aceptar evento mínimo', () => ok(EventCreateSchema, { event: 'lead_created' }));
  it('debe aplicar defaults', () => {
    const r = check(EventCreateSchema, { event: 'lead_created' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.data).toEqual({});
      expect(r.data.sync).toBe(true);
    }
  });
  it('debe aceptar sync false', () => ok(EventCreateSchema, { event: 'lead_created', sync: false }));
  it('debe rechazar event vacío', () => fail(EventCreateSchema, { event: '' }, 'event'));
});

describe('EventPackSaveSchema (refine)', () => {
  it('debe aceptar pack válido', () => ok(EventPackSaveSchema, {
    pack: { pack: 'ventas-pack', triggers: ['lead_created', 'deal_won'] },
  }));
  it('debe rechazar pack sin triggers', () => fail(EventPackSaveSchema, {
    pack: { pack: 'vacio', triggers: [] },
  }, ''));
  it('debe rechazar pack sin nombre', () => fail(EventPackSaveSchema, {
    pack: { pack: '', triggers: ['x'] },
  }, ''));
});

describe('EventPackConfigSchema (refine)', () => {
  it('debe aceptar con pack_id', () => ok(EventPackConfigSchema, { pack_id: 'pack-1' }));
  it('debe aceptar con custom_pack', () => ok(EventPackConfigSchema, { custom_pack: { name: 'custom', triggers: ['x'] } }));
  it('debe rechazar sin pack_id ni custom_pack', () => fail(EventPackConfigSchema, {}));
});

describe('EventPackMarketplaceSchema (refine con path)', () => {
  it('debe aceptar publish sin source_tenant_id', () => ok(EventPackMarketplaceSchema, { action: 'publish' }));
  it('debe aceptar download con source_tenant_id', () => ok(EventPackMarketplaceSchema, {
    action: 'download', source_tenant_id: 'tenant-123',
  }));
  it('debe rechazar download sin source_tenant_id', () => fail(EventPackMarketplaceSchema, {
    action: 'download',
  }, 'source_tenant_id'));
  it('debe rechazar action inválida', () => fail(EventPackMarketplaceSchema, { action: 'delete' }));
});

describe('VideoValidateSchema', () => {
  it('debe aceptar URL de video válida', () => ok(VideoValidateSchema, { url: 'https://youtube.com/watch?v=abc123' }));
  it('debe rechazar no URL', () => fail(VideoValidateSchema, { url: 'no-es-url' }, 'url'));
  it('debe rechazar url vacía', () => fail(VideoValidateSchema, { url: '' }));
});

// ═══════════════════════════════════════════════════════════════
// ERP
// ═══════════════════════════════════════════════════════════════

describe('HrVacationsAnalyzeSchema', () => {
  it('debe aceptar datos válidos', () => ok(HrVacationsAnalyzeSchema, {
    employeeId: 'emp-1', startDate: '2025-07-01', endDate: '2025-07-15',
  }));
  it('debe rechazar sin employeeId', () => fail(HrVacationsAnalyzeSchema, { startDate: '2025-07-01', endDate: '2025-07-15' }));
});

describe('InventoryConsumptionSchema', () => {
  it('debe aceptar datos mínimos', () => ok(InventoryConsumptionSchema, {
    productId: 'prod-1', quantity: 5,
  }));
  it('debe hacer coerce de quantity (string → number)', () => {
    const r = check(InventoryConsumptionSchema, { productId: 'p1', quantity: '3' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quantity).toBe(3);
  });
  it('debe aceptar con warehouseId', () => ok(InventoryConsumptionSchema, {
    productId: 'p1', quantity: 10, warehouseId: 'wh-1',
  }));
  it('debe rechazar sin quantity', () => fail(InventoryConsumptionSchema, { productId: 'p1' }, 'quantity'));
});

describe('InventoryAdjustSchema', () => {
  const valid = {
    catalogoItemId: 'cuid12345678901234567890123',
    quantity: 10,
    type: 'entrada',
  };

  it('debe aceptar ajuste válido', () => ok(InventoryAdjustSchema, valid));
  it('debe aplicar default reason', () => {
    const r = check(InventoryAdjustSchema, valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBe('Ajuste manual desde API');
  });
  it('debe aceptar cantidad negativa (salida)', () => ok(InventoryAdjustSchema, { ...valid, quantity: -5, type: 'salida' }));
  it('debe aceptar con targetWarehouseId (transferencia)', () => ok(InventoryAdjustSchema, {
    ...valid, type: 'transferencia', targetWarehouseId: 'wh-2',
  }));
});

describe('ProductionReportWasteSchema', () => {
  const valid = {
    workOrderId: 'wo-1',
    quantity: 3,
    evidenceUrl: 'https://storage.example.com/photo.jpg',
  };

  it('debe aceptar reporte válido', () => ok(ProductionReportWasteSchema, valid));
  it('debe aceptar con GPS', () => ok(ProductionReportWasteSchema, {
    ...valid, reportLat: 40.4168, reportLng: -3.7038, clientTimestamp: '2025-06-01T10:00:00Z',
  }));
  it('debe rechazar sin workOrderId', () => fail(ProductionReportWasteSchema, { quantity: 3, evidenceUrl: 'https://...' }));
  it('debe rechazar sin evidenceUrl', () => fail(ProductionReportWasteSchema, { workOrderId: 'wo-1', quantity: 3 }));
});

describe('ProductionScrapSchema', () => {
  const valid = {
    workOrderId: 'wo-1',
    itemId: 'item-1',
    quantity: 2,
    evidenceUrl: 'https://storage.example.com/scrap.jpg',
  };
  it('debe aceptar scrap válido', () => ok(ProductionScrapSchema, valid));
  it('debe rechazar sin itemId', () => fail(ProductionScrapSchema, { ...valid, itemId: undefined }));
});

describe('ProjectCreateSchema', () => {
  it('debe aceptar proyecto mínimo', () => ok(ProjectCreateSchema, { name: 'Proyecto X' }));
  it('debe aplicar los defaults del presupuesto y no inventar divisa', () => {
    const r = check(ProjectCreateSchema, { name: 'P' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.budget).toBe(0);
      // El proyecto se presupuesta en la divisa del tenant, que resuelve la ruta.
      expect(r.data.currency).toBeUndefined();
    }
  });
  it('debe aceptar con leadId, budget, fechas', () => ok(ProjectCreateSchema, {
    name: 'P',
    leadId: 'lead-1',
    budget: 50000,
    currency: 'USD',
    startDate: '2025-06-01',
    endDate: '2025-12-31',
  }));
});

describe('SalesOrderCreateSchema', () => {
  it('debe aceptar orden vacía', () => ok(SalesOrderCreateSchema, {}));
  it('debe aceptar con items', () => ok(SalesOrderCreateSchema, {
    items: [
      { catalogItemId: 'item-1', quantity: 2, unitPrice: 99.99 },
      { quantity: 1, unitPrice: 50 },
    ],
  }));
  it('debe rechazar item con quantity < 1', () => fail(SalesOrderCreateSchema, {
    items: [{ quantity: 0, unitPrice: 10 }],
  }, 'items'));
  it('debe rechazar item con unitPrice negativo', () => fail(SalesOrderCreateSchema, {
    items: [{ quantity: 1, unitPrice: -5 }],
  }, 'items'));
  it('debe aplicar defaults (prioridad=NORMAL, items=[])', () => {
    const r = check(SalesOrderCreateSchema, {});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBe('NORMAL');
      expect(r.data.items).toEqual([]);
    }
  });
});

describe('SupplierCreateSchema', () => {
  it('debe aceptar proveedor mínimo', () => ok(SupplierCreateSchema, { name: 'Proveedor SA' }));
  it('debe aplicar default category', () => {
    const r = check(SupplierCreateSchema, { name: 'P' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('Varios');
  });
  it('debe aceptar con email y teléfono', () => ok(SupplierCreateSchema, {
    name: 'P', taxId: 'B12345678', email: 'info@proveedor.com', phone: '+34911234567',
  }));
  it('debe rechazar email inválido', () => fail(SupplierCreateSchema, { name: 'P', email: 'no-email' }));
});

describe('WarehouseCreateSchema', () => {
  it('debe aceptar almacén mínimo', () => ok(WarehouseCreateSchema, { name: 'Almacén Central' }));
  it('debe aceptar con ubicación', () => ok(WarehouseCreateSchema, {
    name: 'A1', location: 'Calle Mayor 1, Madrid', description: 'Principal',
  }));
  it('debe rechazar sin nombre', () => fail(WarehouseCreateSchema, { location: 'Madrid' }));
});

// ═══════════════════════════════════════════════════════════════
// SKILLS
// ═══════════════════════════════════════════════════════════════

describe('SkillExecuteSchema', () => {
  it('debe aceptar skill mínima', () => ok(SkillExecuteSchema, { skill: 'send_email' }));
  it('debe aplicar default payload = {}', () => {
    const r = check(SkillExecuteSchema, { skill: 's' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.payload).toEqual({});
  });
  it('debe aceptar con payload', () => ok(SkillExecuteSchema, { skill: 'send_email', payload: { to: 'a@b.com' } }));
  it('debe rechazar sin skill', () => fail(SkillExecuteSchema, { payload: {} }));
});

describe('AutomationCreateSchema', () => {
  it('debe aceptar automatización mínima', () => ok(AutomationCreateSchema, {
    nombre: 'Auto Email', trigger: 'lead_created',
  }));
  it('debe aplicar default flowData vacío', () => {
    const r = check(AutomationCreateSchema, { nombre: 'A', trigger: 't' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.flowData).toEqual({ nodes: [], edges: [] });
  });
  it('debe aceptar con flowData complejo', () => ok(AutomationCreateSchema, {
    nombre: 'Auto', trigger: 'lead_created',
    flowData: { nodes: [{ id: 'n1', type: 'sendEmail' }], edges: [{ source: 'start', target: 'n1' }] },
  }));
});

describe('AutomationTestRunSchema', () => {
  it('debe aceptar test con automationId', () => ok(AutomationTestRunSchema, { automationId: 'auto-1' }));
  it('debe aceptar con mockContext', () => ok(AutomationTestRunSchema, {
    automationId: 'auto-1',
    mockContext: { lead: { nombre: 'Test' } },
  }));
});

describe('AutomationFromTemplateSchema', () => {
  it('debe aceptar desde template', () => ok(AutomationFromTemplateSchema, { templateId: 'tpl-1' }));
  it('debe aceptar con nombre personalizado', () => ok(AutomationFromTemplateSchema, {
    templateId: 'tpl-1', nombre: 'Mi Auto', personalizar: { delay: 5000 },
  }));
});

describe('VolkernExecuteSchema', () => {
  it('debe aceptar ejecución válida', () => ok(VolkernExecuteSchema, {
    userId: 'user-1', tool: 'send_email',
  }));
  it('debe aplicar default arguments = {}', () => {
    const r = check(VolkernExecuteSchema, { userId: 'u1', tool: 't' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.arguments).toEqual({});
  });
  it('debe aceptar con arguments', () => ok(VolkernExecuteSchema, {
    userId: 'u1', tool: 'send_email', arguments: { to: 'a@b.com', subject: 'Test' },
  }));
});

// ═══════════════════════════════════════════════════════════════
// MISC
// ═══════════════════════════════════════════════════════════════

describe('AgencySlotCreateSchema', () => {
  it('debe aceptar slot válido', () => ok(AgencySlotCreateSchema, {
    client_name: 'Agencia Demo', admin_email: 'admin@demo.com',
  }));
  it('debe rechazar email inválido', () => fail(AgencySlotCreateSchema, {
    client_name: 'A', admin_email: 'no-email',
  }, 'admin_email'));
  it('debe rechazar sin client_name', () => fail(AgencySlotCreateSchema, { admin_email: 'a@b.com' }));
});

describe('CanalWhatsAppCreateSchema', () => {
  const valid = {
    phoneId: '123456789',
    businessAccountId: '987654321',
    accessToken: 'EAAb...xyz',
  };
  it('debe aceptar canal válido', () => ok(CanalWhatsAppCreateSchema, valid));
  it('debe rechazar sin phoneId', () => fail(CanalWhatsAppCreateSchema, { businessAccountId: 'x', accessToken: 'y' }));
  it('debe aceptar con nombre y número opcionales', () => ok(CanalWhatsAppCreateSchema, {
    ...valid, nombreBandeja: 'Ventas', numeroTelefono: '+34600123456',
  }));
});

describe('CanvaDesignCreateSchema', () => {
  it('debe aceptar diseño mínimo', () => ok(CanvaDesignCreateSchema, {}));
  it('debe aplicar defaults', () => {
    const r = check(CanvaDesignCreateSchema, {});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.designType).toBe('SocialMedia');
  });
  it('debe aceptar con dimensiones (coerce)', () => {
    const r = check(CanvaDesignCreateSchema, { width: '1080', height: '1080', title: 'Post IG' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.width).toBe(1080);
      expect(r.data.height).toBe(1080);
    }
  });
});

describe('CuponValidarSchema', () => {
  it('debe aceptar cupón válido', () => ok(CuponValidarSchema, { codigo: 'WELCOME20', cursoId: 'cuid12345678901234567890123' }));
  it('debe rechazar sin codigo', () => fail(CuponValidarSchema, { cursoId: 'cuid12345678901234567890123' }));
  it('debe rechazar sin cursoId', () => fail(CuponValidarSchema, { codigo: 'CODE' }));
});

describe('CustomerAuthLoginSchema', () => {
  it('debe aceptar login válido', () => ok(CustomerAuthLoginSchema, { email: 'cliente@test.com', password: 'pass123' }));
  it('debe rechazar email inválido', () => fail(CustomerAuthLoginSchema, { email: 'no-email', password: 'x' }));
  it('debe rechazar password vacío', () => fail(CustomerAuthLoginSchema, { email: 'a@b.com', password: '' }));
});

describe('InternalQueueEnqueueSchema', () => {
  it('debe aceptar enqueue mínimo', () => ok(InternalQueueEnqueueSchema, { type: 'send_email', targetId: 'target-1' }));
  it('debe aceptar con todas las opciones', () => ok(InternalQueueEnqueueSchema, {
    type: 'send_email', targetId: 't1', payload: { to: 'a@b.com' }, priority: 1, maxAttempts: 5, delayMs: 1000,
  }));
  it('debe hacer coerce de priority (string → number)', () => {
    const r = check(InternalQueueEnqueueSchema, { type: 't', targetId: 't1', priority: '3' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.priority).toBe(3);
  });
});

describe('NotificationsSendSchema', () => {
  const valid = {
    title: 'Alerta',
    body: 'Tienes un nuevo lead',
    channel: 'push',
    recipients: [{ userId: 'u1' }],
  };

  it('debe aceptar notificación válida', () => ok(NotificationsSendSchema, valid));
  it('debe rechazar sin recipients', () => fail(NotificationsSendSchema, { title: 'T', body: 'B', channel: 'push', recipients: [] }, 'recipients'));
  it('debe aceptar con metadata y scheduledFor', () => ok(NotificationsSendSchema, {
    ...valid, metadata: { type: 'lead' }, scheduledFor: '2025-06-01T10:00:00Z', priority: 'high',
  }));
});

describe('PublicCitaCreateSchema', () => {
  it('debe aceptar cita mínima', () => ok(PublicCitaCreateSchema, { fechaHora: '2025-06-15T10:00:00.000Z' }));
  it('debe aceptar con leadData completo', () => ok(PublicCitaCreateSchema, {
    fechaHora: '2025-06-15T10:00:00.000Z',
    leadData: { email: 'cliente@test.com', nombre: 'Juan', telefono: '+34600123456', empresa: 'ACME' },
  }));
  it('debe rechazar leadData con email inválido', () => fail(PublicCitaCreateSchema, {
    fechaHora: '2025-06-15T10:00:00.000Z',
    leadData: { email: 'no-email' },
  }, 'leadData'));
});

describe('PublicLeadCreateSchema', () => {
  it('debe aceptar lead mínimo (solo email)', () => ok(PublicLeadCreateSchema, { email: 'lead@test.com' }));
  it('debe aceptar con todos los campos', () => ok(PublicLeadCreateSchema, {
    email: 'lead@test.com', name: 'Lead', empresa: 'ACME', rol: 'CEO', necesidad: 'CRM', fuente: 'web',
  }));
  it('debe rechazar email inválido', () => fail(PublicLeadCreateSchema, { email: 'no-email' }));
});

describe('SupportTicketCreateSchema', () => {
  it('debe aceptar ticket mínimo', () => ok(SupportTicketCreateSchema, {
    subject: 'Problema con factura', description: 'No puedo generar la factura de junio',
  }));
  it('debe rechazar sin subject', () => fail(SupportTicketCreateSchema, { description: 'desc' }));
  it('debe rechazar sin description', () => fail(SupportTicketCreateSchema, { subject: 'subj' }));
  it('debe aceptar con entity vinculada', () => ok(SupportTicketCreateSchema, {
    subject: 'Bug', description: 'detalle', entityType: 'lead', entityId: 'lead-123',
  }));
});

describe('TrialActionSchema (enum)', () => {
  const validActions = ['start', 'convert', 'extend', 'cancel', 'expire', 'markActivation'] as const;

  it('debe aceptar todas las acciones válidas', () => {
    for (const a of validActions) {
      ok(TrialActionSchema, { action: a });
    }
  });
  it('debe rechazar acción inválida', () => fail(TrialActionSchema, { action: 'pause' }));
  it('debe aceptar con diasTrial', () => ok(TrialActionSchema, { action: 'extend', diasTrial: 14 }));
  it('debe aceptar con plan', () => ok(TrialActionSchema, { action: 'convert', plan: 'pro' }));
  it('debe hacer coerce de diasTrial (string → number)', () => {
    const r = check(TrialActionSchema, { action: 'extend', diasTrial: '30' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.diasTrial).toBe(30);
  });
});

describe('UploadPresignedSchema', () => {
  it('debe aceptar upload válido', () => ok(UploadPresignedSchema, { fileName: 'foto.png', fileType: 'image/png' }));
  it('debe rechazar sin fileName', () => fail(UploadPresignedSchema, { fileType: 'image/png' }));
  it('debe rechazar sin fileType', () => fail(UploadPresignedSchema, { fileName: 'f.png' }));
});

describe('SovereigntyAuditLogSchema', () => {
  it('debe aceptar log mínimo', () => ok(SovereigntyAuditLogSchema, { message: 'Audit entry' }));
  it('debe aceptar con todos los campos', () => ok(SovereigntyAuditLogSchema, {
    level: 'ERROR', message: 'Invalid signature', category: 'sovereignty', metadata: { docId: 'd1' },
  }));
});

describe('PortalClaimSchema', () => {
  const valid = {
    token: 'tok-123',
    category: 'laboral',
    title: 'Horas extra no pagadas',
    description: 'Trabajé 20h extra en junio sin compensación',
  };

  it('debe aceptar claim válido', () => ok(PortalClaimSchema, valid));
  it('debe aceptar con evidenceUrl', () => ok(PortalClaimSchema, { ...valid, evidenceUrl: 'https://files.example.com/evidence.pdf' }));
  it('debe rechazar sin token', () => fail(PortalClaimSchema, { category: 'x', title: 'x', description: 'x' }));
  it('debe rechazar sin category', () => fail(PortalClaimSchema, { token: 'x', title: 'x', description: 'x' }));
});

describe('PortalVerifySchema', () => {
  it('debe aceptar verify válido', () => ok(PortalVerifySchema, {
    type: 'document', id: 'doc-1', hash: 'abc123def456',
  }));
  it('debe rechazar sin type', () => fail(PortalVerifySchema, { id: 'd1', hash: 'h1' }));
  it('debe rechazar sin id', () => fail(PortalVerifySchema, { type: 't', hash: 'h1' }));
  it('debe rechazar sin hash', () => fail(PortalVerifySchema, { type: 't', id: 'd1' }));
});

describe('TareaEntregaSchema', () => {
  it('debe aceptar entrega mínima', () => ok(TareaEntregaSchema, {
    estudianteId: 'cuid12345678901234567890123',
  }));
  it('debe aceptar con contenido y archivo', () => ok(TareaEntregaSchema, {
    estudianteId: 'cuid12345678901234567890123',
    contenido: 'Mi respuesta',
    archivoUrl: 'https://files.example.com/tarea.pdf',
  }));
  it('debe rechazar sin estudianteId', () => fail(TareaEntregaSchema, { contenido: 'x' }));
});

describe('EstudianteUpdateSchema', () => {
  it('debe aceptar update vacío', () => ok(EstudianteUpdateSchema, {}));
  it('debe aceptar update parcial', () => ok(EstudianteUpdateSchema, { nombre: 'Nuevo', pais: 'ES' }));
  it('debe rechazar email inválido', () => fail(EstudianteUpdateSchema, { email: 'no-email' }));
});

describe('QuizIntentoCreateSchema', () => {
  it('debe aceptar intento con respuestas', () => ok(QuizIntentoCreateSchema, {
    respuestas: { q1: 'a', q2: 'b' },
  }));
  it('debe aceptar con tiempo', () => ok(QuizIntentoCreateSchema, {
    respuestas: { q1: 'a' }, tiempoTomadoMinutos: 15,
  }));
  it('debe hacer coerce de tiempo (string → number)', () => {
    const r = check(QuizIntentoCreateSchema, { respuestas: { q1: 'a' }, tiempoTomadoMinutos: '10' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tiempoTomadoMinutos).toBe(10);
  });
});

describe('PlaudernBotCreateSchema', () => {
  it('debe aceptar bot con tempAuth', () => ok(PlaudernBotCreateSchema, { tempAuth: true }));
  it('debe aceptar bot con apiKey', () => ok(PlaudernBotCreateSchema, {
    apiKey: 'pk-12345', name: 'Sales Bot', personality: 'Friendly',
  }));
  it('debe aceptar con integrationId', () => ok(PlaudernBotCreateSchema, {
    integrationId: 'int-1', name: 'Bot', greetingMessage: '¡Hola!', settings: { model: 'gemini' },
  }));
});

describe('UserLayoutSchema (refine)', () => {
  it('debe aceptar layout válido', () => ok(UserLayoutSchema, { layout: { widgets: [] } }));
  it('debe rechazar layout null', () => fail(UserLayoutSchema, { layout: null }));
  it('debe rechazar layout undefined', () => fail(UserLayoutSchema, { layout: undefined }));
  it('debe rechazar sin layout', () => fail(UserLayoutSchema, {}));
});
