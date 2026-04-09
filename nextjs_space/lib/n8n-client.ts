/**
 * Cliente API para n8n
 * Maneja todas las comunicaciones con el motor de automatización n8n
 * n8n funciona como motor oculto - el usuario nunca interactúa directamente con él
 */

import * as crypto from 'crypto'

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678'
const N8N_API_KEY = process.env.N8N_API_KEY || ''
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || ''

export interface N8nWorkflowData {
  id?: string
  name: string
  nodes: any[]
  connections: any
  settings?: any
  staticData?: any
  active?: boolean
}

export interface N8nExecutionResult {
  id: string
  finished: boolean
  mode: string
  startedAt: string
  stoppedAt?: string
  workflowId: string
  data?: any
  status?: 'success' | 'error' | 'waiting'
}

export interface N8nWebhookPayload {
  tenantId: string
  event: string
  data: any
  automationId?: string
  executionId?: string
  timestamp: string
}

class N8nClient {
  private baseUrl: string
  private apiKey: string
  private webhookSecret: string

  constructor() {
    this.baseUrl = N8N_URL
    this.apiKey = N8N_API_KEY
    this.webhookSecret = N8N_WEBHOOK_SECRET
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': this.apiKey,
    }
  }

  /**
   * Verifica la conexión con n8n
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        method: 'GET',
        headers: this.getHeaders(),
      })
      return response.ok
    } catch (error) {
      console.error('[n8n] Health check failed:', error)
      return false
    }
  }

  /**
   * Lista todos los workflows en n8n
   */
  async listWorkflows(): Promise<N8nWorkflowData[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        throw new Error(`Failed to list workflows: ${response.statusText}`)
      }

      const data = await response.json()
      return data.data || []
    } catch (error) {
      console.error('[n8n] Error listing workflows:', error)
      throw error
    }
  }

  /**
   * Obtiene un workflow específico
   */
  async getWorkflow(workflowId: string): Promise<N8nWorkflowData | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Failed to get workflow: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[n8n] Error getting workflow:', error)
      throw error
    }
  }

  /**
   * Crea un nuevo workflow en n8n
   */
  async createWorkflow(workflow: N8nWorkflowData): Promise<N8nWorkflowData> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(workflow),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create workflow: ${errorData.message || response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[n8n] Error creating workflow:', error)
      throw error
    }
  }

  /**
   * Actualiza un workflow existente
   */
  async updateWorkflow(workflowId: string, workflow: Partial<N8nWorkflowData>): Promise<N8nWorkflowData> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(workflow),
      })

      if (!response.ok) {
        throw new Error(`Failed to update workflow: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[n8n] Error updating workflow:', error)
      throw error
    }
  }

  /**
   * Elimina un workflow
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      })

      return response.ok
    } catch (error) {
      console.error('[n8n] Error deleting workflow:', error)
      throw error
    }
  }

  /**
   * Duplica un workflow para un tenant específico
   * Usado para crear instancias multi-tenant de templates
   * El nuevo workflow tendrá el nombre: volkern_{tenantId}_{templateName}
   */
  async duplicateWorkflowForTenant(
    sourceWorkflowId: string,
    tenantId: string,
    templateName: string
  ): Promise<N8nWorkflowData> {
    try {
      // 1. Obtener el workflow base (template)
      const sourceWorkflow = await this.getWorkflow(sourceWorkflowId)
      if (!sourceWorkflow) {
        throw new Error(`Template workflow not found: ${sourceWorkflowId}`)
      }

      // 2. Crear nombre único para el tenant
      const newName = `volkern_${tenantId}_${templateName}`

      // 3. Crear nuevo workflow con los mismos nodes y connections
      const newWorkflow: N8nWorkflowData = {
        name: newName,
        nodes: sourceWorkflow.nodes,
        connections: sourceWorkflow.connections,
        settings: sourceWorkflow.settings,
        staticData: sourceWorkflow.staticData,
        active: false, // Inactivo hasta que se configure
      }

      // 4. Crear el workflow duplicado en n8n
      const created = await this.createWorkflow(newWorkflow)
      
      console.log(`[n8n] Duplicated workflow ${sourceWorkflowId} as ${newName} (ID: ${created.id})`)
      
      return created
    } catch (error) {
      console.error('[n8n] Error duplicating workflow:', error)
      throw error
    }
  }

  /**
   * Activa un workflow
   */
  async activateWorkflow(workflowId: string): Promise<N8nWorkflowData> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}/activate`, {
        method: 'POST',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        throw new Error(`Failed to activate workflow: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[n8n] Error activating workflow:', error)
      throw error
    }
  }

  /**
   * Desactiva un workflow
   */
  async deactivateWorkflow(workflowId: string): Promise<N8nWorkflowData> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}/deactivate`, {
        method: 'POST',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        throw new Error(`Failed to deactivate workflow: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[n8n] Error deactivating workflow:', error)
      throw error
    }
  }

  /**
   * Ejecuta un workflow via webhook
   * Esta es la forma principal de ejecutar workflows desde Volkern
   */
  async executeViaWebhook(
    webhookUrl: string,
    payload: N8nWebhookPayload,
    timeout: number = 30000
  ): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const signature = this.generateWebhookSignature(JSON.stringify(payload))

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Volkern-Signature': signature,
          'X-Volkern-Timestamp': new Date().toISOString(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Webhook execution failed: ${response.status} - ${errorText}`)
      }

      // n8n puede devolver respuesta o no dependiendo de la configuración del workflow
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        return await response.json()
      }
      return { success: true, status: response.status }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error(`Webhook execution timeout after ${timeout}ms`)
      }
      throw error
    }
  }

  /**
   * Ejecuta un workflow directamente via API (para workflows no-webhook)
   */
  async executeWorkflow(workflowId: string, data?: any): Promise<N8nExecutionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ data }),
      })

      if (!response.ok) {
        throw new Error(`Failed to execute workflow: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[n8n] Error executing workflow:', error)
      throw error
    }
  }

  /**
   * Obtiene el estado de una ejecución
   */
  async getExecution(executionId: string): Promise<N8nExecutionResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/executions/${executionId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Failed to get execution: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[n8n] Error getting execution:', error)
      throw error
    }
  }

  /**
   * Lista ejecuciones de un workflow
   */
  async listExecutions(workflowId?: string, limit: number = 20): Promise<N8nExecutionResult[]> {
    try {
      const params = new URLSearchParams()
      if (workflowId) params.append('workflowId', workflowId)
      params.append('limit', limit.toString())

      const response = await fetch(`${this.baseUrl}/api/v1/executions?${params}`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        throw new Error(`Failed to list executions: ${response.statusText}`)
      }

      const data = await response.json()
      return data.data || []
    } catch (error) {
      console.error('[n8n] Error listing executions:', error)
      throw error
    }
  }

  /**
   * Genera firma HMAC para webhooks
   */
  generateWebhookSignature(payload: string): string {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex')
  }

  /**
   * Verifica firma de webhook entrante desde n8n
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = this.generateWebhookSignature(payload)
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  }

  /**
   * Genera URL de webhook para un workflow
   */
  getWebhookUrl(workflowId: string, webhookPath: string = 'webhook'): string {
    return `${this.baseUrl}/webhook/${webhookPath}/${workflowId}`
  }
}

// Singleton instance
export const n8nClient = new N8nClient()
export default n8nClient
