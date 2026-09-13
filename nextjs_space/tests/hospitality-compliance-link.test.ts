import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  firmarTokenEnlace,
  verificarTokenEnlace,
  urlPedirDatos,
  EnlaceNoConfigurado,
} from '../lib/hospitality/compliance-link';

const SECRETO = 'secreto-de-prueba-para-enlaces-de-viajeros';

const conSecreto = () => {
  vi.stubEnv('TRAVELER_LINK_SECRET', SECRETO);
};
const sinSecreto = () => {
  vi.stubEnv('TRAVELER_LINK_SECRET', '');
  vi.stubEnv('NEXTAUTH_SECRET', '');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('el enlace firmado para pedir datos al viajero', () => {
  it('firma y verifica: el id del viajero sobrevive el ciclo completo', () => {
    conSecreto();
    const token = firmarTokenEnlace('viajero-123');
    const resultado = verificarTokenEnlace(token);
    expect(resultado).toEqual({ ok: true, viajeroId: 'viajero-123' });
  });

  it('sin secreto configurado, firmar falla con un error explícito', () => {
    sinSecreto();
    expect(() => firmarTokenEnlace('viajero-123')).toThrow(EnlaceNoConfigurado);
  });

  it('sin secreto configurado, verificar rechaza en lugar de firmar nada', () => {
    sinSecreto();
    const resultado = verificarTokenEnlace('cualquier-cosa.firma');
    expect(resultado).toEqual({ ok: false, motivo: 'firma_invalida' });
  });

  it('un token manipulado no verifica (firma inválida)', () => {
    conSecreto();
    const token = firmarTokenEnlace('viajero-123');
    const [cuerpo, firma] = token.split('.');
    const otroCuerpo = Buffer.from(
      JSON.stringify({ viajeroId: 'OTRO-viajero', expiraEn: Date.now() + 60_000 })
    ).toString('base64url');
    expect(verificarTokenEnlace(`${otroCuerpo}.${firma}`)).toEqual({ ok: false, motivo: 'firma_invalida' });
    // También un dígito cambiado en el original.
    expect(verificarTokenEnlace(`${cuerpo}.${firma.slice(0, -2)}AA`)).toEqual({
      ok: false,
      motivo: 'firma_invalida',
    });
  });

  it('un token caducado no verifica, con motivo distinto al de la firma', () => {
    conSecreto();
    const antes = Date.now() - 8 * 24 * 60 * 60 * 1000; // hace 8 días
    const token = firmarTokenEnlace('viajero-123', antes);
    expect(verificarTokenEnlace(token)).toEqual({ ok: false, motivo: 'caducado' });
  });

  it('un token malformado no verifica', () => {
    conSecreto();
    expect(verificarTokenEnlace('sin-firma')).toEqual({ ok: false, motivo: 'malformado' });
    expect(verificarTokenEnlace('a.b.c')).toEqual({ ok: false, motivo: 'malformado' });
    expect(verificarTokenEnlace('')).toEqual({ ok: false, motivo: 'malformado' });
  });

  it('la URL pública va sobre /viajeros y normaliza la barra final del dominio', () => {
    expect(urlPedirDatos('https://volkern.app', 'tok.en')).toBe('https://volkern.app/viajeros/tok.en');
    expect(urlPedirDatos('https://volkern.app/', 'tok.en')).toBe('https://volkern.app/viajeros/tok.en');
  });

  it('el token no contiene el id en claro ni datos del viajero', () => {
    conSecreto();
    const token = firmarTokenEnlace('viajero-123');
    expect(token).not.toContain('viajero-123');
    const [cuerpo] = token.split('.');
    const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    expect(Object.keys(carga).sort()).toEqual(['expiraEn', 'viajeroId']);
  });
});
