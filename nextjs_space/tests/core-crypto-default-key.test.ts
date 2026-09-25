// @vitest-environment node
//
// Guardia de la clave por defecto de lib/core/crypto.ts: mientras
// ENCRYPTION_KEY no esté definida, los secretos de la BD se cifran con una
// clave incrustada en el código (hallazgo del incidente del webhook 401).
// Esta guardia fija:
//  - el round-trip encrypt/decrypt no cambia al endurecer;
//  - estaUsandoClavePorDefecto() refleja el entorno (base de la verificación
//    de rotación en producción);
//  - un valor cifrado con la clave por defecto se descifra al definirla
//    explícitamente: así se verifica la rotación sin imprimir secretos.

import { describe, it, expect, vi, afterEach } from 'vitest';

const KEY_ENV = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (KEY_ENV === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = KEY_ENV;
});

describe('lib/core/crypto — clave por defecto y rotación', () => {
  it('round-trip encrypt/decrypt con clave definida', async () => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = 'clave-de-prueba-de-32-caracteres-ok';
    const { encrypt, decrypt, estaUsandoClavePorDefecto } = await import('@/lib/core/crypto');
    expect(estaUsandoClavePorDefecto()).toBe(false);
    const cifrado = encrypt('secreto ñ con acentos');
    expect(cifrado).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
    expect(decrypt(cifrado)).toBe('secreto ñ con acentos');
  });

  it('sin ENCRYPTION_KEY, estaUsandoClavePorDefecto() es true y cifra igual (retro-compat)', async () => {
    vi.resetModules();
    delete process.env.ENCRYPTION_KEY;
    const { encrypt, decrypt, estaUsandoClavePorDefecto } = await import('@/lib/core/crypto');
    expect(estaUsandoClavePorDefecto()).toBe(true);
    const cifrado = encrypt('valor');
    expect(cifrado).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
    expect(decrypt(cifrado)).toBe('valor');
  });

  it('un valor cifrado con la clave por defecto se descifra definiendo esa misma clave (rotación verificable)', async () => {
    vi.resetModules();
    delete process.env.ENCRYPTION_KEY;
    const conDefecto = await import('@/lib/core/crypto');
    const cifradoAntiguo = conDefecto.encrypt('par-antiguo');

    vi.resetModules();
    process.env.ENCRYPTION_KEY = 'volkern-nexus-default-32-chars-key';
    const conClaveExplicita = await import('@/lib/core/crypto');
    expect(conClaveExplicita.estaUsandoClavePorDefecto()).toBe(false);
    expect(conClaveExplicita.decrypt(cifradoAntiguo)).toBe('par-antiguo');
  });

  it('la clave por defecto no desaparece del código (los datos viejos deben seguir pudiendo leerse)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '..', 'lib/core/crypto.ts'),
      'utf8'
    );
    expect(fuente).toContain('volkern-nexus-default-32-chars-key');
    expect(fuente).toContain('estaUsandoClavePorDefecto');
    // La receta de rotación vive en el runbook.
    expect(fuente).toContain('docs/VPS-SEGURIDAD-PUERTOS.md');
  });
});
