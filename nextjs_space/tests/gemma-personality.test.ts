import { describe, it, expect } from 'vitest';
import {
  getGemmaSystemPrompt,
  GEMMA_SYSTEM_PROMPT,
  CLASSIFICATION_SYSTEM_PROMPT,
  type IntentSchema,
} from '@/lib/assistant/gemma-personality';

describe('GEMMA_SYSTEM_PROMPT', () => {
  it('debe ser un string no vacío', () => {
    expect(typeof GEMMA_SYSTEM_PROMPT).toBe('string');
    expect(GEMMA_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('debe contener el nombre Gemma', () => {
    expect(GEMMA_SYSTEM_PROMPT).toContain('Gemma');
  });

  it('debe contener Volkern', () => {
    expect(GEMMA_SYSTEM_PROMPT).toContain('Volkern');
  });

  it('debe contener reglas de comportamiento', () => {
    expect(GEMMA_SYSTEM_PROMPT).toContain('REGLAS');
  });

  it('debe contener sección de capacidades', () => {
    expect(GEMMA_SYSTEM_PROMPT).toContain('CAPACIDADES');
  });
});

describe('CLASSIFICATION_SYSTEM_PROMPT', () => {
  it('debe ser un string no vacío', () => {
    expect(typeof CLASSIFICATION_SYSTEM_PROMPT).toBe('string');
    expect(CLASSIFICATION_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('debe contener instrucciones de clasificación', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain('CLASIFICACIÓN');
  });

  it('debe contener el formato JSON esperado', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain('intent');
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain('confidence');
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain('needsMoreInfo');
  });
});

describe('getGemmaSystemPrompt', () => {
  it('debe devolver al menos GEMMA_SYSTEM_PROMPT sin parámetros', () => {
    const prompt = getGemmaSystemPrompt();
    expect(prompt).toContain('Gemma');
    expect(prompt).toContain('Volkern');
  });

  it('no debe incluir CLASSIFICATION_SYSTEM_PROMPT si no hay intents', () => {
    const prompt = getGemmaSystemPrompt();
    expect(prompt).not.toContain('INTENCIONES DISPONIBLES');
  });

  it('debe incluir CLASSIFICATION_SYSTEM_PROMPT cuando hay intents', () => {
    const intents: IntentSchema[] = [
      {
        name: 'crear_lead',
        description: 'Crear un nuevo lead',
        requiredParams: ['nombre', 'email'],
        optionalParams: ['telefono'],
        examples: ['Crea un lead Juan'],
        destructive: false,
      },
    ];
    const prompt = getGemmaSystemPrompt(undefined, intents);
    expect(prompt).toContain('INTENCIONES DISPONIBLES');
    expect(prompt).toContain('crear_lead');
    expect(prompt).toContain('nombre, email');
  });

  it('debe incluir múltiples intents', () => {
    const intents: IntentSchema[] = [
      { name: 'crear_lead', description: 'Crea lead', requiredParams: ['nombre'], optionalParams: [], examples: [], destructive: false },
      { name: 'agendar_cita', description: 'Agenda cita', requiredParams: ['fecha'], optionalParams: ['descripcion'], examples: [], destructive: false },
    ];
    const prompt = getGemmaSystemPrompt(undefined, intents);
    expect(prompt).toContain('crear_lead');
    expect(prompt).toContain('agendar_cita');
  });

  it('debe incluir CONTEXTO DE CONVERSACIÓN si se proporciona', () => {
    const prompt = getGemmaSystemPrompt('Usuario preguntó por facturas');
    expect(prompt).toContain('CONTEXTO DE CONVERSACIÓN');
    expect(prompt).toContain('Usuario preguntó por facturas');
  });

  it('debe incluir tanto intents como contexto simultáneamente', () => {
    const intents: IntentSchema[] = [
      { name: 'test', description: 'Test', requiredParams: [], optionalParams: [], examples: [], destructive: false },
    ];
    const prompt = getGemmaSystemPrompt('Contexto de prueba', intents);
    expect(prompt).toContain('INTENCIONES DISPONIBLES');
    expect(prompt).toContain('CONTEXTO DE CONVERSACIÓN');
    expect(prompt).toContain('Contexto de prueba');
  });

  it('debe manejar intents sin requiredParams', () => {
    const intents: IntentSchema[] = [
      { name: 'saludar', description: 'Saludo inicial', requiredParams: [], optionalParams: [], examples: ['hola'], destructive: false },
    ];
    const prompt = getGemmaSystemPrompt(undefined, intents);
    expect(prompt).toContain('ninguno');
  });
});
