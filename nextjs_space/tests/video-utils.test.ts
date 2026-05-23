import { describe, it, expect } from 'vitest';
import { parseVideoUrl, isValidVideoUrl } from '@/lib/video-utils';

// ─── parseVideoUrl ────────────────────────────────────────────────────────

describe('parseVideoUrl', () => {
  // ── YouTube ──
  it('youtube estándar → provider youtube, id 11 chars, embedUrl', () => {
    const result = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.provider).toBe('youtube');
    expect(result.id).toHaveLength(11);
    expect(result.id).toMatch(/^[a-zA-Z0-9_-]{11}$/);
    expect(result.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('youtube short link (youtu.be) → provider youtube', () => {
    const result = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(result.provider).toBe('youtube');
    expect(result.id).toBe('dQw4w9WgXcQ');
    expect(result.embedUrl).toContain('youtube.com/embed/');
  });

  it('youtube embed URL → provider youtube', () => {
    const result = parseVideoUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(result.provider).toBe('youtube');
    expect(result.id).toBe('dQw4w9WgXcQ');
  });

  it('youtube con query params extra → extrae id correcto', () => {
    const result = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30&list=PLxyz');
    expect(result.provider).toBe('youtube');
    expect(result.id).toBe('dQw4w9WgXcQ');
  });

  // ── Vimeo ──
  it('vimeo estándar → provider vimeo, id numérico, embedUrl', () => {
    const result = parseVideoUrl('https://vimeo.com/123456789');
    expect(result.provider).toBe('vimeo');
    expect(result.id).toBe('123456789');
    expect(result.embedUrl).toBe('https://player.vimeo.com/video/123456789');
  });

  it('vimeo embed URL → provider vimeo', () => {
    const result = parseVideoUrl('https://player.vimeo.com/video/987654321');
    expect(result.provider).toBe('vimeo');
    expect(result.id).toBe('987654321');
  });

  // ── Dailymotion ──
  it('dailymotion estándar → provider dailymotion, id alfanumérico, embedUrl', () => {
    const result = parseVideoUrl('https://www.dailymotion.com/video/x7tg9ad');
    expect(result.provider).toBe('dailymotion');
    expect(result.id).toBe('x7tg9ad');
    expect(result.embedUrl).toBe('https://www.dailymotion.com/embed/video/x7tg9ad');
  });

  it('dailymotion embed → provider dailymotion', () => {
    const result = parseVideoUrl('https://www.dailymotion.com/embed/video/x8abc12');
    expect(result.provider).toBe('dailymotion');
    expect(result.id).toBe('x8abc12');
  });

  it('dailymotion dai.ly short link → provider dailymotion', () => {
    const result = parseVideoUrl('https://dai.ly/x7tg9ad');
    expect(result.provider).toBe('dailymotion');
    expect(result.id).toBe('x7tg9ad');
  });

  // ── Direct upload / other ──
  it('URL http normal → provider upload, id es la URL', () => {
    const url = 'https://cdn.example.com/videos/my-video.mp4';
    const result = parseVideoUrl(url);
    expect(result.provider).toBe('upload');
    expect(result.id).toBe(url);
    expect(result.embedUrl).toBe(url);
  });

  it('ruta relativa → provider upload, id es la ruta', () => {
    const url = '/uploads/videos/demo.mp4';
    const result = parseVideoUrl(url);
    expect(result.provider).toBe('upload');
    expect(result.id).toBe(url);
    expect(result.embedUrl).toBe(url);
  });

  // ── Unknown / empty ──
  it('string no reconocida → provider unknown, id null', () => {
    const result = parseVideoUrl('esto-no-es-una-url');
    expect(result.provider).toBe('unknown');
    expect(result.id).toBeNull();
    expect(result.embedUrl).toBeNull();
  });

  it('string vacío → provider unknown, id null', () => {
    const result = parseVideoUrl('');
    expect(result.provider).toBe('unknown');
    expect(result.id).toBeNull();
    expect(result.embedUrl).toBeNull();
  });

  // ── Determinismo ──
  it('debe ser determinista', () => {
    const url = 'https://www.youtube.com/watch?v=abcdefghijk';
    const a = parseVideoUrl(url);
    const b = parseVideoUrl(url);
    expect(a).toEqual(b);
  });
});

// ─── isValidVideoUrl ───────────────────────────────────────────────────────

describe('isValidVideoUrl', () => {
  it('youtube → true', () => {
    expect(isValidVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  it('youtu.be → true', () => {
    expect(isValidVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });

  it('vimeo → true', () => {
    expect(isValidVideoUrl('https://vimeo.com/123456789')).toBe(true);
  });

  it('dailymotion → true', () => {
    expect(isValidVideoUrl('https://www.dailymotion.com/video/x7tg9ad')).toBe(true);
  });

  it('URL de subida directa → true', () => {
    expect(isValidVideoUrl('https://cdn.example.com/video.mp4')).toBe(true);
  });

  it('string vacío → false', () => {
    expect(isValidVideoUrl('')).toBe(false);
  });

  it('texto aleatorio → false', () => {
    expect(isValidVideoUrl('hola mundo')).toBe(false);
  });
});
