/**
 * Lectura de secretos obligatorios.
 *
 * Un fallback escrito en el repositorio es peor que un arranque fallido: firma
 * tokens con una clave pública. Cada módulo pide aquí su variable y el error
 * dice exactamente cuál falta, en vez de repetir el mismo lector seis veces.
 */
export function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`${nombre} no está configurado`);
  return valor;
}
