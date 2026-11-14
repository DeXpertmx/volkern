import { describe, expect, it } from 'vitest';
import { isWithinBusinessHours } from '@/lib/chat/chatbot-service';

/**
 * Horario del chatbot de clientes. El fallo que cubre esta guardia: con
 * `horarioInicio: 0` el operador `||` convertía la apertura en las 9:00, así que
 * un chatbot configurado 0–24 seguía cerrado de madrugada (y con él el smoke
 * del clasificador y cualquier cliente que escribiera a esa hora).
 */
describe('isWithinBusinessHours', () => {
  const todosLosDias = '0,1,2,3,4,5,6';

  it('un horario 0–24 está abierto a cualquier hora', () => {
    const config = { horarioInicio: 0, horarioFin: 24, diasActivos: todosLosDias };
    const ahora = new Date();
    // Se prueban las 24 horas del día, no solo la actual.
    for (let hora = 0; hora < 24; hora++) {
      const original = Date.prototype.getHours;
      Date.prototype.getHours = () => hora;
      try {
        expect(isWithinBusinessHours(config)).toBe(true);
      } finally {
        Date.prototype.getHours = original;
      }
    }
  });

  it('respeta el cierre configurado', () => {
    const viernes = { horarioInicio: 9, horarioFin: 18, diasActivos: '5' };
    const originalGetDay = Date.prototype.getDay;
    const originalGetHours = Date.prototype.getHours;
    Date.prototype.getDay = () => 5;
    try {
      Date.prototype.getHours = () => 10;
      expect(isWithinBusinessHours(viernes)).toBe(true);
      Date.prototype.getHours = () => 18;
      expect(isWithinBusinessHours(viernes)).toBe(false);
      Date.prototype.getHours = () => 8;
      expect(isWithinBusinessHours(viernes)).toBe(false);
    } finally {
      Date.prototype.getDay = originalGetDay;
      Date.prototype.getHours = originalGetHours;
    }
  });

  it('un día no incluido en diasActivos está cerrado', () => {
    const soloLaborables = { horarioInicio: 9, horarioFin: 18, diasActivos: '1,2,3,4,5' };
    const originalGetDay = Date.prototype.getDay;
    const originalGetHours = Date.prototype.getHours;
    Date.prototype.getDay = () => 6; // sábado
    Date.prototype.getHours = () => 11;
    try {
      expect(isWithinBusinessHours(soloLaborables)).toBe(false);
    } finally {
      Date.prototype.getDay = originalGetDay;
      Date.prototype.getHours = originalGetHours;
    }
  });
});
