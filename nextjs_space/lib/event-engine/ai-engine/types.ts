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

export interface ModelConfig {
  provider: 'abacus' | 'openai' | 'anthropic' | 'google'
  model: string
  maxTokens: number
  temperature: number
}

export interface AIModelConfig {
  provider: 'abacus' | 'openai' | 'anthropic' | 'google'
  model: string
  maxTokens: number
  temperature: number
}

export const MODEL_CONFIGS: Record<AIModel, AIModelConfig> = {
  gemma: {
    provider: 'abacus',
    model: 'gemma',
    maxTokens: 4096,
    temperature: 0.7
  },
  gpt4: {
    provider: 'openai',
    model: 'gpt-4',
    maxTokens: 8192,
    temperature: 0.7
  },
  gpt4o: {
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: 16384,
    temperature: 0.7
  },
  claude: {
    provider: 'anthropic',
    model: 'claude-3-opus',
    maxTokens: 4096,
    temperature: 0.7
  },
  gemini: {
    provider: 'google',
    model: 'gemini-3.5-flash-lite',
    maxTokens: 8192,
    temperature: 0.7
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