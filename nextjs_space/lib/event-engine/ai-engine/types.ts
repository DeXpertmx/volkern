export type AIModel = 'gemma' | 'gpt4' | 'gpt4o' | 'claude' | 'gemini'

export interface AIRequest {
  prompt: string
  model?: AIModel
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

export interface AIResponse {
  content: string
  model: AIModel
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  finish_reason?: string
  error?: string
}

export interface AIFallback {
  from: AIModel
  to: AIModel
  reason: string
}

const MODEL_CONFIGS: Record<AIModel, {
  provider: 'abacus' | 'openai' | 'anthropic' | 'google'
  max_tokens: number
  supports_streaming: boolean
  cost_per_1k_input: number
  cost_per_1k_output: number
}> = {
  gemma: {
    provider: 'abacus',
    max_tokens: 4096,
    supports_streaming: false,
    cost_per_1k_input: 0,
    cost_per_1k_output: 0
  },
  gpt4: {
    provider: 'openai',
    max_tokens: 8192,
    supports_streaming: true,
    cost_per_1k_input: 0.03,
    cost_per_1k_output: 0.06
  },
  gpt4o: {
    provider: 'openai',
    max_tokens: 16384,
    supports_streaming: true,
    cost_per_1k_input: 0.005,
    cost_per_1k_output: 0.015
  },
  claude: {
    provider: 'anthropic',
    max_tokens: 4096,
    supports_streaming: true,
    cost_per_1k_input: 0.015,
    cost_per_1k_output: 0.075
  },
  gemini: {
    provider: 'google',
    max_tokens: 8192,
    supports_streaming: true,
    cost_per_1k_input: 0,
    cost_per_1k_output: 0
  }
}

export const AI_FALLBACKS: Record<AIModel, AIModel[]> = {
  gemma: ['gpt4o', 'gpt4'],
  gpt4: ['gpt4o', 'claude'],
  gpt4o: ['gemini', 'claude'],
  claude: ['gpt4o', 'gemini'],
  gemini: ['gpt4o', 'claude']
}

export const DEFAULT_MODEL: AIModel = 'gemma'

export function getModelConfig(model: AIModel) {
  return MODEL_CONFIGS[model]
}

export function isModelAvailable(model: AIModel, enabledModels: AIModel[]): boolean {
  return enabledModels.includes(model)
}

export function getFallbackChain(current: AIModel, enabled: AIModel[]): AIModel[] {
  const chain: AIModel[] = [current]
  
  for (const fallback of AI_FALLBACKS[current]) {
    if (enabled.includes(fallback)) {
      chain.push(fallback)
    }
  }
  
  return chain
}