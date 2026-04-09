/**
 * Observability Layer - Logs estructurados, métricas y trazabilidad
 * 
 * Proporciona:
 * - Logger estructurado con niveles
 * - Métricas de ejecución
 * - Trazabilidad end-to-end
 * - Health checks
 */

import { SkillContext } from './context';
import { EventMetadata } from './event-metadata';

// ============================================================
// TIPOS
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  component: string;
  
  // Contexto
  tenantId?: string;
  userId?: string;
  correlationId?: string;
  requestId?: string;
  
  // Datos adicionales
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  
  // Métricas inline
  durationMs?: number;
  
  // Tags para filtrado
  tags?: string[];
}

export interface MetricPoint {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram';
  timestamp: Date;
  tags: Record<string, string>;
}

export interface SpanInfo {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
}

// ============================================================
// LOGGER ESTRUCTURADO
// ============================================================

class StructuredLogger {
  private service = 'volkern-crm';
  private component: string;
  private minLevel: LogLevel;
  
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };
  
  constructor(component: string, minLevel: LogLevel = 'info') {
    this.component = component;
    this.minLevel = minLevel;
  }
  
  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }
  
  private formatLog(
    level: LogLevel,
    message: string,
    context?: SkillContext | null,
    data?: Record<string, unknown>,
    error?: Error
  ): StructuredLog {
    const log: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      component: this.component,
    };
    
    if (context) {
      log.tenantId = context.tenantId;
      log.userId = context.userId;
      log.correlationId = context.correlationId;
      log.requestId = context.requestId;
    }
    
    if (data) {
      log.data = data;
    }
    
    if (error) {
      log.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    
    return log;
  }
  
  private output(log: StructuredLog): void {
    // En producción, esto iría a un servicio de logs
    // Por ahora, console con formato JSON
    const output = JSON.stringify(log);
    
    switch (log.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
      case 'fatal':
        console.error(output);
        break;
    }
  }
  
  debug(message: string, context?: SkillContext | null, data?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatLog('debug', message, context, data));
    }
  }
  
  info(message: string, context?: SkillContext | null, data?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.output(this.formatLog('info', message, context, data));
    }
  }
  
  warn(message: string, context?: SkillContext | null, data?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.output(this.formatLog('warn', message, context, data));
    }
  }
  
  error(message: string, error?: Error, context?: SkillContext | null, data?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      this.output(this.formatLog('error', message, context, data, error));
    }
  }
  
  fatal(message: string, error?: Error, context?: SkillContext | null, data?: Record<string, unknown>): void {
    if (this.shouldLog('fatal')) {
      this.output(this.formatLog('fatal', message, context, data, error));
    }
  }
  
  // Logger con contexto pre-establecido
  withContext(context: SkillContext): ContextualLogger {
    return new ContextualLogger(this, context);
  }
}

class ContextualLogger {
  constructor(
    private logger: StructuredLogger,
    private context: SkillContext
  ) {}
  
  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(message, this.context, data);
  }
  
  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, this.context, data);
  }
  
  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(message, this.context, data);
  }
  
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.logger.error(message, error, this.context, data);
  }
}

// ============================================================
// MÉTRICAS
// ============================================================

class MetricsCollector {
  private metrics: MetricPoint[] = [];
  private maxSize = 10000;
  
  private add(point: MetricPoint): void {
    this.metrics.push(point);
    if (this.metrics.length > this.maxSize) {
      this.metrics.shift();
    }
  }
  
  counter(name: string, value: number = 1, tags: Record<string, string> = {}): void {
    this.add({
      name,
      value,
      type: 'counter',
      timestamp: new Date(),
      tags,
    });
  }
  
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    this.add({
      name,
      value,
      type: 'gauge',
      timestamp: new Date(),
      tags,
    });
  }
  
  histogram(name: string, value: number, tags: Record<string, string> = {}): void {
    this.add({
      name,
      value,
      type: 'histogram',
      timestamp: new Date(),
      tags,
    });
  }
  
  // Timer helper
  startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }
  
  // Obtener métricas (para dashboard)
  getMetrics(filter?: { name?: string; since?: Date }): MetricPoint[] {
    let result = this.metrics;
    
    if (filter?.name) {
      result = result.filter(m => m.name === filter.name);
    }
    if (filter?.since) {
      result = result.filter(m => m.timestamp >= filter.since!);
    }
    
    return result;
  }
  
  // Agregaciones
  getAggregated(name: string, windowMinutes: number = 5): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
  } {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const points = this.metrics.filter(
      m => m.name === name && m.timestamp >= since
    );
    
    if (points.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
    }
    
    const values = points.map(p => p.value);
    return {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
  
  // Limpiar
  clear(): void {
    this.metrics = [];
  }
}

// ============================================================
// TRAZABILIDAD (Spans)
// ============================================================

class SpanTracker {
  private spans: Map<string, SpanInfo> = new Map();
  private maxSpans = 1000;
  
  startSpan(
    operationName: string,
    parentSpanId?: string,
    attributes: Record<string, unknown> = {}
  ): string {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.spans.set(spanId, {
      spanId,
      parentSpanId,
      operationName,
      startTime: new Date(),
      status: 'ok',
      attributes,
    });
    
    // Limpiar spans antiguos
    if (this.spans.size > this.maxSpans) {
      const oldest = Array.from(this.spans.keys())[0];
      this.spans.delete(oldest);
    }
    
    return spanId;
  }
  
  endSpan(spanId: string, status: 'ok' | 'error' = 'ok'): SpanInfo | null {
    const span = this.spans.get(spanId);
    if (span) {
      span.endTime = new Date();
      span.status = status;
      return span;
    }
    return null;
  }
  
  getSpan(spanId: string): SpanInfo | undefined {
    return this.spans.get(spanId);
  }
  
  // Obtener trace completo por correlationId
  getTrace(correlationId: string): SpanInfo[] {
    return Array.from(this.spans.values()).filter(
      s => s.attributes.correlationId === correlationId
    );
  }
}

// ============================================================
// HEALTH CHECKS
// ============================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: Record<string, {
    status: 'pass' | 'fail' | 'warn';
    latencyMs?: number;
    message?: string;
  }>;
  metrics: {
    uptime: number;
    memoryUsage: number;
    eventBusQueueSize?: number;
    activeSkillExecutions?: number;
  };
}

const startTime = Date.now();

export async function getHealthStatus(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {};
  
  // Check database
  const dbStart = Date.now();
  try {
    const { default: prisma } = await import('@/lib/db');
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: 'pass',
      latencyMs: Date.now() - dbStart,
    };
  } catch (e) {
    checks.database = {
      status: 'fail',
      latencyMs: Date.now() - dbStart,
      message: String(e),
    };
  }
  
  // Check EventBus
  try {
    const { eventBus } = await import('./event-bus');
    const history = eventBus.getEventHistory(1);
    checks.eventBus = {
      status: 'pass',
      message: `Last event: ${history[0]?.event || 'none'}`,
    };
  } catch (e) {
    checks.eventBus = {
      status: 'fail',
      message: String(e),
    };
  }
  
  // Determinar status general
  const failedChecks = Object.values(checks).filter(c => c.status === 'fail').length;
  const warnChecks = Object.values(checks).filter(c => c.status === 'warn').length;
  
  let status: HealthStatus['status'] = 'healthy';
  if (failedChecks > 0) {
    status = 'unhealthy';
  } else if (warnChecks > 0) {
    status = 'degraded';
  }
  
  return {
    status,
    timestamp: new Date(),
    checks,
    metrics: {
      uptime: Date.now() - startTime,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
    },
  };
}

// ============================================================
// EXPORTS
// ============================================================

// Loggers por componente
export const skillsLogger = new StructuredLogger('skills', process.env.LOG_LEVEL as LogLevel || 'info');
export const automationLogger = new StructuredLogger('automation', process.env.LOG_LEVEL as LogLevel || 'info');
export const eventBusLogger = new StructuredLogger('event-bus', process.env.LOG_LEVEL as LogLevel || 'info');
export const mcpLogger = new StructuredLogger('mcp', process.env.LOG_LEVEL as LogLevel || 'info');
export const webhookLogger = new StructuredLogger('webhook', process.env.LOG_LEVEL as LogLevel || 'info');

// Métricas globales
export const metrics = new MetricsCollector();

// Spans globales
export const spans = new SpanTracker();

// Factory para crear loggers personalizados
export function createLogger(component: string, minLevel?: LogLevel): StructuredLogger {
  return new StructuredLogger(component, minLevel);
}

// Skill execution tracking
export function trackSkillExecution(
  skillName: string,
  tenantId: string,
  success: boolean,
  durationMs: number
): void {
  metrics.counter('skill_execution_total', 1, {
    skill: skillName,
    tenant: tenantId,
    status: success ? 'success' : 'error',
  });
  
  metrics.histogram('skill_execution_duration_ms', durationMs, {
    skill: skillName,
    tenant: tenantId,
  });
}

// Automation tracking
export function trackAutomationExecution(
  automationId: string,
  trigger: string,
  success: boolean,
  durationMs: number
): void {
  metrics.counter('automation_execution_total', 1, {
    automation: automationId,
    trigger,
    status: success ? 'success' : 'error',
  });
  
  metrics.histogram('automation_execution_duration_ms', durationMs, {
    automation: automationId,
    trigger,
  });
}

// Event tracking
export function trackEvent(eventType: string, tenantId: string): void {
  metrics.counter('event_emitted_total', 1, {
    type: eventType,
    tenant: tenantId,
  });
}
