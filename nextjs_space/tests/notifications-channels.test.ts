import { describe, it, expect } from 'vitest';
import { AVAILABLE_CHANNELS, type NotificationChannelType } from '@/lib/notifications/types';

const VALID_CHANNELS: NotificationChannelType[] = ['telegram', 'slack'];

describe('AVAILABLE_CHANNELS', () => {
  // ─── Estructura ──────────────────────────────────────────────────────
  it('debe tener exactamente 2 canales', () => {
    expect(AVAILABLE_CHANNELS).toHaveLength(2);
  });

  it('cada canal debe tener channel, name, enabled, priority, rateLimitPerDay, retryAttempts, retryDelayMs, timeoutMs', () => {
    for (const ch of AVAILABLE_CHANNELS) {
      expect(typeof ch.channel).toBe('string');
      expect(typeof ch.name).toBe('string');
      expect(typeof ch.enabled).toBe('boolean');
      expect(typeof ch.priority).toBe('string');
      expect(typeof ch.rateLimitPerDay).toBe('number');
      expect(typeof ch.retryAttempts).toBe('number');
      expect(typeof ch.retryDelayMs).toBe('number');
      expect(typeof ch.timeoutMs).toBe('number');
    }
  });

  it('los canales deben ser telegram y slack', () => {
    const channelTypes = AVAILABLE_CHANNELS.map(c => c.channel);
    expect(channelTypes).toContain('telegram');
    expect(channelTypes).toContain('slack');
  });

  it('no debe haber canales duplicados', () => {
    const ids = AVAILABLE_CHANNELS.map(c => c.channel);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todos los canales deben estar habilitados', () => {
    for (const ch of AVAILABLE_CHANNELS) {
      expect(ch.enabled).toBe(true);
    }
  });

  // ─── Valores específicos ─────────────────────────────────────────────
  it('telegram debe tener rateLimitPerDay=300 y retryAttempts=3', () => {
    const tg = AVAILABLE_CHANNELS.find(c => c.channel === 'telegram')!;
    expect(tg.rateLimitPerDay).toBe(300);
    expect(tg.retryAttempts).toBe(3);
    expect(tg.retryDelayMs).toBe(1000);
    expect(tg.timeoutMs).toBe(15000);
    expect(tg.priority).toBe('normal');
  });

  it('slack debe tener rateLimitPerDay=100 y defaultChannel=#general', () => {
    const sl = AVAILABLE_CHANNELS.find(c => c.channel === 'slack')!;
    expect(sl.rateLimitPerDay).toBe(100);
    expect(sl.retryAttempts).toBe(3);
    expect(sl.defaultChannel).toBe('#general');
    expect(sl.timeoutMs).toBe(10000);
  });

  // ─── Tipos ───────────────────────────────────────────────────────────
  it('todos los channel deben ser NotificationChannelType válidos', () => {
    for (const ch of AVAILABLE_CHANNELS) {
      expect(VALID_CHANNELS).toContain(ch.channel);
    }
  });

  it('todas las priorities deben ser válidas', () => {
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    for (const ch of AVAILABLE_CHANNELS) {
      expect(validPriorities).toContain(ch.priority);
    }
  });

  it('retryAttempts debe ser >= 0', () => {
    for (const ch of AVAILABLE_CHANNELS) {
      expect(ch.retryAttempts).toBeGreaterThanOrEqual(0);
    }
  });

  it('timeoutMs debe ser > 0', () => {
    for (const ch of AVAILABLE_CHANNELS) {
      expect(ch.timeoutMs).toBeGreaterThan(0);
    }
  });

  it('rateLimitPerDay debe ser > 0', () => {
    for (const ch of AVAILABLE_CHANNELS) {
      expect(ch.rateLimitPerDay).toBeGreaterThan(0);
    }
  });

  it('name debe ser string no vacío', () => {
    for (const ch of AVAILABLE_CHANNELS) {
      expect(ch.name.length).toBeGreaterThan(0);
    }
  });
});
