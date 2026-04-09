/**
 * Volkern Event Bus
 * Sistema de eventos centralizado
 * 
 * Arquitectura:
 * Skill ejecutado → EventBus → Listeners (Automations, Webhooks, Agents, n8n)
 * 
 * Uso:
 * eventBus.emit(EVENTS.CONTACT_CREATED, payload);
 * eventBus.on(EVENTS.CONTACT_CREATED, handler);
 */

import { EventEmitter } from 'events';
import { EVENTS, EventType, EventPayloadMap, BaseEventPayload } from '@/lib/types/events';

class VolkernEventBus extends EventEmitter {
  private static instance: VolkernEventBus;
  private eventHistory: Array<{ event: EventType; payload: BaseEventPayload; timestamp: Date }> = [];
  private maxHistorySize = 1000;

  private constructor() {
    super();
    // Aumentar límite de listeners para producción
    this.setMaxListeners(100);
  }

  static getInstance(): VolkernEventBus {
    if (!VolkernEventBus.instance) {
      VolkernEventBus.instance = new VolkernEventBus();
    }
    return VolkernEventBus.instance;
  }

  /**
   * Emite un evento tipado
   */
  emitEvent<E extends EventType>(
    event: E,
    payload: E extends keyof EventPayloadMap ? EventPayloadMap[E] : BaseEventPayload
  ): boolean {
    // Agregar timestamp si no existe
    const enrichedPayload = {
      ...payload,
      timestamp: payload.timestamp || new Date(),
    };

    // Guardar en historial
    this.addToHistory(event, enrichedPayload);

    // Log para debugging
    console.log(`[EventBus] Emitting: ${event}`, {
      tenantId: enrichedPayload.tenantId,
      source: enrichedPayload.source,
    });

    // Emitir evento
    return this.emit(event, enrichedPayload);
  }

  /**
   * Suscribirse a un evento tipado
   */
  onEvent<E extends EventType>(
    event: E,
    handler: (payload: E extends keyof EventPayloadMap ? EventPayloadMap[E] : BaseEventPayload) => void | Promise<void>
  ): this {
    return this.on(event, handler);
  }

  /**
   * Suscripción única a un evento
   */
  onceEvent<E extends EventType>(
    event: E,
    handler: (payload: E extends keyof EventPayloadMap ? EventPayloadMap[E] : BaseEventPayload) => void | Promise<void>
  ): this {
    return this.once(event, handler);
  }

  /**
   * Agregar evento al historial (para debugging/audit)
   */
  private addToHistory(event: EventType, payload: BaseEventPayload): void {
    this.eventHistory.push({
      event,
      payload,
      timestamp: new Date(),
    });

    // Mantener tamaño máximo del historial
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Obtener historial de eventos (para debugging)
   */
  getEventHistory(limit = 50): typeof this.eventHistory {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Obtener eventos de un tenant específico
   */
  getEventsByTenant(tenantId: string, limit = 50): typeof this.eventHistory {
    return this.eventHistory
      .filter((e) => e.payload.tenantId === tenantId)
      .slice(-limit);
  }

  /**
   * Limpiar historial (para tests)
   */
  clearHistory(): void {
    this.eventHistory = [];
  }
}

// Exportar instancia singleton
export const eventBus = VolkernEventBus.getInstance();

// Re-exportar eventos para conveniencia
export { EVENTS } from '@/lib/types/events';
