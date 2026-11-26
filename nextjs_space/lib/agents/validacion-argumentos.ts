/**
 * Validación de argumentos contra el esquema del registro de herramientas.
 *
 * El esquema que publica el registro es el contrato: un paso que inventa el
 * nombre de un campo («destinatario» en vez de «nombre», «contenido» en vez de
 * «mensaje») o que manda un tipo que la herramienta no espera se detecta antes
 * de ejecutar, en los tests y en producción, en vez de que la skill lo ignore
 * en silencio.
 *
 * Se valida lo que el contrato declara: campos obligatorios, tipo de cada campo
 * y campos desconocidos cuando el esquema prohíbe propiedades adicionales. Los
 * enums y el interior de arrays/objetos quedan fuera: las variantes de escritura
 * del catálogo harían fallar pasos legítimos.
 */
import type { DefinicionHerramienta } from './tool-registry';

/**
 * Claves que añade la capa de ejecución (identidad, origen), no el plan ni el
 * modelo: no forman parte del argumento de la herramienta y no se validan.
 */
const CLAVES_INTERNAS = new Set(['tenantId', 'userId', 'source']);

/** La herramienta recibió argumentos que su esquema no admite. */
export class ArgumentosInvalidosError extends Error {
  constructor(
    readonly herramienta: string,
    readonly problemas: string[]
  ) {
    super(`Argumentos inválidos para ${herramienta}: ${problemas.join('; ')}`);
    this.name = 'ArgumentosInvalidosError';
  }
}

function tipoDe(valor: unknown): string {
  if (Array.isArray(valor)) return 'array';
  if (valor === null) return 'null';
  if (typeof valor === 'number') return Number.isInteger(valor) ? 'integer' : 'number';
  return typeof valor;
}

/** ¿Encaja el valor con el tipo JSON declarado por el esquema? */
function encaja(valor: unknown, esperado: string | undefined): boolean {
  if (!esperado) return true;
  const real = tipoDe(valor);
  if (esperado === 'number') {
    // Los wrappers ya aceptan importes como texto («250000»): se tolera.
    return real === 'number' || real === 'integer' || (real === 'string' && Number.isFinite(Number(valor)));
  }
  if (esperado === 'integer') {
    return real === 'integer' || (real === 'string' && Number.isInteger(Number(valor)));
  }
  return real === esperado;
}

/**
 * Problemas de `args` frente al esquema de la definición. Lista vacía = válido.
 */
export function validarArgumentos(
  definicion: DefinicionHerramienta,
  args: Record<string, any>
): string[] {
  const esquema = (definicion.parametros ?? {}) as Record<string, any>;
  const propiedades = (esquema.properties ?? {}) as Record<string, Record<string, any>>;
  const problemas: string[] = [];

  for (const requerida of (esquema.required ?? []) as string[]) {
    const valor = args[requerida];
    if (valor === undefined || valor === null || valor === '') {
      problemas.push(`falta el campo obligatorio «${requerida}»`);
    }
  }

  for (const [clave, valor] of Object.entries(args)) {
    if (valor === undefined || valor === null) continue;
    if (CLAVES_INTERNAS.has(clave)) continue;

    const propiedad = propiedades[clave];
    if (!propiedad) {
      if (esquema.additionalProperties === false) {
        problemas.push(`campo desconocido «${clave}»`);
      }
      continue;
    }

    if (!encaja(valor, propiedad.type)) {
      problemas.push(`«${clave}» debe ser ${propiedad.type} y llegó ${tipoDe(valor)}`);
    }
  }

  return problemas;
}
