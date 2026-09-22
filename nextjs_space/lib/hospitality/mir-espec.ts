/**
 * Catálogo puro de códigos de retorno del servicio MIR (SESHospedajes)
 * — apartado 5 de la especificación v3.1.2.
 *
 * Vive en su propio módulo PURO para que la UI (parte-rechazo.ts, que
 * muestran las páginas de cliente) pueda traducir un código de rechazo a
 * texto sin arrastrar `node:zlib` —el ZIP del sobre— al bundle del
 * navegador. `registro-viajeros.ts` (el módulo con el XML y la compresión)
 * reexporta todo esto para que los consumidores existentes no cambien.
 *
 * Si el servicio añade códigos nuevos, se muestran tal cual sin romper.
 */
export const CODIGOS_ERROR_MIR: Record<string, string> = {
  '0': 'Ok',
  '10100': 'No ha informado el código de arrendador',
  '10101': 'No ha informado el código de aplicación',
  '10103': 'El código de arrendador no existe en el sistema',
  '10107': 'Usuario incorrecto',
  '10108': 'No ha informado la petición',
  '10109': 'No ha informado la cabecera',
  '10110': 'No ha informado la solicitud',
  '10111': 'Formato de solicitud incorrecto. Ha de ser un fichero xml en UTF-8, comprimido (zip) y codificado en Base64',
  '10112': 'No ha informado el código de la operación',
  '10113': 'El código de comunicación no existe en el sistema',
  '10116': 'No ha informado el tipo de la comunicación',
  '10117': "La operación sólo podrá tener como valores 'A', 'C' ó 'B'",
  '10118': 'Error en el formato de fichero XML',
  '10119': 'El arrendador no puede realizar ese tipo de comunicaciones',
  '10120': 'El arrendador no tiene habilitada la opción de realizar operaciones a través del servicio web',
  '10121': 'Error de validación',
  '10122': "Tipo de comunicación no válido. Valores aceptados: 'PV', 'RH', 'AV', 'RV'",
  '10128': 'El usuario no está indicado en la cabecera',
  '10130': 'Valor incorrecto para el campo',
  '10131': 'Es obligatorio indicar un valor en el campo',
  '10136': 'Se ha superado el número máximo de comunicaciones a consultar',
  '10140': 'Solicitud no informada',
  '10150': 'Se ha superado el número máximo de caracteres de la aplicación',
  '10159': 'El tipo de comunicación informado no es válido',
  '10160': 'No ha informado del código de la comunicación',
  '10180': 'El formato del código de comunicación no es valido',
  '10999': 'Error no controlado',
};

/** Descripción legible de un código de retorno (nunca falla). */
export function describirCodigoMIR(codigo: string | number | null | undefined): string {
  if (codigo === null || codigo === undefined) return 'Sin código de retorno';
  const clave = String(codigo).trim();
  return CODIGOS_ERROR_MIR[clave] ?? `Código no documentado por el servicio (${clave})`;
}

/** ¿El código de retorno confirma que la petición se recibió? */
export function esCodigoCorrectoMIR(codigo: string | number | null | undefined): boolean {
  return String(codigo ?? '').trim() === '0';
}
