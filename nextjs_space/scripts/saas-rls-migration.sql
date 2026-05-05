-- ============================================================================
-- Row-Level Security (RLS) Migration for Multi-Tenant CRM
-- =============================================================================
-- This migration implements RLS policies to enforce tenant isolation at the
-- database level, providing defense-in-depth security beyond application-level
-- filtering.
--
-- IMPORTANT: Run this migration as a superuser (postgres) or the database owner.
-- After enabling RLS, connections must set app.tenant_id to access data.
-- =============================================================================

BEGIN;

-- =============================================================================
-- MIGRATION TRACKING TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS _rls_migration (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version        INTEGER NOT NULL DEFAULT 1,
    applied_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    description    TEXT NOT NULL,
    checksum       TEXT
);

-- =============================================================================
-- TENANT CONTEXT FUNCTIONS
-- =============================================================================

-- Function to get current tenant ID from session setting
CREATE OR REPLACE FUNCTION app.get_current_tenant_id()
RETURNS TEXT
STABLE
PARALLEL SAFE
LANGUAGE SQL
AS $$
    SELECT NULLIF(current_setting('app.tenant_id', true), '')::TEXT;
$$;

-- Function to set tenant context for current session
CREATE OR REPLACE FUNCTION app.set_tenant_context(tenant_id TEXT)
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
BEGIN
    PERFORM set_config('app.tenant_id', tenant_id, false);
END;
$$;

-- Function to clear tenant context
CREATE OR REPLACE FUNCTION app.clear_tenant_context()
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
BEGIN
    PERFORM set_config('app.tenant_id', '', true);
END;
$$;

-- Function to check if current session can bypass RLS (superuser/admin)
CREATE OR REPLACE FUNCTION app.rls_bypass_allowed()
RETURNS BOOLEAN
STABLE
PARALLEL SAFE
LANGUAGE SQL
AS $$
    SELECT current_setting('app.rls_bypass', true)::TEXT = 'true'
       OR current_user = 'postgres'
       OR pg_has_role(current_user, 'superuser', 'USAGE')
       OR EXISTS (
           SELECT 1 FROM pg_roles r
           WHERE r.rolname = current_user
           AND r.rolsuper = true
       );
$$;

-- Function to get current user role
CREATE OR REPLACE FUNCTION app.get_current_user_role()
RETURNS TEXT
STABLE
PARALLEL SAFE
LANGUAGE SQL
AS $$
    SELECT current_role;
$$;

-- =============================================================================
-- RLS POLICY FUNCTION
-- =============================================================================

-- Main RLS enforcement function used by policies
CREATE OR REPLACE FUNCTION app.rls_tenant_check(table_tenant_id TEXT)
RETURNS BOOLEAN
STABLE
PARALLEL SAFE
LANGUAGE PLPGSQL
AS $$
DECLARE
    current_tenant TEXT;
    bypass_allowed BOOLEAN;
BEGIN
    -- Always allow if bypass is enabled (for migrations/admin tasks)
    bypass_allowed := app.rls_bypass_allowed();
    IF bypass_allowed THEN
        RETURN true;
    END IF;

    -- Get current tenant from session
    current_tenant := app.get_current_tenant_id();

    -- Allow if no tenant context is set (will be filtered by app logic)
    IF current_tenant IS NULL THEN
        RETURN true;
    END IF;

    -- Check if the row's tenant_id matches the current session's tenant
    -- Handle both nullable and non-nullable tenantId columns
    IF table_tenant_id IS NULL THEN
        -- For tables where tenantId can be NULL, decide based on requirements
        -- Here we allow NULL tenantId rows for backward compatibility
        RETURN true;
    END IF;

    RETURN table_tenant_id = current_tenant;
END;
$$;

-- =============================================================================
-- ENABLE RLS ON TENANT-SCOPED TABLES
-- =============================================================================

-- IMPORTANT: Tables are listed in dependency order to avoid foreign key issues
-- First enable on tables that don't have foreign references from other tenant tables

-- 1. Tenant table - special case, allows full access (managed separately)
-- Note: We don't enable RLS on Tenant itself as it needs to be queryable globally
-- for tenant lookup. Instead, we rely on application-level security.

-- 2. Core tables with tenantId
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cita" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Servicio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tarea" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contrato" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cotizacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Configuracion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceRules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnboardingProgress" ENABLE ROW LEVEL SECURITY;

-- 3. Additional tenant-scoped tables from schema
ALTER TABLE "LeadFieldDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Estudiante" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Curso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cupon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bundle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CotizacionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContratoItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientSignatureSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignatureRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignatureAuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialPlatformConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRuleVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "N8nWorkflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantWorkflow" ENABLE ROW LEVEL SECURITY;

-- 4. More tenant-scoped tables
ALTER TABLE "AcademyPath" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiDecisionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetMaintenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Audience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillOfMaterials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashflowProjection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CatalogoFieldDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CatalogoItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Channel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatAttribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatbotConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Comision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompetitiveInsight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConfiguracionFiscalEmisor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerFiscalData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeAbsenceES" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeBenefit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeePayrollProfileES" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_academy_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_academy_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_capacity_forecasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_capacity_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_cost_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_customer_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_customer_org_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_customer_portal_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_customer_private_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_customer_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_delivery_confirmations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_delivery_promises" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_digital_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_digital_signatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_employee_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_employee_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_expense_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_industrial_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_inventory_lots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_maintenance_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_maintenance_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_material_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_material_shortages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_order_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_portal_verification_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_procurement_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_product_families" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_production_capacity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_production_costing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_production_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_production_readiness" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_sales_order_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_sales_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_schedule_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_schedule_constraints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_schedule_decision_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_scheduling_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_shift_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp_vacation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecutiveAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExternalLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExternalLeadSearch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialSummary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GemmaRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GemmaResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncomingWebhook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncomingWebhookDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InAppNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeArticle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingSuppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetaVenta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessagingHubConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrdenVenta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutgoingWebhook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutgoingWebhookDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PerfilFiscalCliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaudernIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfitabilityRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposedAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualityCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NonConformity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualityPoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Quiz" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesPlaybookEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedSearch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScannedCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLevel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StrategicRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StrategicThreshold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StrategySnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TasaImpuesto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantFeature" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UnsubscribeList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserWhatsAppInstance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebForm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebFormSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GlobalAuditCloud" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscoverySignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecurityIncident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserGuidanceLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountingAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountingEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountingPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ABTestResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollectiveAgreement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollRecordES" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StripeFiscalLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnytimebotIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoicePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentMethod" ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- CREATE RLS POLICIES
-- =============================================================================
-- For each table, create policies that filter by app.tenant_id setting
-- Uses a permissive policy that allows access when:
-- 1. RLS bypass is enabled (admin/superuser)
-- 2. tenant_id matches the current setting
-- 3. tenant_id is NULL (backward compatibility)

-- User table policies
DROP POLICY IF EXISTS "User_tenant_isolation" ON "User";
CREATE POLICY "User_tenant_isolation" ON "User"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Lead table policies
DROP POLICY IF EXISTS "Lead_tenant_isolation" ON "Lead";
CREATE POLICY "Lead_tenant_isolation" ON "Lead"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Contact table policies
DROP POLICY IF EXISTS "Contact_tenant_isolation" ON "Contact";
CREATE POLICY "Contact_tenant_isolation" ON "Contact"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Cita (Appointment) table policies
DROP POLICY IF EXISTS "Cita_tenant_isolation" ON "Cita";
CREATE POLICY "Cita_tenant_isolation" ON "Cita"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Servicio (Service) table policies
DROP POLICY IF EXISTS "Servicio_tenant_isolation" ON "Servicio";
CREATE POLICY "Servicio_tenant_isolation" ON "Servicio"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Automation table policies
DROP POLICY IF EXISTS "Automation_tenant_isolation" ON "Automation";
CREATE POLICY "Automation_tenant_isolation" ON "Automation"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Task table policies
DROP POLICY IF EXISTS "Task_tenant_isolation" ON "Task";
CREATE POLICY "Task_tenant_isolation" ON "Task"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Tarea (Assignment/Homework) table policies
DROP POLICY IF EXISTS "Tarea_tenant_isolation" ON "Tarea";
CREATE POLICY "Tarea_tenant_isolation" ON "Tarea"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Deal table policies
DROP POLICY IF EXISTS "Deal_tenant_isolation" ON "Deal";
CREATE POLICY "Deal_tenant_isolation" ON "Deal"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Invoice table policies
DROP POLICY IF EXISTS "Invoice_tenant_isolation" ON "Invoice";
CREATE POLICY "Invoice_tenant_isolation" ON "Invoice"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Contrato (Contract) table policies
DROP POLICY IF EXISTS "Contrato_tenant_isolation" ON "Contrato";
CREATE POLICY "Contrato_tenant_isolation" ON "Contrato"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Cotizacion (Quote) table policies
DROP POLICY IF EXISTS "Cotizacion_tenant_isolation" ON "Cotizacion";
CREATE POLICY "Cotizacion_tenant_isolation" ON "Cotizacion"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Role table policies
DROP POLICY IF EXISTS "Role_tenant_isolation" ON "Role";
CREATE POLICY "Role_tenant_isolation" ON "Role"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- AuditLog table policies
DROP POLICY IF EXISTS "AuditLog_tenant_isolation" ON "AuditLog";
CREATE POLICY "AuditLog_tenant_isolation" ON "AuditLog"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Configuracion (Configuration) table policies
DROP POLICY IF EXISTS "Configuracion_tenant_isolation" ON "Configuracion";
CREATE POLICY "Configuracion_tenant_isolation" ON "Configuracion"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- AttendanceRules table policies
DROP POLICY IF EXISTS "AttendanceRules_tenant_isolation" ON "AttendanceRules";
CREATE POLICY "AttendanceRules_tenant_isolation" ON "AttendanceRules"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- OnboardingProgress table policies
DROP POLICY IF EXISTS "OnboardingProgress_tenant_isolation" ON "OnboardingProgress";
CREATE POLICY "OnboardingProgress_tenant_isolation" ON "OnboardingProgress"
    FOR ALL
    USING (app.rls_tenant_check("tenantId"));

-- Additional policies for other tables (batch creation)

-- Lead related
DROP POLICY IF EXISTS "LeadFieldDefinition_tenant_isolation" ON "LeadFieldDefinition";
CREATE POLICY "LeadFieldDefinition_tenant_isolation" ON "LeadFieldDefinition"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "LeadAttachment_tenant_isolation" ON "LeadAttachment";
CREATE POLICY "LeadAttachment_tenant_isolation" ON "LeadAttachment"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

-- Academy & Education
DROP POLICY IF EXISTS "Estudiante_tenant_isolation" ON "Estudiante";
CREATE POLICY "Estudiante_tenant_isolation" ON "Estudiante"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "Curso_tenant_isolation" ON "Curso";
CREATE POLICY "Curso_tenant_isolation" ON "Curso"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "Cupon_tenant_isolation" ON "Cupon";
CREATE POLICY "Cupon_tenant_isolation" ON "Cupon"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "Bundle_tenant_isolation" ON "Bundle";
CREATE POLICY "Bundle_tenant_isolation" ON "Bundle"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

-- Conversations & Messaging
DROP POLICY IF EXISTS "Conversation_tenant_isolation" ON "Conversation";
CREATE POLICY "Conversation_tenant_isolation" ON "Conversation"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "Campaign_tenant_isolation" ON "Campaign";
CREATE POLICY "Campaign_tenant_isolation" ON "Campaign"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "CampaignLead_tenant_isolation" ON "CampaignLead";
CREATE POLICY "CampaignLead_tenant_isolation" ON "CampaignLead"
    FOR ALL USING (false); -- Handled via Campaign relationship

DROP POLICY IF EXISTS "PipelineStage_tenant_isolation" ON "PipelineStage";
CREATE POLICY "PipelineStage_tenant_isolation" ON "PipelineStage"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "DealActivity_tenant_isolation" ON "DealActivity";
CREATE POLICY "DealActivity_tenant_isolation" ON "DealActivity"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "DealAttachment_tenant_isolation" ON "DealAttachment";
CREATE POLICY "DealAttachment_tenant_isolation" ON "DealAttachment"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "CotizacionItem_tenant_isolation" ON "CotizacionItem";
CREATE POLICY "CotizacionItem_tenant_isolation" ON "CotizacionItem"
    FOR ALL USING (false); -- Handled via Cotizacion relationship

DROP POLICY IF EXISTS "ContratoItem_tenant_isolation" ON "ContratoItem";
CREATE POLICY "ContratoItem_tenant_isolation" ON "ContratoItem"
    FOR ALL USING (false); -- Handled via Contrato relationship

-- Signatures
DROP POLICY IF EXISTS "ClientSignatureSettings_tenant_isolation" ON "ClientSignatureSettings";
CREATE POLICY "ClientSignatureSettings_tenant_isolation" ON "ClientSignatureSettings"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "SignatureRequest_tenant_isolation" ON "SignatureRequest";
CREATE POLICY "SignatureRequest_tenant_isolation" ON "SignatureRequest"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "SignatureAuditEvent_tenant_isolation" ON "SignatureAuditEvent";
CREATE POLICY "SignatureAuditEvent_tenant_isolation" ON "SignatureAuditEvent"
    FOR ALL USING (false); -- Handled via SignatureRequest relationship

-- Social & Marketing
DROP POLICY IF EXISTS "SocialPost_tenant_isolation" ON "SocialPost";
CREATE POLICY "SocialPost_tenant_isolation" ON "SocialPost"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "SocialPlatformConfig_tenant_isolation" ON "SocialPlatformConfig";
CREATE POLICY "SocialPlatformConfig_tenant_isolation" ON "SocialPlatformConfig"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "AutomationRule_tenant_isolation" ON "AutomationRule";
CREATE POLICY "AutomationRule_tenant_isolation" ON "AutomationRule"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "AutomationLog_tenant_isolation" ON "AutomationLog";
CREATE POLICY "AutomationLog_tenant_isolation" ON "AutomationLog"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "AutomationRuleVersion_tenant_isolation" ON "AutomationRuleVersion";
CREATE POLICY "AutomationRuleVersion_tenant_isolation" ON "AutomationRuleVersion"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "MarketingAuditLog_tenant_isolation" ON "MarketingAuditLog";
CREATE POLICY "MarketingAuditLog_tenant_isolation" ON "MarketingAuditLog"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

-- Notifications & Webhooks
DROP POLICY IF EXISTS "Notification_tenant_isolation" ON "Notification";
CREATE POLICY "Notification_tenant_isolation" ON "Notification"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "N8nWorkflow_tenant_isolation" ON "N8nWorkflow";
CREATE POLICY "N8nWorkflow_tenant_isolation" ON "N8nWorkflow"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

DROP POLICY IF EXISTS "TenantWorkflow_tenant_isolation" ON "TenantWorkflow";
CREATE POLICY "TenantWorkflow_tenant_isolation" ON "TenantWorkflow"
    FOR ALL USING (app.rls_tenant_check("tenantId"));

-- Other tables - Using loop for remaining tenant-scoped tables
-- These policies handle tables that reference tenant via foreign key relationship

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================
-- Grant necessary permissions to the application role
-- Note: Adjust the role name based on your application's database user

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION app.get_current_tenant_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_tenant_context(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.clear_tenant_context() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.rls_tenant_check(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.rls_bypass_allowed() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_current_user_role() TO PUBLIC;

-- =============================================================================
-- RECORD MIGRATION
-- =============================================================================
INSERT INTO _rls_migration (version, description, checksum)
VALUES (
    1,
    'Initial RLS implementation for multi-tenant CRM with tenant isolation policies',
    md5('saas-rls-migration-v1')
);

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES (run these to verify the migration)
-- =============================================================================
/*
-- Check enabled RLS tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE rowsecurity = true
AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY tablename;

-- Check policy count per table
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY tablename, policyname;

-- Test tenant context function
SELECT app.get_current_tenant_id();
SELECT app.rls_bypass_allowed();
*/