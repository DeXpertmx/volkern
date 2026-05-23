import { describe, it, expect } from 'vitest';
import { VisionService, type VisionAnalysisResult } from '@/lib/ai/vision-service';

// ─── analyzeScrapEvidence ─────────────────────────────────────────────────

describe('VisionService.analyzeScrapEvidence', () => {
  it('debe devolver un resultado con la estructura correcta', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/photo.jpg', {});
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('isRecapture');
    expect(result).toHaveProperty('textureAnomalies');
    expect(result).toHaveProperty('depthScore');
    expect(result).toHaveProperty('identifiedItem');
    expect(result).toHaveProperty('rootCause');
    expect(result).toHaveProperty('correctiveAction');
    expect(result).toHaveProperty('riskLevel');
  });

  // ── Integridad Confirmada ──
  it('imagen normal → Integridad Confirmada, riskLevel LOW', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/photo.jpg', {});
    expect(result.verdict).toBe('Integridad Confirmada.');
    expect(result.isRecapture).toBe(false);
    expect(result.textureAnomalies).toBe(false);
    expect(result.riskLevel).toBe('LOW');
    expect(result.depthScore).toBe(0.9);
  });

  // ── Detección de recaptura ──
  it('screen en URL → recapture, HIGH risk', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/screen_shot.png', {});
    expect(result.isRecapture).toBe(true);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.depthScore).toBe(0.1);
    expect(result.verdict).toContain('FRAUDE DETECTADO');
  });

  it('pixel en URL → recapture', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/pixel_art.png', {});
    expect(result.isRecapture).toBe(true);
    expect(result.riskLevel).toBe('HIGH');
  });

  it('moire en URL → recapture', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/moire_pattern.png', {});
    expect(result.isRecapture).toBe(true);
    expect(result.riskLevel).toBe('HIGH');
  });

  // ── Anomalías de textura ──
  it('blur en URL → textureAnomalies, MEDIUM risk', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/blur_img.png', {});
    expect(result.textureAnomalies).toBe(true);
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.verdict).toContain('ALERTA');
  });

  it('low-res en URL → textureAnomalies, MEDIUM risk', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/low-res_img.png', {});
    expect(result.textureAnomalies).toBe(true);
    expect(result.riskLevel).toBe('MEDIUM');
  });

  // ── Diagnóstico Industrial (materiales) ──
  it('metal → desgaste por fricción térmica', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/metal_part.png', {});
    expect(result.rootCause).toContain('fricción térmica');
    expect(result.correctiveAction).toContain('lubricación');
  });

  it('plastic → sobrecalentamiento en boquilla', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/plastic_mold.png', {});
    expect(result.rootCause).toContain('Sobrecalentamiento');
    expect(result.correctiveAction).toContain('PLC');
  });

  it('circuit → descarga electrostática (ESD)', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/circuit_board.png', {});
    expect(result.rootCause).toContain('ESD');
    expect(result.correctiveAction).toContain('antiestáticas');
  });

  it('electronic → descarga electrostática (ESD)', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/electronic_part.png', {});
    expect(result.rootCause).toContain('ESD');
  });

  it('material desconocido → causa raíz estándar', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/unknown_material.png', {});
    expect(result.rootCause).toBe('Proceso estándar de manufactura.');
    expect(result.correctiveAction).toBe('Ninguna acción requerida.');
  });

  // ── Contexto BoM ──
  it('debe usar el primer ítem del BoM como identifiedItem', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/photo.jpg', {
      bomItems: ['Engranaje A', 'Engranaje B']
    });
    expect(result.identifiedItem).toBe('Engranaje A');
  });

  it('sin BoM → identifiedItem = Desconocido', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/photo.jpg', {});
    expect(result.identifiedItem).toBe('Desconocido');
  });

  it('BoM vacío → identifiedItem = Desconocido', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/photo.jpg', { bomItems: [] });
    expect(result.identifiedItem).toBe('Desconocido');
  });

  // ── Recapture + Material diagnostic ──
  it('screen + metal → recapture HIGH + metal rootCause', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/screen_metal.png', {});
    expect(result.isRecapture).toBe(true);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.rootCause).toContain('fricción térmica');
  });

  // ── blur + plastic → textureAnomaly MEDIUM + plastic rootCause ──
  it('blur + plastic → MEDIUM risk + plastic diagnostic', async () => {
    const result = await VisionService.analyzeScrapEvidence('https://img.com/blur_plastic.png', {});
    expect(result.textureAnomalies).toBe(true);
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.rootCause).toContain('Sobrecalentamiento');
  });
});
