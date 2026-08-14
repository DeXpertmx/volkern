import { AIModel, AIRequest, AIResponse, AI_FALLBACKS, DEFAULT_MODEL, getModelConfig } from './types'
import { callGemma } from '../../ai/gemma-client'
import { prisma } from '../../db'
import { VolkernEvent } from '../types'
import { AIQueue } from './queue'

const RATE_LIMITS: Map<string, { count: number; resetAt: Date }> = new Map()

const MODEL_ENABLED: Map<string, AIModel[]> = new Map()

export class AIEngine {
  static async chat(request: AIRequest, tenantId: string, useQueue = false): Promise<AIResponse> {
    if (useQueue) {
      return new Promise((resolve) => {
        const event: VolkernEvent = {
          event: 'ai_queue',
          tenant_id: tenantId,
          data: { prompt: request.prompt, model: request.model }
        }
        AIQueue.enqueue(event).then(result => resolve(result as unknown as AIResponse))
      })
    }

    const { prompt, model, temperature = 0.3, max_tokens = 2048 } = request
    const selectedModel = model || DEFAULT_MODEL

    const enabled = this.getEnabledModels(tenantId)

    if (!enabled.includes(selectedModel)) {
      return this.tryFallback(DEFAULT_MODEL, prompt, tenantId)
    }

    const rateCheck = this.checkRateLimit(tenantId, selectedModel)
    if (!rateCheck.allowed) {
      console.log(`[AIEngine] Rate limit reached for ${selectedModel}, trying fallback`)
      return this.tryFallback(selectedModel, prompt, tenantId)
    }

    try {
      this.incrementRateLimit(tenantId, selectedModel)

      const result = await this.callModel(selectedModel, prompt, {
        temperature,
        max_tokens
      })

      return {
        ...result,
        model: selectedModel
      }
    } catch (error) {
      console.error(`[AIEngine] Error with ${selectedModel}:`, error)
      return this.tryFallback(selectedModel, prompt, tenantId)
    }
  }

  private static async callModel(
    model: AIModel,
    prompt: string,
    options: { temperature: number; max_tokens: number }
  ): Promise<AIResponse> {
    switch (model) {
      case 'gemma':
        return this.callGemma(prompt, options)

      case 'gpt4':
      case 'gpt4o':
        return this.callOpenAI(model, prompt, options)

      case 'claude':
        return this.callAnthropic(prompt, options)

      case 'gemini':
        return this.callGemini(prompt, options)

      default:
        return this.callGemma(prompt, options)
    }
  }

  private static async callGemma(prompt: string, options: { temperature: number; max_tokens: number }): Promise<AIResponse> {
    const result = await callGemma([
      { role: 'user', content: prompt }
    ])

    if (result.error) {
      throw new Error(result.error)
    }

    return {
      content: result.content,
      model: 'gemma',
      usage: {
        prompt_tokens: (result as any).usage?.prompt_tokens || 0,
        completion_tokens: (result as any).usage?.completion_tokens || 0,
        total_tokens: (result as any).usage?.total_tokens || 0
      }
    }
  }

  private static async callOpenAI(model: 'gpt4' | 'gpt4o', prompt: string, options: { temperature: number; max_tokens: number }): Promise<AIResponse> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI not configured')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model === 'gpt4' ? 'gpt-4' : 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature,
        max_tokens: options.max_tokens
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`)
    }

    const data = await response.json()
    return {
      content: data.choices?.[0]?.message?.content || '',
      model,
      usage: data.usage
    }
  }

  private static async callAnthropic(prompt: string, options: { temperature: number; max_tokens: number }): Promise<AIResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('Anthropic not configured')
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature,
        max_tokens: options.max_tokens
      })
    })

    if (!response.ok) {
      throw new Error(`Anthropic error: ${response.status}`)
    }

    const data = await response.json()
    return {
      content: data.content?.[0]?.text || '',
      model: 'claude',
      usage: data.usage
    }
  }

  private static async callGemini(prompt: string, options: { temperature: number; max_tokens: number }): Promise<AIResponse> {
    const apiKey = process.env.GOOGLE_AI_KEY
    if (!apiKey) {
      throw new Error('Gemini not configured')
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.max_tokens
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Gemini error: ${response.status}`)
    }

    const data = await response.json()
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      model: 'gemini'
    }
  }

  private static async tryFallback(fromModel: AIModel, prompt: string, tenantId: string): Promise<AIResponse> {
    const fallbacks = AI_FALLBACKS[fromModel] || ['gpt4o']
    const enabled = this.getEnabledModels(tenantId)

    for (const fallback of fallbacks) {
      if (!enabled.includes(fallback)) continue

      const rateCheck = this.checkRateLimit(tenantId, fallback)
      if (!rateCheck.allowed) continue

      try {
        this.incrementRateLimit(tenantId, fallback)
        console.log(`[AIEngine] Falling back from ${fromModel} to ${fallback}`)
        
        return await this.callModel(fallback, prompt, { temperature: 0.3, max_tokens: 2048 })
      } catch (error) {
        console.error(`[AIEngine] Fallback ${fallback} failed:`, error)
      }
    }

    return {
      content: 'Lo sentimos, en este momento no hay modelos de IA disponibles. Por favor intenta más tarde.',
      model: fromModel,
      error: 'All models failed'
    }
  }

  private static checkRateLimit(tenantId: string, model: AIModel): { allowed: boolean; remaining: number } {
    const key = `${tenantId}_${model}`
    const limit = RATE_LIMITS.get(key)

    const dailyLimit = model === 'gemma' ? 1000 : model === 'gpt4o' ? 100 : model === 'claude' ? 100 : 50
    const now = new Date()

    if (!limit || now.getDate() !== limit.resetAt.getDate()) {
      return { allowed: true, remaining: dailyLimit }
    }

    if (limit.count >= dailyLimit) {
      return { allowed: false, remaining: 0 }
    }

    return { allowed: true, remaining: dailyLimit - limit.count }
  }

  private static incrementRateLimit(tenantId: string, model: AIModel): void {
    const key = `${tenantId}_${model}`
    const existing = RATE_LIMITS.get(key)
    const now = new Date()

    if (!existing || now.getDate() !== existing.resetAt.getDate()) {
      RATE_LIMITS.set(key, { count: 1, resetAt: now })
    } else {
      existing.count++
      RATE_LIMITS.set(key, existing)
    }
  }

  static getEnabledModels(tenantId: string): AIModel[] {
    if (MODEL_ENABLED.has(tenantId)) {
      return MODEL_ENABLED.get(tenantId)!
    }

    return ['gemma', 'gpt4o']
  }

  static setEnabledModels(tenantId: string, models: AIModel[]): void {
    MODEL_ENABLED.set(tenantId, models)
  }

  static async getUsage(tenantId: string): Promise<{[key: string]: { daily: number; limit: number }}> {
    const enabled = this.getEnabledModels(tenantId)
    const usage: {[key: string]: { daily: number; limit: number }} = {}

    for (const model of enabled) {
      const key = `${tenantId}_${model}`
      const limit = RATE_LIMITS.get(key) || { count: 0, resetAt: new Date() }
      const now = new Date()

      const dailyLimit = model === 'gemma' ? 1000 : model === 'gpt4o' ? 100 : model === 'claude' ? 100 : 50

      usage[model] = {
        daily: now.getDate() === limit.resetAt.getDate() ? limit.count : 0,
        limit: dailyLimit
      }
    }

    return usage as {[key: string]: { daily: number; limit: number }}
  }
}