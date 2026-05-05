import { PrismaClient } from '@prisma/client';

export interface RLSConfig {
  tenantId: string;
  bypassRLS?: boolean;
}

export interface RLSStatus {
  enabled: boolean;
  tableName: string;
  policies: string[];
  bypassAllowed: boolean;
}

export interface MigrationResult {
  success: boolean;
  version?: number;
  error?: string;
}

const RLS_FUNCTIONS = {
  getCurrentTenantId: 'app.get_current_tenant_id()',
  setTenantContext: 'app.set_tenant_context',
  clearTenantContext: 'app.clear_tenant_context',
  rlsTenantCheck: 'app.rls_tenant_check',
  rlsBypassAllowed: 'app.rls_bypass_allowed',
} as const;

const TABLES_REQUIRING_RLS = [
  'User', 'Lead', 'Contact', 'Cita', 'Servicio', 'Automation', 'Task', 'Tarea',
  'Deal', 'Invoice', 'Contrato', 'Cotizacion', 'Role', 'AuditLog', 'Configuracion',
  'AttendanceRules', 'OnboardingProgress', 'LeadFieldDefinition', 'LeadAttachment',
  'Estudiante', 'Curso', 'Cupon', 'Bundle', 'Conversation', 'Campaign', 'CampaignLead',
  'PipelineStage', 'DealActivity', 'DealAttachment', 'CotizacionItem', 'ContratoItem',
  'ClientSignatureSettings', 'SignatureRequest', 'SignatureAuditEvent', 'SocialPost',
  'SocialPlatformConfig', 'AutomationRule', 'AutomationLog', 'AutomationRuleVersion',
  'MarketingAuditLog', 'Notification', 'N8nWorkflow', 'TenantWorkflow', 'AcademyPath',
  'AiDecisionLog', 'Asset', 'AssetAssignment', 'AssetEvent', 'AssetMaintenance',
  'Audience', 'BankConnection', 'BillOfMaterials', 'CashflowProjection',
  'CatalogoFieldDefinition', 'CatalogoItem', 'Channel', 'ChatAttribution',
  'ChatChannel', 'ChatMessage', 'ChatSubscription', 'ChatbotConfig', 'Comision',
  'CompetitiveInsight', 'ConfiguracionFiscalEmisor', 'ContentAsset', 'CustomerFiscalData',
  'EmailCampaign', 'EmailTemplate', 'Employee', 'EmployeeAbsenceES', 'EmployeeBenefit',
  'EmployeePayrollProfileES', 'erp_academy_users', 'erp_academy_audit_logs',
  'erp_capacity_forecasts', 'erp_capacity_snapshots', 'erp_cost_components',
  'erp_customer_claims', 'erp_customer_org_members', 'erp_customer_portal_access',
  'erp_customer_private_documents', 'erp_customer_users', 'erp_delivery_confirmations',
  'erp_delivery_promises', 'erp_digital_access', 'erp_digital_signatures',
  'erp_employee_assets', 'erp_employee_schedules', 'erp_expense_claims',
  'erp_industrial_assets', 'erp_inventory_lots', 'erp_maintenance_logs',
  'erp_maintenance_orders', 'erp_material_requirements', 'erp_material_shortages',
  'erp_order_reservations', 'erp_portal_verification_logs', 'erp_procurement_suggestions',
  'erp_product_families', 'erp_production_capacity', 'erp_production_costing',
  'erp_production_lines', 'erp_production_readiness', 'erp_sales_order_audits',
  'erp_sales_order_items', 'erp_sales_orders', 'erp_schedule_assignments',
  'erp_schedule_constraints', 'erp_schedule_decision_logs', 'erp_scheduling_plans',
  'erp_shift_plans', 'erp_shipments', 'erp_vacation_requests', 'ExecutiveAlert',
  'Expense', 'ExternalLead', 'ExternalLeadSearch', 'FinancialAudit', 'FinancialSummary',
  'GemmaRequest', 'GemmaResponse', 'GoogleCalendarIntegration', 'IncomingWebhook',
  'IncomingWebhookDelivery', 'Integration', 'InAppNotification', 'KnowledgeArticle',
  'MarketingSuppression', 'MessageDraft', 'MetaVenta', 'MessagingHubConfig',
  'OrdenVenta', 'OutgoingWebhook', 'OutgoingWebhookDelivery', 'Page',
  'PerfilFiscalCliente', 'PlaudernIntegration', 'ProfitabilityRecord', 'Project',
  'ProjectMilestone', 'ProposedAction', 'QualityCheck', 'NonConformity', 'QualityPoint',
  'Quiz', 'SalesPlaybookEntry', 'SavedSearch', 'ScannedCard', 'StockLevel',
  'StockMovement', 'StrategicRecommendation', 'StrategicThreshold', 'StrategySnapshot',
  'Supplier', 'SupportTicket', 'TasaImpuesto', 'TenantFeature', 'TrainingSession',
  'UnsubscribeList', 'UserWhatsAppInstance', 'Warehouse', 'WorkOrder', 'WebForm',
  'WebFormSubmission', 'GlobalAuditCloud', 'DiscoverySignal', 'MarketObservation',
  'ProductionLog', 'SecurityIncident', 'TaxRecord', 'UserGuidanceLog',
  'AccountingAccount', 'AccountingEntry', 'AccountingPeriod', 'ABTestResult',
  'BusinessDomain', 'CollectiveAgreement', 'client_subscriptions', 'PayrollRecord',
  'PayrollRecordES', 'Subscription', 'StripeFiscalLink', 'AnytimebotIntegration',
  'DigitalCard',
] as const;

export class RLSManager {
  private client: PrismaClient;
  private tenantId: string | null = null;
  private bypassRLS: boolean = false;

  constructor(client: PrismaClient) {
    this.client = client;
  }

  async setTenantContext(tenantId: string, bypass: boolean = false): Promise<void> {
    this.tenantId = tenantId;
    this.bypassRLS = bypass;

    if (bypass) {
      await this.client.$executeRaw`SELECT set_config('app.rls_bypass', 'true', false)`;
    }

    await this.client.$executeRawUnsafe(
      `SELECT app.set_tenant_context('${tenantId.replace(/'/g, "''")}')`
    );
  }

  async clearTenantContext(): Promise<void> {
    this.tenantId = null;
    this.bypassRLS = false;

    try {
      await this.client.$executeRaw`SELECT app.clear_tenant_context()`;
    } catch {
      // Function might not exist yet
    }

    try {
      await this.client.$executeRaw`SELECT set_config('app.rls_bypass', '', true)`;
    } catch {
      // Ignore errors when clearing
    }
  }

  async verifyRLSEnabled(): Promise<RLSStatus[]> {
    try {
      const result = await this.client.$queryRaw<Array<{
        tablename: string;
        rowsecurity: boolean;
        policynames: string[];
      }>>`
        SELECT 
          t.tablename::text,
          t.rowsecurity::boolean,
          COALESCE(
            ARRAY_AGG(p.polyname ORDER BY p.polyname) FILTER (WHERE p.polyname IS NOT NULL),
            ARRAY[]::text[]
          ) as policynames
        FROM pg_tables t
        LEFT JOIN pg_policy p ON t.tablename = p.tablename
        WHERE t.schemaname = 'public'
          AND t.tablename IN (
            'User', 'Lead', 'Contact', 'Cita', 'Servicio', 'Automation', 'Task', 'Tarea',
            'Deal', 'Invoice', 'Contrato', 'Cotizacion', 'Role', 'AuditLog', 'Configuracion'
          )
        GROUP BY t.tablename, t.rowsecurity
        ORDER BY t.tablename
      `;

      return result.map(row => ({
        enabled: row.rowsecurity ?? false,
        tableName: row.tablename,
        policies: row.policynames ?? [],
        bypassAllowed: false,
      }));
    } catch (error) {
      console.error('Error verifying RLS:', error);
      return [];
    }
  }

  async checkRLSFunctionsExist(): Promise<boolean> {
    try {
      const result = await this.client.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'app'
          AND p.proname = 'rls_tenant_check'
        ) as exists
      `;
      return result[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  async getMigrationStatus(): Promise<MigrationResult> {
    try {
      const result = await this.client.$queryRaw<Array<{
        version: number;
        applied_at: Date;
      }>>`
        SELECT version, applied_at 
        FROM _rls_migration 
        ORDER BY applied_at DESC 
        LIMIT 1
      `;

      if (result.length > 0) {
        return {
          success: true,
          version: Number(result[0].version),
        };
      }

      return {
        success: false,
        error: 'No RLS migration found',
      };
    } catch {
      return {
        success: false,
        error: 'Migration table does not exist',
      };
    }
  }

  async getCurrentTenantId(): Promise<string | null> {
    try {
      const result = await this.client.$queryRaw<Array<{ get_current_tenant_id: string | null }>>`
        SELECT app.get_current_tenant_id() as get_current_tenant_id
      `;
      return result[0]?.get_current_tenant_id ?? null;
    } catch {
      return null;
    }
  }

  async isBypassAllowed(): Promise<boolean> {
    try {
      const result = await this.client.$queryRaw<Array<{ rls_bypass_allowed: boolean }>>`
        SELECT app.rls_bypass_allowed() as rls_bypass_allowed
      `;
      return result[0]?.rls_bypass_allowed ?? false;
    } catch {
      return false;
    }
  }

  async verifyTenantIsolation(tableName: string, sampleSize: number = 10): Promise<{
    isolated: boolean;
    sampleResults: Array<{ id: string; tenantId: string | null }>;
    currentTenantId: string | null;
  }> {
    const currentTenant = await this.getCurrentTenantId();
    
    if (!currentTenant) {
      return {
        isolated: false,
        sampleResults: [],
        currentTenantId: null,
      };
    }

    try {
      const result = await this.client.$queryRawUnsafe<Array<{
        id: string;
        tenant_id: string | null;
      }>>(`
        SELECT id, tenant_id 
        FROM "${tableName}" 
        LIMIT ${sampleSize}
      `);

      const isolated = result.every(row => 
        row.tenant_id === currentTenant || row.tenant_id === null
      );

      return {
        isolated,
        sampleResults: result.map(r => ({ id: r.id, tenantId: r.tenant_id })),
        currentTenantId: currentTenant,
      };
    } catch (error) {
      return {
        isolated: false,
        sampleResults: [],
        currentTenantId: currentTenant,
      };
    }
  }
}

export function createRLSManager(client: PrismaClient): RLSManager {
  return new RLSManager(client);
}

export async function withTenantContext<T>(
  client: PrismaClient,
  tenantId: string,
  operation: (rls: RLSManager) => Promise<T>
): Promise<T> {
  const rls = createRLSManager(client);
  
  try {
    await rls.setTenantContext(tenantId);
    return await operation(rls);
  } finally {
    await rls.clearTenantContext();
  }
}

export async function withRLSBypass<T>(
  client: PrismaClient,
  operation: (rls: RLSManager) => Promise<T>
): Promise<T> {
  const rls = createRLSManager(client);
  const originalTenant = await rls.getCurrentTenantId();
  
  try {
    await rls.setTenantContext(originalTenant ?? '', true);
    return await operation(rls);
  } finally {
    await rls.clearTenantContext();
  }
}

export default {
  RLSManager,
  createRLSManager,
  withTenantContext,
  withRLSBypass,
  RLS_FUNCTIONS,
  TABLES_REQUIRING_RLS,
};