/**
 * Forma del hash de contraseña guardado.
 *
 * Un hash corrupto no falla de forma visible: `bcrypt.compare` simplemente
 * devuelve `false` y la cuenta queda inaccesible. La comprobación del login
 * tiene que dejar constancia de eso en el log, así que aquí se fija qué forma
 * se acepta y qué se avisa cuando no la tiene.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const log = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: log }));

import { avisarSiHashCorrupto, tieneFormaDeHashBcrypt } from '@/lib/auth/hash-password';

const HASH_REAL = bcrypt.hashSync('Secreta123!', 10);

/** El valor que dejó a un usuario fuera en producción: prefijo bcrypt y 89 caracteres. */
const HASH_CORRUPTO = '$2b$12$' + 'a'.repeat(82);

describe('forma del hash de contraseña', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acepta el hash que produce bcrypt', () => {
    expect(HASH_REAL).toHaveLength(60);
    expect(tieneFormaDeHashBcrypt(HASH_REAL)).toBe(true);
  });

  it('rechaza hashes que no son bcrypt de 60 caracteres', () => {
    expect(tieneFormaDeHashBcrypt(HASH_CORRUPTO)).toBe(false);
    expect(tieneFormaDeHashBcrypt('$2b$12$')).toBe(false);
    expect(tieneFormaDeHashBcrypt('5f4dcc3b5aa765d61d8327deb882cf99')).toBe(false);
    expect(tieneFormaDeHashBcrypt(null)).toBe(false);
  });

  it('deja un aviso claro en el log cuando el hash está corrupto', () => {
    expect(avisarSiHashCorrupto({ hash: HASH_CORRUPTO, userId: 'user-1' })).toBe(false);

    expect(log.error).toHaveBeenCalledTimes(1);
    const [contexto, mensaje] = log.error.mock.calls[0];
    expect(contexto).toMatchObject({
      event: 'password_hash_corrupto',
      userId: 'user-1',
      longitud: 89,
    });
    expect(String(mensaje)).toContain('no tiene forma bcrypt');
    expect(String(mensaje)).toContain('restablezca la contraseña');
  });

  it('no avisa cuando el hash es válido y sirve para comparar', () => {
    expect(avisarSiHashCorrupto({ hash: HASH_REAL, userId: 'user-1' })).toBe(true);
    expect(log.error).not.toHaveBeenCalled();
  });
});
