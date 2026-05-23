import { describe, it, expect } from 'vitest';
import {
  CANVA_TEMPLATES,
  getTemplateConfig,
  getAllTemplates,
} from '@/lib/canva-config';

// ─── CANVA_TEMPLATES ───────────────────────────────────────────────────
describe('CANVA_TEMPLATES', () => {
  it('debe tener al menos 5 templates', () => {
    const keys = Object.keys(CANVA_TEMPLATES);
    expect(keys.length).toBeGreaterThanOrEqual(5);
  });

  it('cada template debe tener id, name, description, aspectRatio', () => {
    for (const [, config] of Object.entries(CANVA_TEMPLATES)) {
      expect(config.id).toBeTruthy();
      expect(typeof config.id).toBe('string');
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.aspectRatio).toBeTruthy();
    }
  });

  it('cada id de template debe empezar con DAF (formato Canva)', () => {
    for (const [, config] of Object.entries(CANVA_TEMPLATES)) {
      expect(config.id).toMatch(/^DAF/);
    }
  });

  it('cada aspectRatio debe tener formato X:Y', () => {
    for (const [, config] of Object.entries(CANVA_TEMPLATES)) {
      expect(config.aspectRatio).toMatch(/^\d+:\d+$/);
    }
  });

  it('debe incluir facebook_ad, instagram_story, instagram_post', () => {
    expect(CANVA_TEMPLATES.facebook_ad).toBeDefined();
    expect(CANVA_TEMPLATES.instagram_story).toBeDefined();
    expect(CANVA_TEMPLATES.instagram_post).toBeDefined();
  });

  it('debe incluir email_header, social_media_post, twitter_post', () => {
    expect(CANVA_TEMPLATES.email_header).toBeDefined();
    expect(CANVA_TEMPLATES.social_media_post).toBeDefined();
    expect(CANVA_TEMPLATES.twitter_post).toBeDefined();
  });

  it('instagram_story debe tener aspectRatio 9:16 (vertical)', () => {
    expect(CANVA_TEMPLATES.instagram_story.aspectRatio).toBe('9:16');
  });

  it('email_header debe tener aspectRatio 2:1', () => {
    expect(CANVA_TEMPLATES.email_header.aspectRatio).toBe('2:1');
  });
});

// ─── getTemplateConfig ─────────────────────────────────────────────────
describe('getTemplateConfig', () => {
  it('debe devolver la config correcta para facebook_ad', () => {
    const config = getTemplateConfig('facebook_ad');
    expect(config).toBeDefined();
    expect(config.id).toBe(CANVA_TEMPLATES.facebook_ad.id);
    expect(config.name).toBe('Anuncio de Facebook');
  });

  it('debe devolver la config correcta para instagram_story', () => {
    const config = getTemplateConfig('instagram_story');
    expect(config.aspectRatio).toBe('9:16');
  });

  it('debe devolver la misma referencia para la misma key', () => {
    const a = getTemplateConfig('facebook_ad');
    const b = getTemplateConfig('facebook_ad');
    expect(a).toBe(b);
  });

  it('keys diferentes deben devolver configs diferentes', () => {
    const fb = getTemplateConfig('facebook_ad');
    const ig = getTemplateConfig('instagram_post');
    expect(fb).not.toBe(ig);
    expect(fb.id).not.toBe(ig.id);
  });
});

// ─── getAllTemplates ───────────────────────────────────────────────────
describe('getAllTemplates', () => {
  it('debe devolver un array con todos los templates', () => {
    const templates = getAllTemplates();
    expect(templates.length).toBe(Object.keys(CANVA_TEMPLATES).length);
  });

  it('cada entry debe tener key + propiedades del template', () => {
    const templates = getAllTemplates();
    for (const t of templates) {
      expect(t.key).toBeTruthy();
      expect(typeof t.key).toBe('string');
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.aspectRatio).toBeTruthy();
    }
  });

  it('no debe haber keys duplicadas', () => {
    const templates = getAllTemplates();
    const keys = templates.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('debe cubrir todas las keys de CANVA_TEMPLATES', () => {
    const templates = getAllTemplates();
    const originalKeys = Object.keys(CANVA_TEMPLATES);
    const templateKeys = templates.map(t => t.key);
    expect(templateKeys.sort()).toEqual(originalKeys.sort());
  });
});
