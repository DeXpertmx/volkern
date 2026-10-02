import { describe, it, expect } from 'vitest';
import { parseVideoUrl, isValidVideoUrl, normalizeVideoEmbedUrl } from '@/lib/video-utils';

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

  // ── HeyGen ──
  it('heygen app.heygen.com/videos/<id> → embeds/<id>', () => {
    const result = parseVideoUrl('https://app.heygen.com/videos/899960a5e0004227bbcc93e7e6e22657');
    expect(result.provider).toBe('heygen');
    expect(result.id).toBe('899960a5e0004227bbcc93e7e6e22657');
    expect(result.embedUrl).toBe('https://app.heygen.com/embeds/899960a5e0004227bbcc93e7e6e22657');
  });

  it('heygen share URL → provider heygen, embeds', () => {
    const result = parseVideoUrl('https://share.heygen.com/videos/abc123def456');
    expect(result.provider).toBe('heygen');
    expect(result.embedUrl).toBe('https://app.heygen.com/embeds/abc123def456');
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

// ─── normalizeVideoEmbedUrl ────────────────────────────────────────────

describe('normalizeVideoEmbedUrl', () => {
  // ── YouTube ──
  it('youtube watch?v= → embed', () => {
    expect(normalizeVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('youtu.be → embed', () => {
    expect(normalizeVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('youtube shorts → embed', () => {
    expect(normalizeVideoEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('youtube live → embed', () => {
    expect(normalizeVideoEmbedUrl('https://www.youtube.com/live/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('youtube watch con params junk → embed limpio conservando list y t', () => {
    expect(normalizeVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=junk&list=PLxyz&t=90'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?list=PLxyz&start=90');
  });

  it('youtube t con formato 1m30s → start=90', () => {
    expect(normalizeVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?start=90');
  });

  it('youtube embed ya normalizado → sin cambios', () => {
    expect(normalizeVideoEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('youtube sin protocolo (www.youtube.com/...) → embed', () => {
    expect(normalizeVideoEmbedUrl('www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('m.youtube.com y music.youtube.com → embed', () => {
    expect(normalizeVideoEmbedUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(normalizeVideoEmbedUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('youtube-nocookie → embed', () => {
    expect(normalizeVideoEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  // ── Vimeo ──
  it('vimeo.com/<id> → player.vimeo.com/video/<id>', () => {
    expect(normalizeVideoEmbedUrl('https://vimeo.com/123456789'))
      .toBe('https://player.vimeo.com/video/123456789');
  });

  it('vimeo channels → id del último segmento numérico', () => {
    expect(normalizeVideoEmbedUrl('https://vimeo.com/channels/staffpicks/123456789'))
      .toBe('https://player.vimeo.com/video/123456789');
  });

  it('player.vimeo.com ya es embed → sin cambios', () => {
    expect(normalizeVideoEmbedUrl('https://player.vimeo.com/video/123456789'))
      .toBe('https://player.vimeo.com/video/123456789');
  });

  // ── HeyGen ──
  it('heygen videos/<id> → app.heygen.com/embeds/<id>', () => {
    expect(normalizeVideoEmbedUrl('https://app.heygen.com/videos/899960a5e0004227bbcc93e7e6e22657'))
      .toBe('https://app.heygen.com/embeds/899960a5e0004227bbcc93e7e6e22657');
  });

  it('heygen embed ya normalizado → sin cambios', () => {
    expect(normalizeVideoEmbedUrl('https://app.heygen.com/embeds/899960a5e0004227bbcc93e7e6e22657'))
      .toBe('https://app.heygen.com/embeds/899960a5e0004227bbcc93e7e6e22657');
  });

  it('heygen sin protocolo → embed', () => {
    expect(normalizeVideoEmbedUrl('app.heygen.com/videos/abc123def456'))
      .toBe('https://app.heygen.com/embeds/abc123def456');
  });

  // ── Dailymotion ──
  it('dailymotion video → embed', () => {
    expect(normalizeVideoEmbedUrl('https://www.dailymotion.com/video/x7tg9ad'))
      .toBe('https://www.dailymotion.com/embed/video/x7tg9ad');
  });

  it('dai.ly → embed', () => {
    expect(normalizeVideoEmbedUrl('https://dai.ly/x7tg9ad'))
      .toBe('https://www.dailymotion.com/embed/video/x7tg9ad');
  });

  // ── Otros / edge cases ──
  it('URL cualquiera http(s) → tal cual', () => {
    expect(normalizeVideoEmbedUrl('https://cdn.example.com/video.mp4'))
      .toBe('https://cdn.example.com/video.mp4');
  });

  it('protocol-relative //youtube.com → embed', () => {
    expect(normalizeVideoEmbedUrl('//www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('espacios alrededor → trim', () => {
    expect(normalizeVideoEmbedUrl('  https://youtu.be/dQw4w9WgXcQ  '))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('vacío/null → null', () => {
    expect(normalizeVideoEmbedUrl('')).toBeNull();
    expect(normalizeVideoEmbedUrl('   ')).toBeNull();
    expect(normalizeVideoEmbedUrl(null)).toBeNull();
    expect(normalizeVideoEmbedUrl(undefined)).toBeNull();
  });

  it('texto no URL → null', () => {
    expect(normalizeVideoEmbedUrl('hola mundo')).toBeNull();
  });
});
