export interface VolkernEvent {
  event: string
  tenant_id: string
  data: Record<string, unknown>
  timestamp?: string
  correlation_id?: string
}

export interface TriggerCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'contains' | 'exists'
  value: unknown
}

export interface PackAction {
  type: string
  config?: Record<string, unknown>
  only_if?: TriggerCondition
}

export interface PackTrigger {
  trigger: string
  conditions?: TriggerCondition[]
  actions: PackAction[]
}

export interface PackPipelineStage {
  id: string
  name: string
  order: number
}

export interface VolkernPack {
  pack: string
  version: string
  pipeline: PackPipelineStage[]
  triggers: PackTrigger[]
  metadata?: Record<string, unknown>
}

export interface ActionResult {
  success: boolean
  data?: unknown
  error?: string
  execution_time_ms?: number
}

export interface ActionContext {
  tenant_id: string
  event: VolkernEvent
  data: Record<string, unknown>
}