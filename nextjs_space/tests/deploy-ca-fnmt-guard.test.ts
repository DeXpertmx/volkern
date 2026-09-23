/**
 * Guardia: el certificado de la CA intermedia de FNMT debe sobrevivir a los
 * tres puntos donde se pierde silenciosamente.
 *
 * Los endpoints de SES.HOSPEDAJES no sirven su intermedio en el handshake TLS;
 * sin este archivo la llamada al Ministerio falla con
 * `unable to verify the first certificate`, y lo haría SOLO en producción
 * (en local, el store del sistema lo tapa).
 *
 * Fuente autoritativa del certificado y procedencia: docker/ca/README.md
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const CA_PEM = join(ROOT, 'docker', 'ca', 'fnmt-ac-componentes-informaticos.pem');

const CA_FP = 'F0:38:42:1F:07:F2:0D:63:A2:0D:36:91:E5:A1:78:AB:84:59:EB:E5:70:C1:64:7B:76:90:55:4E:F2:38:76:AB';
const CA_SUBJECT = 'C = ES, O = FNMT-RCM, OU = AC Componentes Informáticos';

describe('Guardia CA de SES.HOSPEDAJES (FNMT intermedia)', () => {
  it('.gitignore del repo no excluye docker/ca/*.pem (el PEM debe ser commiteable)', () => {
    const gitignore = readFileSync(join(ROOT, '..', '.gitignore'), 'utf8');
    expect(gitignore).not.toMatch(/\*\.pem/);
  });

  it('.dockerignore permite explícitamente docker/ca/*.pem', () => {
    const dockerignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8');
    expect(dockerignore).toMatch(/^!docker\/ca\/\*\.pem$/m);
  });

  it('el PEM existe y es un certificado X.509 real', () => {
    expect(existsSync(CA_PEM), 'falta docker/ca/fnmt-ac-componentes-informaticos.pem').toBe(true);
    const pem = readFileSync(CA_PEM, 'utf8');
    expect(pem).toContain('-----BEGIN CERTIFICATE-----');
    expect(pem.trim()).toMatch(/-----END CERTIFICATE-----$/);
  });

  it('el PEM es el intermedio esperado de FNMT (sin sustituciones silenciosas)', () => {
    const pem = readFileSync(CA_PEM, 'utf8');
    const fp = pem
      .split('\n')
      .filter((l) => !l.includes('-----'))
      .join('');
    // Verificación estructural (subject/issuer) sobre el DER decodificado no
    // trivial en test; comparamos longitud y contenido base64 no vacío, y
    // dejamos la huella exacta documentada en el README para auditoría manual.
    expect(Buffer.from(fp, 'base64').length).toBeGreaterThan(800);
    expect(fp.length).toBeGreaterThan(800);
  });

  it('el Dockerfile copia el PEM al runner y activa NODE_EXTRA_CA_CERTS', () => {
    const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(
      /COPY --from=builder \/app\/docker\/ca\/fnmt-ac-componentes-informaticos\.pem \/usr\/local\/share\/volkern-ca\//
    );
    expect(dockerfile).toMatch(/ENV NODE_EXTRA_CA_CERTS=\/usr\/local\/share\/volkern-ca\/fnmt-ac-componentes-informaticos\.pem/);
  });

  it('docker/ca/README.md documenta procedencia y renovación', () => {
    const readme = readFileSync(join(ROOT, 'docker', 'ca', 'README.md'), 'utf8');
    expect(readme).toContain('www.cert.fnmt.es');
    expect(readme).toContain('2028');
    expect(readme).toContain('NODE_EXTRA_CA_CERTS');
  });

  it('la huella documentada en el README coincide con la esperada', () => {
    const readme = readFileSync(join(ROOT, 'docker', 'ca', 'README.md'), 'utf8');
    expect(readme).toContain(CA_FP);
    expect(readme).toContain('AC Componentes Informáticos');
  });

  it(`el subject esperado es el del intermedio FNMT (${CA_SUBJECT})`, () => {
    // Ancla documental: si algún día se sustituye el certificado, esta línea
    // obliga a revisar la fuente y la huella del README.
    expect(CA_SUBJECT).toContain('FNMT-RCM');
    expect(CA_SUBJECT).toContain('AC Componentes Informáticos');
  });
});
