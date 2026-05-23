import { describe, it, expect } from 'vitest';
import { AVAILABLE_CHANNELS, type ChannelConfig } from '@/lib/notifications/types';

// ─── Helpers ──────────────────────────────────────────────────────────────

function validateChannelConfig(ch: ChannelConfig) {
  expect(ch).toHaveProperty('channel');
  expect(typeof ch.channel).toBe('string');
  expect(ch).toHaveProperty('name');
  expect(typeof ch.name).toBe('string');
  expect(ch).toHaveProperty('enabled');
  expect(typeof ch.enabled).toBe('boolean');
  expect(ch).toHaveProperty('priority');
  expect(['low', 'normal', 'high', 'urgent']).toContain(ch.priority);
  expect(ch).toHaveProperty('rateLimitPerDay');
  expect(typeof ch.rateLimitPerDay).toBe('number');
  expect(ch).toHaveProperty('retryAttempts');
  expect(typeof ch.retryAttempts).toBe('number');
  expect(ch).toHaveProperty('retryDelayMs');
  expect(typeof ch.retryDelayMs).toBe('number');
  expect(ch).toHaveProperty('timeoutMs');
  expect(typeof ch.timeoutMs).toBe('number');
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('AVAILABLE_CHANNELS', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(AVAILABLE_CHANNELS)).toBe(true);
  });

  it('debe tener al menos 2 canales', () => {
    expect(AVAILABLE_CHANNELS.length).toBeGreaterThanOrEqual(2);
  });

  it('todos los canales deben cumplir el schema', () => {
    AVAILABLE_CHANNELS.forEach(ch => validateChannelConfig(ch));
  });

  it('canales únicos', () => {
    const channels = AVAILABLE_CHANNELS.map(c => c.channel);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('nombres únicos', () => {
    const names = AVAILABLE_CHANNELS.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('debe incluir Telegram', () => {
    const telegram = AVAILABLE_CHANNELS.find(c => c.channel === 'telegram')!;
    expect(telegram.name).toBe('Telegram');
    expect(telegram.enabled).toBe(true);
    expect(telegram.rateLimitPerDay).toBe(300);
    expect(telegram.retryAttempts).toBe(3);
    expect(telegram.timeoutMs).toBe(15000);
  });

  it('debe incluir Slack', () => {
    const slack = AVAILABLE_CHANNELS.find(c => c.channel === 'slack')!;
    expect(slack.name).toBe('Slack');
    expect(slack.enabled).toBe(true);
    expect(slack.rateLimitPerDay).toBe(100);
    expect(slack.defaultChannel).toBe('#general');
  });

  it('todos los canales deben estar enabled', () => {
    AVAILABLE_CHANNELS.forEach(ch => {
      expect(ch.enabled).toBe(true);
    });
  });

  it('todos los canales deben tener priority normal', () => {
    AVAILABLE_CHANNELS.forEach(ch => {
      expect(ch.priority).toBe('normal');
    });
  });

  it('todos deben tener retryAttempts >= 1', () => {
    AVAILABLE_CHANNELS.forEach(ch => {
      expect(ch.retryAttempts).toBeGreaterThanOrEqual(1);
    });
  });

  it('todos deben tener rateLimitPerDay > 0', () => {
    AVAILABLE_CHANNELS.forEach(ch => {
      expect(ch.rateLimitPerDay).toBeGreaterThan(0);
    });
  });

  it('todos deben tener timeoutMs > 0', () => {
    AVAILABLE_CHANNELS.forEach(ch => {
      expect(ch.timeoutMs).toBeGreaterThan(0);
    });
  });
});
