import { describe, it, expect } from 'vitest';
import {
  capacidadesDe,
  decidirEscritor,
  describirDecision,
  PROVEEDORES,
  PROVEEDOR_PRINCIPAL,
  proveedoresDeLectura,
} from '@/lib/hospitality/conectividad-proveedores';

describe('Conectividad — registro de proveedores', () => {
  it('el nuevo es el principal y el anterior queda de respaldo', () => {
    expect(PROVEEDOR_PRINCIPAL).toBe('nobeds');
    expect(PROVEEDORES.nobeds.papel).toBe('principal');
    expect(PROVEEDORES.channel_connectivity.papel).toBe('respaldo');
  });

  it('el nombre visible es neutro para todos: no revela la marca', () => {
    for (const definicion of Object.values(PROVEEDORES)) {
      expect(definicion.nombreVisible).toBe('Conectividad de Canales');
      expect(definicion.nombreVisible.toLowerCase()).not.toContain('nobeds');
      expect(definicion.nombreVisible.toLowerCase()).not.toContain('aiosell');
    }
  });

  it('declara las diferencias que obligan a dos adaptadores', () => {
    expect(capacidadesDe('nobeds')).toMatchObject({
      webhooks: false,
      planesDeTarifa: false,
      tokenPorPropiedad: true,
      resenas: true,
    });
    expect(capacidadesDe('channel_connectivity')).toMatchObject({
      webhooks: true,
      planesDeTarifa: true,
      tokenPorPropiedad: false,
      resenas: false,
    });
    expect(capacidadesDe('otro')).toBeNull();
  });
});

describe('Conectividad — un solo escritor', () => {
  it('con solo el nuevo activo, escribe el nuevo', () => {
    const decision = decidirEscritor([{ provider: 'nobeds', activo: true }]);
    expect(decision).toMatchObject({ escritor: 'nobeds', motivo: 'ok' });
  });

  it('el respaldo sigue pudiendo escribir si es el único activo: es la vuelta atrás', () => {
    const decision = decidirEscritor([{ provider: 'channel_connectivity', activo: true }]);
    expect(decision).toMatchObject({ escritor: 'channel_connectivity', motivo: 'ok' });
  });

  it('si los dos están en escritura, NO elige ninguno', () => {
    const decision = decidirEscritor([
      { provider: 'nobeds', activo: true },
      { provider: 'channel_connectivity', activo: true, modo: 'escritura' },
    ]);

    expect(decision.escritor).toBeNull();
    expect(decision.motivo).toBe('dos_escritores');
    expect(decision.aspirantes.sort()).toEqual(['channel_connectivity', 'nobeds']);
  });

  it('la convivencia buena: el nuevo escribe y el anterior queda en lectura', () => {
    const configs = [
      { provider: 'nobeds', activo: true, modo: 'escritura' as const },
      { provider: 'channel_connectivity', activo: true, modo: 'lectura' as const },
    ];

    expect(decidirEscritor(configs)).toMatchObject({ escritor: 'nobeds', motivo: 'ok' });
    expect(proveedoresDeLectura(configs)).toEqual(['nobeds', 'channel_connectivity']);
  });

  it('un proveedor en lectura no escribe, aunque tenga la capacidad', () => {
    const decision = decidirEscritor([{ provider: 'nobeds', activo: true, modo: 'lectura' }]);
    expect(decision.escritor).toBeNull();
    expect(decision.motivo).toBe('sin_configurar');
  });

  it('un proveedor desconocido activo bloquea la escritura: no se puede probar que no empuje', () => {
    const decision = decidirEscritor([
      { provider: 'nobeds', activo: true },
      { provider: 'proveedor_nuevo', activo: true },
    ]);

    expect(decision.escritor).toBeNull();
    expect(decision.motivo).toBe('desconocido');
    expect(decision.desconocidos).toEqual(['proveedor_nuevo']);
  });

  it('un desconocido inactivo se ignora', () => {
    const decision = decidirEscritor([
      { provider: 'nobeds', activo: true },
      { provider: 'proveedor_nuevo', activo: false },
    ]);
    expect(decision).toMatchObject({ escritor: 'nobeds', motivo: 'ok' });
  });

  it('sin nada activo no se escribe', () => {
    expect(decidirEscritor([])).toMatchObject({ escritor: null, motivo: 'sin_configurar' });
    expect(decidirEscritor([{ provider: 'nobeds', activo: false }])).toMatchObject({
      escritor: null,
      motivo: 'sin_configurar',
    });
  });

  it('un proveedor sin capacidad de escritura nunca es escritor', () => {
    const decision = decidirEscritor([{ provider: 'solo_lectura', activo: true }]);
    expect(decision.escritor).toBeNull();
    // No lo conocemos: la política es conservadora, no lo trata como inofensivo.
    expect(decision.motivo).toBe('desconocido');
  });

  it('el mensaje al operador no nombra al proveedor', () => {
    const mensajes = [
      describirDecision(decidirEscritor([{ provider: 'nobeds', activo: true }])),
      describirDecision(
        decidirEscritor([
          { provider: 'nobeds', activo: true },
          { provider: 'channel_connectivity', activo: true },
        ])
      ),
      describirDecision(decidirEscritor([])),
      describirDecision(decidirEscritor([{ provider: 'otro', activo: true }])),
    ];

    for (const mensaje of mensajes) {
      expect(mensaje.toLowerCase()).not.toContain('nobeds');
      expect(mensaje.toLowerCase()).not.toContain('aiosell');
      expect(mensaje.toLowerCase()).not.toContain('channel_connectivity');
    }
  });
});
