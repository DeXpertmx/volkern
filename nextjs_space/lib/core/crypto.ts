import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
/**
 * Clave heredada del arranque del proyecto, incrustada en el código. Solo
 * debe existir para descifrar datos escritos antes de definir ENCRYPTION_KEY;
 * en producción el uso de esta clave es un incidente de seguridad (cualquiera
 * con acceso al repositorio puede descifrar los secretos de la base de datos).
 */
const CLAVE_POR_DEFECTO = 'volkern-nexus-default-32-chars-key';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || CLAVE_POR_DEFECTO; // 32 bytes
const IV_LENGTH = 16;

/**
 * ¿Está este proceso cifrando/descifrando con la clave por defecto?
 * Verdadero solo cuando ENCRYPTION_KEY no está definida en el entorno.
 * La rotación (definir la clave y re-cifrar los valores existentes con ella)
 * está documentada en docs/VPS-SEGURIDAD-PUERTOS.md (§ ENCRYPTION_KEY).
 */
export function estaUsandoClavePorDefecto(): boolean {
  return !process.env.ENCRYPTION_KEY;
}

if (estaUsandoClavePorDefecto() && process.env.NODE_ENV === 'production') {
  console.error(
    '[Crypto] ENCRYPTION_KEY no configurada: los secretos se cifran y descifran con la clave por defecto incrustada en el código. Defínela en el entorno (32 caracteres) y rota los valores ya cifrados con la receta del runbook (docs/VPS-SEGURIDAD-PUERTOS.md).'
  );
}

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const cipher = crypto.createCipheriv(ALGORITHM, key as any, iv as any);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    try {
        const textParts = text.split(':');
        if (textParts.length !== 2) return text; // Return as is if not encrypted format

        const iv = Buffer.from(textParts.shift()!, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
        const decipher = crypto.createDecipheriv(ALGORITHM, key as any, iv as any);
        let decrypted = decipher.update(encryptedText as any);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('[Crypto] Decryption failed:', error);
        return text;
    }
}
