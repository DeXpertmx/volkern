import { describe, it, expect } from 'vitest';
import {
  generateAuthorizationUrl,
} from '@/lib/canva-oauth';

describe('Canva OAuth — generateAuthorizationUrl', () => {
  const clientId = 'client-abc-123';
  const redirectUri = 'https://miapp.com/oauth/callback';
  const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstzcOk';

  describe('URL base', () => {
    it('debe devolver una URL de autorización de Canva', () => {
      const url = generateAuthorizationUrl(clientId, redirectUri, codeChallenge);
      expect(url).toContain('https://www.canva.com/api/oauth/authorize');
      expect(url).toContain('?');
    });
  });

  describe('Parámetros obligatorios', () => {
    const url = generateAuthorizationUrl(clientId, redirectUri, codeChallenge);

    it('debe incluir code_challenge_method=s256', () => {
      expect(url).toContain('code_challenge_method=s256');
    });

    it('debe incluir response_type=code', () => {
      expect(url).toContain('response_type=code');
    });

    it('debe incluir client_id', () => {
      expect(url).toContain(`client_id=${encodeURIComponent(clientId)}`);
    });

    it('debe incluir redirect_uri', () => {
      expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
    });

    it('debe incluir code_challenge', () => {
      expect(url).toContain(`code_challenge=${encodeURIComponent(codeChallenge)}`);
    });

    it('debe incluir el parámetro scope', () => {
      expect(url).toContain('scope=');
    });
  });

  describe('Scopes', () => {
    const url = generateAuthorizationUrl(clientId, redirectUri, codeChallenge);

    it('debe incluir design:content:read', () => {
      expect(url).toContain('design%3Acontent%3Aread');
    });

    it('debe incluir design:content:write', () => {
      expect(url).toContain('design%3Acontent%3Awrite');
    });

    it('debe incluir design:meta:read', () => {
      expect(url).toContain('design%3Ameta%3Aread');
    });

    it('debe incluir asset:read', () => {
      expect(url).toContain('asset%3Aread');
    });

    it('los scopes deben estar separados por espacio (codificado como + o %20)', () => {
      // Los espacios se codifican como + en URLSearchParams
      expect(url).toMatch(/design%3Acontent%3Aread[+]design%3Acontent%3Awrite/);
    });
  });

  describe('Parámetro state (opcional)', () => {
    it('no debe incluir state si no se proporciona', () => {
      const url = generateAuthorizationUrl(clientId, redirectUri, codeChallenge);
      expect(url).not.toContain('state=');
    });

    it('debe incluir state si se proporciona', () => {
      const url = generateAuthorizationUrl(
        clientId,
        redirectUri,
        codeChallenge,
        'random-state-xyz'
      );
      expect(url).toContain('state=random-state-xyz');
    });

    it('debe codificar state con caracteres especiales', () => {
      const url = generateAuthorizationUrl(
        clientId,
        redirectUri,
        codeChallenge,
        'state con espacios'
      );
      expect(url).toContain('state=state+con+espacios');
    });
  });

  describe('Edge cases', () => {
    it('debe manejar clientId con caracteres especiales', () => {
      const url = generateAuthorizationUrl(
        'client/id?&special',
        redirectUri,
        codeChallenge
      );
      expect(url).toContain('client_id=client%2Fid%3F%26special');
    });

    it('debe manejar redirectUri con query params', () => {
      const url = generateAuthorizationUrl(
        clientId,
        'https://miapp.com/callback?from=canva&mode=setup',
        codeChallenge
      );
      expect(url).toContain('redirect_uri=https%3A%2F%2Fmiapp.com%2Fcallback%3Ffrom%3Dcanva%26mode%3Dsetup');
    });

    it('debe generar URLs diferentes para diferentes clientId', () => {
      const url1 = generateAuthorizationUrl('client-a', redirectUri, codeChallenge);
      const url2 = generateAuthorizationUrl('client-b', redirectUri, codeChallenge);
      expect(url1).not.toBe(url2);
    });

    it('debe generar URLs diferentes para diferentes redirectUri', () => {
      const url1 = generateAuthorizationUrl(clientId, 'https://a.com/cb', codeChallenge);
      const url2 = generateAuthorizationUrl(clientId, 'https://b.com/cb', codeChallenge);
      expect(url1).not.toBe(url2);
    });

    it('debe generar URLs diferentes para diferentes codeChallenge', () => {
      const url1 = generateAuthorizationUrl(clientId, redirectUri, 'challenge-a');
      const url2 = generateAuthorizationUrl(clientId, redirectUri, 'challenge-b');
      expect(url1).not.toBe(url2);
    });

    it('la URL debe ser válida como string', () => {
      const url = generateAuthorizationUrl(clientId, redirectUri, codeChallenge);
      expect(() => new URL(url)).not.toThrow();
    });
  });
});
