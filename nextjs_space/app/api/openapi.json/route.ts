export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import VOLKERN_API_SPEC from '@/lib/openapi/spec';
import { buildComponentSchemas } from '@/lib/openapi/generator';

// ─── Importar todos los Zod schemas ─────────────────────────

import * as LeadsSchemas from '@/lib/validation/schemas/leads';
import * as CitasSchemas from '@/lib/validation/schemas/citas';
import * as DealsSchemas from '@/lib/validation/schemas/deals';
import * as ContactsSchemas from '@/lib/validation/schemas/contacts';
import * as EmployeesSchemas from '@/lib/validation/schemas/employees';
import * as FacturasSchemas from '@/lib/validation/schemas/facturas';
import * as SubscriptionsSchemas from '@/lib/validation/schemas/subscriptions';
import * as UsersSchemas from '@/lib/validation/schemas/users';
import * as MarketingSchemas from '@/lib/validation/schemas/marketing';
import * as AdminSchemas from '@/lib/validation/schemas/admin';
import * as AcademySchemas from '@/lib/validation/schemas/academy';
import * as AutomationSchemas from '@/lib/validation/schemas/automation';
import * as WebhooksSchemas from '@/lib/validation/schemas/webhooks';
import * as AiSchemas from '@/lib/validation/schemas/ai';
import * as CmsSchemas from '@/lib/validation/schemas/cms';
import * as SettingsSchemas from '@/lib/validation/schemas/settings';
import * as InventorySchemas from '@/lib/validation/schemas/inventory';
import * as EventsSchemas from '@/lib/validation/schemas/events';
import * as NotificationsSchemas from '@/lib/validation/schemas/notifications';
import * as SkillsSchemas from '@/lib/validation/schemas/skills';
import * as MessagingSchemas from '@/lib/validation/schemas/messaging';
import * as FinanceSchemas from '@/lib/validation/schemas/finance';
import * as ErpSchemas from '@/lib/validation/schemas/erp';
import * as IntegracionesSchemas from '@/lib/validation/schemas/integraciones';
import * as EqualitySchemas from '@/lib/validation/schemas/equality';
import * as MiscSchemas from '@/lib/validation/schemas/misc';

// ─── Generar OpenAPI components desde Zod ───────────────────

// Filtramos solo las que son Zod schemas (evitamos tipos y otros exports)
function isZodSchema(val: unknown): boolean {
  return val !== null && typeof val === 'object' && '_def' in val && 'safeParse' in val;
}

function filterSchemas(module: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(module)) {
    if (isZodSchema(val)) {
      result[key] = val;
    }
  }
  return result;
}

const AUTO_SCHEMAS = buildComponentSchemas([
  ...Object.entries(filterSchemas(LeadsSchemas)).map(([name, schema]) => ({
    name: `Leads_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Lead schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(CitasSchemas)).map(([name, schema]) => ({
    name: `Citas_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Cita schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(DealsSchemas)).map(([name, schema]) => ({
    name: `Deals_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Deal schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(ContactsSchemas)).map(([name, schema]) => ({
    name: `Contacts_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Contact schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(EmployeesSchemas)).map(([name, schema]) => ({
    name: `Employees_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Employee schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(FacturasSchemas)).map(([name, schema]) => ({
    name: `Facturas_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Factura schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(SubscriptionsSchemas)).map(([name, schema]) => ({
    name: `Subscriptions_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Subscription schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(UsersSchemas)).map(([name, schema]) => ({
    name: `Users_${name.replace(/Schema$/, '')}`,
    schema,
    description: `User schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(MarketingSchemas)).map(([name, schema]) => ({
    name: `Marketing_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Marketing schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(AdminSchemas)).map(([name, schema]) => ({
    name: `Admin_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Admin schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(AcademySchemas)).map(([name, schema]) => ({
    name: `Academy_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Academy schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(AutomationSchemas)).map(([name, schema]) => ({
    name: `Automation_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Automation schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(WebhooksSchemas)).map(([name, schema]) => ({
    name: `Webhooks_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Webhook schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(AiSchemas)).map(([name, schema]) => ({
    name: `Ai_${name.replace(/Schema$/, '')}`,
    schema,
    description: `AI schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(CmsSchemas)).map(([name, schema]) => ({
    name: `CMS_${name.replace(/Schema$/, '')}`,
    schema,
    description: `CMS schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(SettingsSchemas)).map(([name, schema]) => ({
    name: `Settings_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Settings schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(InventorySchemas)).map(([name, schema]) => ({
    name: `Inventory_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Inventory schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(EventsSchemas)).map(([name, schema]) => ({
    name: `Events_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Event schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(NotificationsSchemas)).map(([name, schema]) => ({
    name: `Notifications_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Notification schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(SkillsSchemas)).map(([name, schema]) => ({
    name: `Skills_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Skill schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(MessagingSchemas)).map(([name, schema]) => ({
    name: `Messaging_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Messaging schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(FinanceSchemas)).map(([name, schema]) => ({
    name: `Finance_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Finance schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(ErpSchemas)).map(([name, schema]) => ({
    name: `Erp_${name.replace(/Schema$/, '')}`,
    schema,
    description: `ERP schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(IntegracionesSchemas)).map(([name, schema]) => ({
    name: `Integraciones_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Integration schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(EqualitySchemas)).map(([name, schema]) => ({
    name: `Equality_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Equality schema: ${name}`,
  })),
  ...Object.entries(filterSchemas(MiscSchemas)).map(([name, schema]) => ({
    name: `Misc_${name.replace(/Schema$/, '')}`,
    schema,
    description: `Misc schema: ${name}`,
  })),
]);

// ─── Merge con spec estático ────────────────────────────────

// Singleton memoized para evitar regenerar las 300+ schemas en cada request
let cachedSpec: Record<string, unknown> | null = null;

function generateSpec() {
  return {
    ...VOLKERN_API_SPEC,
    components: {
      ...VOLKERN_API_SPEC.components,
      schemas: {
        // Primero los schemas manuales (prioridad)
        ...(VOLKERN_API_SPEC.components as any)?.schemas,
        // Luego los auto-generados desde Zod (más de 300 schemas)
        ...AUTO_SCHEMAS,
      },
    },
  };
}

/**
 * GET /api/openapi.json
 *
 * Sirve la especificación OpenAPI 3.0 en formato JSON.
 * Los component schemas se auto-generan desde los Zod schemas de validación.
 * Público — sin autenticación, para que Swagger UI pueda cargarlo.
 */
export async function GET() {
  if (!cachedSpec) {
    cachedSpec = generateSpec();
  }

  return NextResponse.json(cachedSpec, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
