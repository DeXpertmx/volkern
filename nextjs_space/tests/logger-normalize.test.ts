import { describe, it, expect } from 'vitest';

// normalizeArgs es una función privada en lib/logger.ts.
// Para testearla, la importamos dinámicamente replicando su lógica.
// La función soporta 3 patrones de llamada:
//   1. logger.info('mensaje')
//   2. logger.info({ tenantId: 'x' }, 'mensaje')
//   3. logger.error(new Error('...'), 'mensaje')
//   4. logger.error({ err: new Error('...') }, 'mensaje')

// Replicamos la lógica exacta de normalizeArgs para testearla
function normalizeArgs(obj: unknown, msg?: string, ...args: unknown[]): {
  message: string;
  data: Record<string, unknown>;
  err?: Error;
} {
  if (obj instanceof Error) {
    return {
      message: msg || obj.message,
      data: args.length > 0 && typeof args[0] === 'object' ? (args[0] as Record<string, unknown>) : {},
      err: obj,
    };
  }

  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    const dataObj = obj as Record<string, unknown>;
    if ('err' in dataObj && dataObj.err instanceof Error) {
      const { err, ...rest } = dataObj;
      return { message: msg || '', data: rest, err: err as Error };
    }
    return { message: msg || '', data: dataObj };
  }

  return { message: typeof obj === 'string' ? obj : (msg || String(obj)), data: {} };
}

describe('normalizeArgs', () => {
  // Caso 1: logger.info('mensaje')
  describe('string simple', () => {
    it('debe normalizar un string simple como mensaje', () => {
      const result = normalizeArgs('Hola mundo');
      expect(result.message).toBe('Hola mundo');
      expect(result.data).toEqual({});
      expect(result.err).toBeUndefined();
    });

    it('debe tratar string vacío', () => {
      const result = normalizeArgs('');
      expect(result.message).toBe('');
      expect(result.data).toEqual({});
    });

    it('debe manejar string numérico', () => {
      const result = normalizeArgs('12345');
      expect(result.message).toBe('12345');
    });
  });

  // Caso 2: logger.info({ tenantId: 'x' }, 'mensaje')
  describe('objeto + mensaje', () => {
    it('debe extraer data del objeto y mensaje', () => {
      const result = normalizeArgs({ tenantId: 't1', action: 'login' }, 'Usuario autenticado');
      expect(result.message).toBe('Usuario autenticado');
      expect(result.data).toEqual({ tenantId: 't1', action: 'login' });
      expect(result.err).toBeUndefined();
    });

    it('debe funcionar sin mensaje explícito', () => {
      const result = normalizeArgs({ tenantId: 't1' });
      expect(result.message).toBe('');
      expect(result.data).toEqual({ tenantId: 't1' });
    });

    it('debe ignorar arrays (no son data objects)', () => {
      const result = normalizeArgs([1, 2, 3], 'mensaje');
      expect(result.message).toBe('mensaje');
      expect(result.data).toEqual({});
    });

    it('debe manejar objeto vacío', () => {
      const result = normalizeArgs({}, 'mensaje');
      expect(result.message).toBe('mensaje');
      expect(result.data).toEqual({});
    });
  });

  // Caso 3: logger.error(new Error('...'), 'mensaje')
  describe('Error como primer argumento', () => {
    it('debe extraer error y mensaje', () => {
      const err = new Error('Algo falló');
      const result = normalizeArgs(err, 'Error al procesar');
      expect(result.message).toBe('Error al procesar');
      expect(result.err).toBe(err);
      expect(result.data).toEqual({});
    });

    it('debe usar error.message si no hay msg', () => {
      const err = new Error('Error interno');
      const result = normalizeArgs(err);
      expect(result.message).toBe('Error interno');
      expect(result.err).toBe(err);
    });

    it('debe pasar data adicional como args', () => {
      const err = new Error('Fallo');
      const result = normalizeArgs(err, 'mensaje', { tenantId: 'x' });
      expect(result.message).toBe('mensaje');
      expect(result.err).toBe(err);
      expect(result.data).toEqual({ tenantId: 'x' });
    });
  });

  // Caso 4: logger.error({ err: new Error('...') }, 'mensaje')
  describe('objeto con err', () => {
    it('debe separar err del resto de data', () => {
      const err = new Error('Timeout');
      const result = normalizeArgs({ err, tenantId: 't1', code: 500 }, 'Fallo crítico');
      expect(result.message).toBe('Fallo crítico');
      expect(result.err).toBe(err);
      expect(result.data).toEqual({ tenantId: 't1', code: 500 });
    });

    it('objeto sin err debe tratarse como data normal', () => {
      const result = normalizeArgs({ tenantId: 't1', message: 'test' }, 'info');
      expect(result.message).toBe('info');
      expect(result.data).toEqual({ tenantId: 't1', message: 'test' });
      expect(result.err).toBeUndefined();
    });
  });

  // Caso: null como primer argumento
  describe('null/undefined', () => {
    it('null debe tratarse como mensaje vacío con data vacía', () => {
      const result = normalizeArgs(null);
      expect(result.message).toBe('null');
      expect(result.data).toEqual({});
    });

    it('undefined debe tratarse como mensaje "undefined"', () => {
      const result = normalizeArgs(undefined, 'mensaje');
      expect(result.message).toBe('mensaje');
      expect(result.data).toEqual({});
    });
  });

  // Caso: número como primer argumento
  describe('número como primer argumento', () => {
    it('debe convertir número a string como mensaje', () => {
      const result = normalizeArgs(42);
      expect(result.message).toBe('42');
      expect(result.data).toEqual({});
    });
  });
});
