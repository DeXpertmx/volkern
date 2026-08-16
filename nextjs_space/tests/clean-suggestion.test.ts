import { describe, it, expect } from 'vitest';
import { cleanSuggestion } from '@/lib/ai/clean-suggestion';

describe('cleanSuggestion', () => {
  it('quita el análisis introductorio y el marcador, dejando solo la respuesta', () => {
    const raw = [
      '¡Hola! Como veo que el chat acaba de iniciar y el cliente saludó de manera general, lo ideal es mantener la conversación abierta.',
      '',
      'Aquí tienes tu siguiente respuesta como asesor:',
      '',
      '"¡Hola! Es un gusto saludarte. ¿Estás buscando comprar, vender o rentar alguna propiedad?"',
    ].join('\n');
    expect(cleanSuggestion(raw)).toBe(
      '¡Hola! Es un gusto saludarte. ¿Estás buscando comprar, vender o rentar alguna propiedad?'
    );
  });

  it('quita el marcador "Aquí tienes tu respuesta:"', () => {
    expect(cleanSuggestion('Aquí tienes tu respuesta:\n\n¡Hola! ¿En qué puedo ayudarte hoy?')).toBe(
      '¡Hola! ¿En qué puedo ayudarte hoy?'
    );
  });

  it('quita comillas envolventes', () => {
    expect(cleanSuggestion('"Respuesta directa"')).toBe('Respuesta directa');
    expect(cleanSuggestion('«Respuesta con francesas»')).toBe('Respuesta con francesas');
  });

  it('quita el prefijo "Te sugiero:"', () => {
    expect(cleanSuggestion('Te sugiero: Buenos días, con gusto te atiendo.')).toBe(
      'Buenos días, con gusto te atiendo.'
    );
  });

  it('devuelve el texto sin cambios si ya viene limpio', () => {
    expect(cleanSuggestion('¡Hola! ¿En qué puedo ayudarte hoy?')).toBe('¡Hola! ¿En qué puedo ayudarte hoy?');
  });

  it('maneja entrada vacía', () => {
    expect(cleanSuggestion('')).toBe('');
    expect(cleanSuggestion(undefined as unknown as string)).toBe('');
  });
});
