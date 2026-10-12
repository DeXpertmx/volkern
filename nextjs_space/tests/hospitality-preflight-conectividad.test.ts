// @vitest-environment node
//
// Guardias del preflight de credenciales de Conectividad de Canales.
//
// El módulo puro decide qué pega es válida antes de guardar, así que sus reglas
// se prueban directamente (no hay UI de por medio). Además se vigila el
// cableado, porque un preflight que no se llama no protege de nada:
// - la API rechaza antes de escribir y guarda los valores normalizados;
// - el guardado nunca recorta la contraseña (Basic Auth byte a byte);
// - la pantalla usa la misma revisión, no una copia, y bloquea el botón.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  preflightConectividad,
  resumenPreflight,
  PREFIJO_API_POR_DEFECTO,
} from '@/lib/hospitality/connectivity-preflight';

const RAIZ = path.resolve(__dirname, '..');

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

const COMPLETO = {
  baseUrl: 'https://conectividad.example.com',
  partnerId: 'socio-1234',
  username: 'hotel.api',
  password: 'S3creto!Largo',
};

describe('preflight — URL del servicio', () => {
  it('acepta el host pelado y le añade la ruta del contrato', () => {
    const r = preflightConectividad(COMPLETO);
    expect(r.ok).toBe(true);
    expect(r.urlContrato).toBe(`https://conectividad.example.com${PREFIJO_API_POR_DEFECTO}`);
  });

  it('acepta la URL del contrato tal cual y no la duplica', () => {
    const r = preflightConectividad({
      ...COMPLETO,
      baseUrl: `https://conectividad.example.com${PREFIJO_API_POR_DEFECTO}`,
    });
    expect(r.ok).toBe(true);
    expect(r.urlContrato).toBe(`https://conectividad.example.com${PREFIJO_API_POR_DEFECTO}`);
  });

  it('recorta la barra final sin cambiar el host', () => {
    const r = preflightConectividad({ ...COMPLETO, baseUrl: 'https://conectividad.example.com/' });
    expect(r.ok).toBe(true);
    expect(r.valores.baseUrl).toBe('https://conectividad.example.com');
  });

  it('rechaza una ruta distinta de la del contrato (daría 404 en el borde)', () => {
    const r = preflightConectividad({ ...COMPLETO, baseUrl: 'https://conectividad.example.com/partner/foo' });
    expect(r.ok).toBe(false);
    expect(r.bloqueantes.map((a) => a.campo)).toContain('baseUrl');
    expect(resumenPreflight(r)).toContain('URL del servicio');
  });

  it('rechaza credenciales embebidas en la URL', () => {
    const r = preflightConectividad({ ...COMPLETO, baseUrl: 'https://usuario:clave@conectividad.example.com' });
    expect(r.ok).toBe(false);
    expect(r.bloqueantes.some((a) => a.mensaje.includes('credenciales embebidas'))).toBe(true);
  });

  it('rechaza espacios, saltos de línea y comillas invisibles', () => {
    for (const mala of [
      'https://conectividad.example.com servicio',
      'https://conectividad.example.com\n',
      'https://conectividad.example.com\u200b',
      'https://conectividad.example.com?x=1',
      'https://conectividad.example.com#frag',
    ]) {
      const r = preflightConectividad({ ...COMPLETO, baseUrl: mala });
      expect(r.ok, `debería rechazar ${JSON.stringify(mala)}`).toBe(false);
    }
  });

  it('rechaza la URL vacía, y ausente solo si la alta es completa', () => {
    expect(preflightConectividad({ ...COMPLETO, baseUrl: '' }).ok).toBe(false);
    expect(preflightConectividad({ ...COMPLETO, baseUrl: '   ' }).ok).toBe(false);
    // Editar solo las credenciales no obliga a revisar la URL.
    expect(preflightConectividad({ ...COMPLETO, baseUrl: undefined }).ok).toBe(true);
    // El script de operador, que configura todo de una vez, sí la exige.
    const completa = preflightConectividad({ ...COMPLETO, baseUrl: undefined, exigirTodo: true });
    expect(completa.ok).toBe(false);
    expect(completa.bloqueantes.map((a) => a.campo)).toContain('baseUrl');
  });

  it('avisa (sin bloquear) si va por http en un host que no es local', () => {
    const r = preflightConectividad({ ...COMPLETO, baseUrl: 'http://conectividad.example.com' });
    expect(r.ok).toBe(true);
    expect(r.advertencias.some((a) => a.mensaje.includes('sin cifrado'))).toBe(true);
  });

  it('no avisa de cifrado cuando se apunta al simulador local', () => {
    const r = preflightConectividad({ ...COMPLETO, baseUrl: 'http://localhost:4500' });
    expect(r.ok).toBe(true);
    expect(r.advertencias).toEqual([]);
    expect(r.urlContrato).toBe(`http://localhost:4500${PREFIJO_API_POR_DEFECTO}`);
  });
});

describe('preflight — ID de socio', () => {
  it('acepta el identificador recortado y lo normaliza', () => {
    const r = preflightConectividad({ ...COMPLETO, partnerId: '  socio-1234  ' });
    expect(r.ok).toBe(true);
    expect(r.valores.partnerId).toBe('socio-1234');
    expect(r.advertencias.some((a) => a.campo === 'partnerId')).toBe(true);
  });

  it('rechaza espacios en medio, saltos internos y caracteres de otro campo', () => {
    for (const malo of [
      'socio 1234',
      'socio\n1234',
      'https://conectividad.example.com',
      'a@b.com',
      'usuario:clave',
    ]) {
      const r = preflightConectividad({ ...COMPLETO, partnerId: malo });
      expect(r.ok, `debería rechazar ${JSON.stringify(malo)}`).toBe(false);
    }
  });

  it('un salto de línea al final se recorta con aviso (artefacto de pegado, no contenido)', () => {
    const r = preflightConectividad({ ...COMPLETO, partnerId: 'socio-1234\n' });
    expect(r.ok).toBe(true);
    expect(r.valores.partnerId).toBe('socio-1234');
    expect(r.advertencias.some((a) => a.campo === 'partnerId')).toBe(true);
  });

  it('rechaza demasiado corto o un pegado que trae algo más', () => {
    expect(preflightConectividad({ ...COMPLETO, partnerId: 'x' }).ok).toBe(false);
    expect(preflightConectividad({ ...COMPLETO, partnerId: 'a'.repeat(65) }).ok).toBe(false);
  });

  it('avisa sin bloquear ante caracteres poco habituales', () => {
    const r = preflightConectividad({ ...COMPLETO, partnerId: 'socio+1234' });
    expect(r.ok).toBe(true);
    expect(r.advertencias.some((a) => a.mensaje.includes('poco habituales'))).toBe(true);
  });
});

describe('preflight — Basic Auth', () => {
  it('separa «usuario:contraseña» pegado entero en el campo del usuario', () => {
    const r = preflightConectividad({
      ...COMPLETO,
      username: 'hotel.api:S3creto!Largo',
      password: undefined,
    });
    expect(r.ok).toBe(true);
    expect(r.valores.username).toBe('hotel.api');
    expect(r.valores.password).toBe('S3creto!Largo');
    expect(r.advertencias.some((a) => a.campo === 'username')).toBe(true);
  });

  it('rechaza el «:» en el usuario cuando la contraseña ya está puesta', () => {
    const r = preflightConectividad({
      ...COMPLETO,
      username: 'hotel.api:otra',
      password: 'S3creto!Largo',
    });
    expect(r.ok).toBe(false);
    expect(r.bloqueantes.some((a) => a.campo === 'username')).toBe(true);
  });

  it('rechaza espacios alrededor de la contraseña (byte a byte)', () => {
    const r = preflightConectividad({ ...COMPLETO, password: 'S3creto!Largo ' });
    expect(r.ok).toBe(false);
    expect(r.bloqueantes.some((a) => a.mensaje.includes('espacio'))).toBe(true);
  });

  it('rechaza la contraseña entre comillas y con invisibles', () => {
    expect(preflightConectividad({ ...COMPLETO, password: '"S3creto!Largo"' }).ok).toBe(false);
    expect(preflightConectividad({ ...COMPLETO, password: "'S3creto!Largo'" }).ok).toBe(false);
    expect(preflightConectividad({ ...COMPLETO, password: 'S3creto\u00a0Largo' }).ok).toBe(false);
  });

  it('no recorta los espacios de dentro de la contraseña', () => {
    const r = preflightConectividad({ ...COMPLETO, password: 'S3 creto Largo' });
    expect(r.ok).toBe(true);
    expect(r.valores.password).toBe('S3 creto Largo');
  });

  it('rechaza el mismo valor en dos campos (pegado apresurado), salvo usuario==partnerId (esquema Aiosell)', () => {
    // password == username sigue siendo error de pegado apresurado.
    expect(preflightConectividad({ ...COMPLETO, password: COMPLETO.username }).ok).toBe(false);
    expect(preflightConectividad({ ...COMPLETO, password: 'socio-1234' }).ok).toBe(false);
    // username == partnerId YA NO bloquea: desde el 9-oct-2026 el proveedor
    // (Aiosell) usa el ID de socio como usuario de Basic Auth por diseño
    // (WhatsApp: «the partner id which is the username and used as partnerid
    // in the endpoints as well»). Es un aviso, no un error.
    const mismoUsuario = preflightConectividad({ ...COMPLETO, username: COMPLETO.partnerId });
    expect(mismoUsuario.ok, 'usuario==partnerId es el esquema del proveedor').toBe(true);
    expect(mismoUsuario.avisos.some((a) => a.campo === 'username' && a.gravedad === 'aviso')).toBe(true);
  });

  it('con exigirTodo un campo ausente es error; sin exigirTodo es «no se toca»', () => {
    const parcial = preflightConectividad({ password: 'S3creto!Largo' });
    expect(parcial.ok).toBe(true);

    const exigida = preflightConectividad({ password: 'S3creto!Largo', exigirTodo: true });
    expect(exigida.ok).toBe(false);
    expect(exigida.bloqueantes.map((a) => a.campo).sort()).toEqual(['baseUrl', 'partnerId', 'username']);
  });

  it('un valor que no es texto no se revisa como credencial ni rompe', () => {
    const r = preflightConectividad({ partnerId: 1234 as unknown as string, password: 'S3creto!Largo' });
    expect(r.ok).toBe(true);
    expect(r.valores.partnerId).toBeNull();
  });
});

describe('preflight — cableado (un preflight que no se llama no protege)', () => {
  it('el prefijo del contrato no se duplica entre módulos', () => {
    const fuente = leer('lib/hospitality/connectivity.ts');
    expect(fuente).toContain(`CONNECTIVITY_API_PREFIX = '${PREFIJO_API_POR_DEFECTO}'`);
  });

  it('la API valida con el preflight ANTES de guardar y guarda lo normalizado', () => {
    const fuente = leer('app/api/admin/conectividad/route.ts');
    const iPreflight = fuente.indexOf('preflightConectividad({ partnerId, username, password })');
    const iGuardar = fuente.indexOf('await saveConnectivityConfig({');
    expect(iPreflight).toBeGreaterThan(-1);
    expect(iGuardar).toBeGreaterThan(-1);
    expect(iPreflight).toBeLessThan(iGuardar);
    expect(fuente).toContain('revision.valores.partnerId');
    expect(fuente).toContain('revision.valores.password');
    // El estado del panel revisa también la URL del servidor, sin llamar a nadie.
    expect(fuente).toContain('process.env.CONNECTIVITY_BASE_URL');
    expect(fuente).toContain('preflightBaseUrl');
  });

  it('el guardado nunca recorta la contraseña', () => {
    const fuente = leer('lib/hospitality/connectivity.ts');
    expect(fuente).not.toContain('encrypt(input.password.trim())');
    expect(fuente).toContain('encrypt(password)');
    // Y sigue rechazando lo que no pasa el preflight, sin escribir nada.
    expect(fuente).toContain('if (!revision.ok)');
  });

  it('probar la conexión usa el preflight de la URL en vez de estallar', () => {
    const fuente = leer('lib/hospitality/connectivity.ts');
    expect(fuente).toContain('preflightConectividad({ baseUrl: process.env.CONNECTIVITY_BASE_URL');
    expect(fuente).toContain('urlContrato ?? getConnectivityBaseUrl()');
  });

  it('la pantalla usa la MISMA revisión y bloquea el guardado con errores', () => {
    const fuente = leer('app/admin/conectividad/page.tsx');
    expect(fuente).toContain("from '@/lib/hospitality/connectivity-preflight'");
    expect(fuente).toContain('preflightConectividad({');
    expect(fuente).toContain('disabled={saving || !revisionCredenciales.ok}');
    expect(fuente).toContain('avisosUrlServidor');
    expect(fuente).toContain('ETIQUETAS_CAMPO');
    // La pantalla no puede importar la capa con Prisma ni descifrar secretos.
    expect(fuente).not.toContain("from '@/lib/hospitality/connectivity'");
    expect(fuente).not.toContain('decrypt');
  });

  it('el script de operador exige los cuatro campos y no imprime la contraseña', () => {
    const fuente = leer('scripts/preflight-conectividad.ts');
    expect(fuente).toContain('exigirTodo: true');
    expect(fuente).toContain('--pegado');
    expect(fuente).toContain('no se imprime');
  });
});
