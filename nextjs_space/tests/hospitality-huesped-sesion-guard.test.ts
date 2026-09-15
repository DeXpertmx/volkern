// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * El vínculo del huésped tiene que **viajar** con el usuario autenticado.
 *
 * `alcanceDeReservas` decide con `user.contactId` si el rol Huésped ve «solo lo
 * suyo» o nada. La regla siempre fue correcta: el defecto estaba un paso antes,
 * en la autenticación, que **leía** `contactId` de la base y lo dejaba fuera del
 * objeto que devolvía. El resultado era el peor de los posibles: el huésped
 * entraba, no veía ninguna reserva y no había ningún error que mirar.
 *
 * Por eso esta guardia mira la frontera, no la regla: cada objeto de usuario que
 * la autenticación entrega tiene que llevar su `contactId`, y cada lectura de
 * identidad tiene que pedirlo.
 */

const FUENTE = readFileSync(resolve(__dirname, '..', 'lib', 'api-key-auth.ts'), 'utf8');

/** Los literales `user: { … }` que la autenticación devuelve. */
function usuariosDevueltos(): string[] {
  const bloques: string[] = [];
  let desde = 0;
  for (;;) {
    const inicio = FUENTE.indexOf('user: {', desde);
    if (inicio === -1) break;
    // El literal termina en la primera llave de cierre seguida de coma al mismo
    // nivel; como estos objetos son planos, basta con la primera línea `},`.
    const fin = FUENTE.indexOf('\n        },', inicio) !== -1 && FUENTE.indexOf('\n        },', inicio) < inicio + 1200
      ? FUENTE.indexOf('\n        },', inicio)
      : FUENTE.indexOf('\n      },', inicio);
    bloques.push(FUENTE.slice(inicio, fin === -1 ? inicio + 600 : fin));
    desde = inicio + 6;
  }
  return bloques;
}

describe('el vínculo del huésped viaja con el usuario autenticado', () => {
  it('todo usuario que la autenticación devuelve lleva su contactId', () => {
    const devueltos = usuariosDevueltos();
    expect(devueltos.length).toBeGreaterThanOrEqual(2);

    for (const bloque of devueltos) {
      expect(bloque).toMatch(/id:/);
      expect(bloque).toMatch(/contactId/);
    }
  });

  it('los usuarios con accountType —los que pasan por la regla de tenant— no son la excepción', () => {
    const conTenant = usuariosDevueltos().filter((b) => b.includes('accountType'));
    expect(conTenant.length).toBeGreaterThanOrEqual(2);
    for (const bloque of conTenant) {
      expect(bloque).toMatch(/contactId/);
    }
  });

  it('cada lectura de identidad pide el contacto', () => {
    // Las dos formas en las que la autenticación carga un usuario de Volkern: la
    // sesión y la API key. Si alguna deja de pedir `contactId`, el huésped
    // vuelve a ver cero reservas sin que nada falle. (El cliente del portal —
    // `erp_customer_users`, que ni siquiera tiene `name`— no es un huésped.)
    const selecciones = FUENTE.match(/select:\s*\{[^}]*name: true[^}]*\}/g) ?? [];
    expect(selecciones.length).toBeGreaterThanOrEqual(2);
    for (const seleccion of selecciones) {
      expect(seleccion).toMatch(/contactId: true/);
    }
  });

  it('el ámbito del huésped sigue resolviéndose con ese campo', () => {
    expect(FUENTE).not.toMatch(/contactId:\s*undefined/);
    // Y el módulo de permisos lo lee de ahí, no de otro sitio.
    const permisos = readFileSync(resolve(__dirname, '..', 'lib', 'hospitality', 'permissions.ts'), 'utf8');
    expect(permisos).toMatch(/contactId\?: string \| null/);
  });
});
