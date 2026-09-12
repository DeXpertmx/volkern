import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardia de la moneda del tenant en la sesión de API.
 *
 * `Tenant.moneda` es la fuente autoritativa de la divisa por defecto de
 * Hospitality. Todas las superficies la leen de `auth.tenant.moneda`, así que si
 * alguien añade un camino de autenticación sin incluir el campo —o lo quita de un
 * `select`— el respaldo se degrada en silencio a los valores por defecto del
 * esquema, que es exactamente el fallo que esta corrección elimina.
 *
 * Se comprueba sobre el código fuente porque `lib/api-key-auth.ts` no exporta la
 * resolución jerárquica ni se puede ejercitar sin levantar Next entero; el
 * objetivo es detectar la omisión, no volver a probar Prisma.
 */

const FUENTE = readFileSync(join(process.cwd(), 'lib', 'api-key-auth.ts'), 'utf8').split('\n');

/** Selecciones de tenant: piden nombre y slug, así que se reconocen sin ambigüedad. */
function seleccionesDeTenant(): Array<{ linea: number; texto: string }> {
  return FUENTE.map((texto, i) => ({ linea: i + 1, texto })).filter(
    ({ texto }) =>
      texto.includes('select: {') &&
      texto.includes('nombre: true') &&
      texto.includes('slug: true')
  );
}

describe('la sesión de API expone Tenant.moneda', () => {
  it('encuentra las selecciones de tenant del archivo (la guardia no se autoengaña)', () => {
    // Si un refactor cambia la forma de los selects, esta prueba falla en vez de
    // quedarse mirando cero líneas y pasar en vacío.
    expect(seleccionesDeTenant().length).toBeGreaterThanOrEqual(4);
  });

  it('todas las selecciones de tenant piden la moneda', () => {
    const sinMoneda = seleccionesDeTenant()
      .filter(({ texto }) => !texto.includes('moneda: true'))
      .map(({ linea, texto }) => `línea ${linea}: ${texto.trim()}`);

    expect(sinMoneda).toEqual([]);
  });

  it('el contexto jerárquico arrastra la moneda del tenant de destino', () => {
    // Al impersonar (Superadmin o agencia sobre sus slots) la divisa debe ser la
    // del tenant visitado, no la del que entra.
    expect(FUENTE.some((l) => l.includes('moneda: requesterTenant.moneda'))).toBe(true);
    expect(FUENTE.some((l) => l.includes('moneda: impTenant.moneda'))).toBe(true);
  });

  it('el tipo del resultado declara la moneda para quien la consume', () => {
    expect(FUENTE.some((l) => l.includes('moneda?: string | null'))).toBe(true);
  });

  it('las superficies de Hospitality la leen de la sesión, no de una constante', () => {
    const superficies = [
      'app/api/hospitality/units/route.ts',
      'app/api/hospitality/rateplans/route.ts',
      'app/api/hospitality/reservations/route.ts',
    ];
    for (const ruta of superficies) {
      const fuente = readFileSync(join(process.cwd(), ruta), 'utf8');
      expect(fuente, `${ruta} no usa auth.tenant.moneda`).toContain('auth.tenant!.moneda');
    }
  });
});
