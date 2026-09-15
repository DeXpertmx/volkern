// @vitest-environment node

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * El nombre del rol no autoriza nada en la plataforma.
 *
 * Hospitality ya vive bajo esta regla (`tests/hospitality-roles.test.ts`): los
 * roles del producto —Anfitrión, Agente, Limpieza…— hacen absurdo decidir por
 * una etiqueta que el cliente puede renombrar o reutilizar. El mismo defecto
 * estaba fuera del módulo, y de la forma más silenciosa: cambiar el modo de
 * compliance, escribir la marca de la cuenta y ver el cockpit financiero
 * consolidado se concedían a quien se llamara «Admin», y el propietario de la
 * cuenta los perdía en cuanto su rol se llamaba distinto.
 *
 * Esta guardia recorre el código real y falla si el patrón vuelve a aparecer.
 * Las excepciones están enumeradas a mano, cada una con su motivo: si alguien
 * añade otra, tiene que poder explicar por qué su caso no es este defecto.
 *
 * Sobre «Superadmin»: compararse con él **no** es este defecto. El propietario
 * de la plataforma no es un rol que un cliente pueda crear ni renombrar, y su
 * acceso no viene de un permiso sino de un bypass explícito que vive en un solo
 * sitio (`lib/permissions-core.ts`). Por eso los patrones lo excluyen: una
 * comparación con Superadmin a secas no autoriza nada a nadie que el cliente
 * pueda fabricar, y el bypass ya tiene su propia prueba.
 */

const RAIZ = path.resolve(__dirname, '..');

/** Dónde se busca: el código que entrega respuestas y decide permisos. */
const RAICES = ['lib', 'app/api', 'components'];

const PATRONES: { que: string; re: RegExp }[] = [
  // El defecto en su forma exacta: comparar el nombre contra una etiqueta de
  // rol de cliente. «Superadmin» se trata aparte, en la comprobación siguiente.
  { que: 'comparación contra el nombre del rol', re: /role\??\.nombre\s*===\s*['"](?!Superadmin)[^'"]+['"]/ },
  { que: 'comparación del roleName de sesión', re: /roleName\s*===\s*['"](?!Superadmin)[^'"]+['"]/ },
  { que: 'lista de nombres que autorizan', re: /ROLES_CON_[A-Z_]+/ },
];

/**
 * Excepciones por archivo entero: archivos que **son** el paso de herencia o
 * una regla sobre el vocabulario del sistema, no una autorización.
 */
const EXCEPCIONES_ARCHIVO: Record<string, string> = {
  'lib/hospitality/roles-rollout.ts':
    'es el paso que copia una sola vez el privilegio que se tenía por nombre; después deja de existir para siempre',
  'app/api/roles/[id]/route.ts':
    'protege los roles del vocabulario de la plataforma contra borrado; es una regla sobre el sistema, no una autorización',
};

/**
 * Excepciones por línea: deuda medida y documentada, no un permiso para crecer.
 * La clave es `archivo:línea`, así que si el código se mueve la excepción deja
 * de aplicar y la guardia vuelve a avisar.
 */
const EXCEPCIONES_LINEA: { archivo: string; linea: number; porque: string }[] = [
  {
    archivo: 'lib/permissions-core.ts',
    linea: 289,
    porque:
      'deuda heredada del CRM: «Sales Agent» y «Support» solo ven sus propios leads, y hoy no existe el permiso que lo exprese. Convertirlo es un cambio de comportamiento con datos de clientes dentro, así que se documenta en vez de esconderse',
  },
];

function* fuentes(dir: string): Generator<string> {
  const absoluto = path.join(RAIZ, dir);
  if (!fs.existsSync(absoluto)) return;
  for (const entrada of fs.readdirSync(absoluto, { withFileTypes: true })) {
    const relativo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) yield* fuentes(relativo);
    else if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) yield relativo;
  }
}

function esComentario(linea: string): boolean {
  const limpia = linea.trim();
  return (
    limpia.startsWith('//') ||
    limpia.startsWith('*') ||
    limpia.startsWith('/*') ||
    limpia.startsWith('*/')
  );
}

function excepcionDeLinea(archivo: string, linea: number): boolean {
  return EXCEPCIONES_LINEA.some((e) => e.archivo === archivo && e.linea === linea);
}

describe('el nombre del rol no autoriza nada fuera de Hospitality', () => {
  it('recorre el código real de la plataforma', () => {
    let total = 0;
    for (const raiz of RAICES) for (const _ of fuentes(raiz)) total += 1;
    expect(total).toBeGreaterThan(50);
  });

  it('ninguna autorización decide por el nombre de un rol de cliente', () => {
    const hallazgos: string[] = [];

    for (const raiz of RAICES) {
      for (const archivo of fuentes(raiz)) {
        const clave = archivo.replace(/\\/g, '/');
        if (EXCEPCIONES_ARCHIVO[clave]) continue;
        const lineas = fs.readFileSync(path.join(RAIZ, archivo), 'utf8').split('\n');
        lineas.forEach((linea, i) => {
          if (esComentario(linea)) return;
          if (excepcionDeLinea(clave, i + 1)) return;
          for (const patron of PATRONES) {
            if (patron.re.test(linea)) {
              hallazgos.push(`${archivo}:${i + 1} — ${patron.que}: ${linea.trim().slice(0, 100)}`);
            }
          }
        });
      }
    }

    expect(
      hallazgos,
      'Autorizar por el nombre del rol es conceder permisos a una etiqueta que el cliente ' +
        'puede renombrar o reutilizar. Resuélvelo con un permiso del módulo correspondiente ' +
        '(módulo.accion) y concede ese permiso a los roles que lo necesiten. Si tu caso es ' +
        'realmente distinto, documéntalo en EXCEPCIONES_ARCHIVO o EXCEPCIONES_LINEA con el motivo.'
    ).toEqual([]);
  });

  it('las excepciones por línea siguen apuntando a la línea que dicen', () => {
    for (const excepcion of EXCEPCIONES_LINEA) {
      const lineas = fs
        .readFileSync(path.join(RAIZ, excepcion.archivo), 'utf8')
        .split('\n');
      const linea = lineas[excepcion.linea - 1] ?? '';
      expect(
        linea,
        `${excepcion.archivo}:${excepcion.linea} ya no es la excepción documentada (${excepcion.porque}). Actualiza la línea o retírala si el defecto ya no existe.`
      ).toMatch(/Sales Agent|Support/);
    }
  });

  it('las puertas convertidas resuelven con el permiso, no con el nombre', () => {
    const puertas = [
      'app/api/tenant/compliance-mode/route.ts',
      'app/api/whitelabel/route.ts',
      'lib/security/finance-guard.ts',
    ];

    for (const archivo of puertas) {
      const texto = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        if (esComentario(linea)) return;
        for (const patron of PATRONES) {
          expect(
            patron.re.test(linea),
            `${archivo}:${i + 1} volvió a decidir por nombre de rol`
          ).toBe(false);
        }
      });
      // Y resuelven con la llave de administración de la cuenta.
      expect(texto).toMatch(/configuracion['"],\s*['"]gestionar/);
    }
  });
});
