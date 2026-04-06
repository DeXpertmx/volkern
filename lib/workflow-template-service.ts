/**
 * Workflow Template Service
 * Gestiona los templates de automatización y la provisión multi-tenant
 * 
 * Arquitectura:
 * - WorkflowTemplate: Catálogo central de automatizaciones disponibles
 * - TenantWorkflow: Instancia específica de un template para cada cliente
 * - El usuario NUNCA ve n8n directamente, solo selecciona templates
 */

import { prisma } from './db'
import { n8nClient, N8nWorkflowData } from './n8n-client'

export interface TemplateInfo {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  icon: string | null
  color: string | null
  isPremium: boolean
  isActive: boolean
}

export interface TenantWorkflowInfo {
  id: string
  templateId: string
  templateName: string
  displayName: string
  n8nWorkflowId: string
  webhookUrl: string | null
  isActive: boolean
  lastExecutedAt: Date | null
  totalExecutions: number
}

export interface ProvisionResult {
  success: boolean
  tenantWorkflowId?: string
  n8nWorkflowId?: string
  error?: string
}

export interface ExecutionResult {
  success: boolean
  executionId?: string
  response?: any
  error?: string
  duration?: number
}

class WorkflowTemplateService {
  /**
   * Lista todos los templates disponibles
   * Estos se muestran al usuario como "Automatizaciones disponibles"
   */
  async listTemplates(category?: string): Promise<TemplateInfo[]> {
    const templates = await prisma.workflowTemplate.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
      },
      orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
    })

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      category: t.category,
      icon: t.icon,
      color: t.color,
      isPremium: t.isPremium,
      isActive: t.isActive,
    }))
  }

  /**
   * Obtiene un template específico
   */
  async getTemplate(templateId: string): Promise<TemplateInfo | null> {
    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    })

    if (!template) return null

    return {
      id: template.id,
      name: template.name,
      displayName: template.displayName,
      description: template.description,
      category: template.category,
      icon: template.icon,
      color: template.color,
      isPremium: template.isPremium,
      isActive: template.isActive,
    }
  }

  /**
   * Lista los workflows provisionados para un tenant
   */
  async listTenantWorkflows(tenantId: string): Promise<TenantWorkflowInfo[]> {
    const workflows = await prisma.tenantWorkflow.findMany({
      where: { tenantId, isActive: true },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    })

    return workflows.map((w) => ({
      id: w.id,
      templateId: w.templateId,
      templateName: w.template.name,
      displayName: w.template.displayName,
      n8nWorkflowId: w.n8nWorkflowId,
      webhookUrl: w.webhookUrl,
      isActive: w.isActive,
      lastExecutedAt: w.lastExecutedAt,
      totalExecutions: w.totalExecutions,
    }))
  }

  /**
   * Obtiene o provisiona un workflow para un tenant
   * Si el tenant ya tiene el workflow, lo devuelve
   * Si no, lo crea duplicando el template en n8n
   */
  async getOrProvisionWorkflow(
    tenantId: string,
    templateId: string
  ): Promise<ProvisionResult> {
    try {
      // 1. Verificar si el tenant ya tiene este workflow
      const existing = await prisma.tenantWorkflow.findUnique({
        where: {
          tenantId_templateId: { tenantId, templateId },
        },
      })

      if (existing) {
        return {
          success: true,
          tenantWorkflowId: existing.id,
          n8nWorkflowId: existing.n8nWorkflowId,
        }
      }

      // 2. Obtener el template
      const template = await prisma.workflowTemplate.findUnique({
        where: { id: templateId },
      })

      if (!template) {
        return { success: false, error: 'Template no encontrado' }
      }

      if (!template.isActive) {
        return { success: false, error: 'Template no disponible' }
      }

      // 3. Duplicar el workflow en n8n
      const duplicated = await n8nClient.duplicateWorkflowForTenant(
        template.n8nTemplateId,
        tenantId,
        template.name
      )

      if (!duplicated.id) {
        return { success: false, error: 'Error al crear workflow en n8n' }
      }

      // 4. Crear registro en TenantWorkflow
      const tenantWorkflow = await prisma.tenantWorkflow.create({
        data: {
          tenantId,
          templateId,
          n8nWorkflowId: duplicated.id,
          webhookUrl: this.buildWebhookUrl(duplicated.id),
          customConfig: template.defaultPayload || undefined,
        },
      })

      console.log(
        `[WorkflowTemplateService] Provisioned ${template.name} for tenant ${tenantId} -> n8n ID: ${duplicated.id}`
      )

      return {
        success: true,
        tenantWorkflowId: tenantWorkflow.id,
        n8nWorkflowId: duplicated.id,
      }
    } catch (error: any) {
      console.error('[WorkflowTemplateService] Error provisioning workflow:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Ejecuta un workflow para un tenant
   * Primero provisiona si es necesario, luego ejecuta
   */
  async executeWorkflow(
    tenantId: string,
    templateId: string,
    payload: Record<string, any>,
    options: {
      timeout?: number
      automationId?: string
      executionId?: string
    } = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now()

    try {
      // 1. Obtener o provisionar el workflow
      const provision = await this.getOrProvisionWorkflow(tenantId, templateId)
      if (!provision.success || !provision.n8nWorkflowId) {
        return { success: false, error: provision.error || 'Error provisionando workflow' }
      }

      // 2. Obtener el tenant workflow para estadísticas
      const tenantWorkflow = await prisma.tenantWorkflow.findUnique({
        where: {
          tenantId_templateId: { tenantId, templateId },
        },
        include: { template: true },
      })

      if (!tenantWorkflow) {
        return { success: false, error: 'Workflow no encontrado' }
      }

      // 3. Preparar payload estándar de Volkern
      const volkernPayload = {
        source: 'volkern',
        tenantId,
        automationId: options.automationId,
        executionId: options.executionId,
        timestamp: new Date().toISOString(),
        context: payload,
        metadata: {
          templateName: tenantWorkflow.template.name,
          workflowId: tenantWorkflow.n8nWorkflowId,
        },
      }

      // 4. Ejecutar via webhook si está disponible, sino via API
      let response: any
      if (tenantWorkflow.webhookUrl) {
        response = await n8nClient.executeViaWebhook(
          tenantWorkflow.webhookUrl,
          {
            tenantId,
            event: tenantWorkflow.template.name,
            data: volkernPayload,
            automationId: options.automationId,
            executionId: options.executionId,
            timestamp: volkernPayload.timestamp,
          },
          options.timeout || 30000
        )
      } else {
        response = await n8nClient.executeWorkflow(
          provision.n8nWorkflowId,
          volkernPayload
        )
      }

      const duration = Date.now() - startTime

      // 5. Actualizar estadísticas
      await prisma.tenantWorkflow.update({
        where: { id: tenantWorkflow.id },
        data: {
          lastExecutedAt: new Date(),
          totalExecutions: { increment: 1 },
          successfulExecutions: { increment: 1 },
        },
      })

      return {
        success: true,
        executionId: response?.id || response?.executionId,
        response,
        duration,
      }
    } catch (error: any) {
      const duration = Date.now() - startTime
      console.error('[WorkflowTemplateService] Error executing workflow:', error)

      // Actualizar estadísticas de fallo
      try {
        const tenantWorkflow = await prisma.tenantWorkflow.findUnique({
          where: {
            tenantId_templateId: { tenantId, templateId },
          },
        })
        if (tenantWorkflow) {
          await prisma.tenantWorkflow.update({
            where: { id: tenantWorkflow.id },
            data: {
              lastExecutedAt: new Date(),
              totalExecutions: { increment: 1 },
              failedExecutions: { increment: 1 },
            },
          })
        }
      } catch (e) {
        // Ignorar errores de logging
      }

      return {
        success: false,
        error: error.message,
        duration,
      }
    }
  }

  /**
   * Obtiene el workflow de un tenant por templateId
   */
  async getTenantWorkflowByTemplate(
    tenantId: string,
    templateId: string
  ): Promise<TenantWorkflowInfo | null> {
    const workflow = await prisma.tenantWorkflow.findUnique({
      where: {
        tenantId_templateId: { tenantId, templateId },
      },
      include: { template: true },
    })

    if (!workflow) return null

    return {
      id: workflow.id,
      templateId: workflow.templateId,
      templateName: workflow.template.name,
      displayName: workflow.template.displayName,
      n8nWorkflowId: workflow.n8nWorkflowId,
      webhookUrl: workflow.webhookUrl,
      isActive: workflow.isActive,
      lastExecutedAt: workflow.lastExecutedAt,
      totalExecutions: workflow.totalExecutions,
    }
  }

  /**
   * Desactiva un workflow de un tenant
   */
  async deactivateTenantWorkflow(
    tenantId: string,
    templateId: string
  ): Promise<boolean> {
    try {
      const workflow = await prisma.tenantWorkflow.findUnique({
        where: {
          tenantId_templateId: { tenantId, templateId },
        },
      })

      if (!workflow) return false

      // Desactivar en n8n
      try {
        await n8nClient.deactivateWorkflow(workflow.n8nWorkflowId)
      } catch (e) {
        console.warn('[WorkflowTemplateService] Could not deactivate in n8n:', e)
      }

      // Desactivar en DB
      await prisma.tenantWorkflow.update({
        where: { id: workflow.id },
        data: { isActive: false },
      })

      return true
    } catch (error) {
      console.error('[WorkflowTemplateService] Error deactivating workflow:', error)
      return false
    }
  }

  /**
   * Construye la URL del webhook para un workflow
   */
  private buildWebhookUrl(workflowId: string): string {
    const n8nUrl = process.env.N8N_URL || 'http://localhost:5678'
    return `${n8nUrl}/webhook/${workflowId}`
  }

  /**
   * Lista las categorías disponibles
   */
  async listCategories(): Promise<string[]> {
    const templates = await prisma.workflowTemplate.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
    })

    return templates.map((t) => t.category)
  }
}

export const workflowTemplateService = new WorkflowTemplateService()
export default workflowTemplateService
