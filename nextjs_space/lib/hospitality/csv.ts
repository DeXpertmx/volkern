/**
 * Exportación CSV de reportes de hospitality (FASE 3.E) — módulo PURO.
 *
 * Una sola definición de CSV para todos los reportes: escape RFC 4180
 * (comillas dobles dobladas, campos entrecomillados solo cuando hacen falta),
 * separador configurable (el Excel en locale con coma decimal prefiere `;`)
 * y BOM UTF-8 opcional para que Excel respete los acentos.
 *
 * Los números van con punto decimal (formato de datos, no de pantalla).
 */

export type DelimitadorCsv = ',' | ';' | '\t';

/** Escapa un campo según RFC 4180. */
export function escaparCampoCsv(valor: unknown): string {
  if (valor == null) return '';
  let texto: string;
  if (valor instanceof Date) texto = valor.toISOString();
  else if (typeof valor === 'number') texto = Number.isFinite(valor) ? String(valor) : '';
  else texto = String(valor);

  if (/[",;\n\r\t]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function construirCsv(
  filas: Array<Record<string, unknown>>,
  opciones: { columnas?: string[]; delimitador?: DelimitadorCsv; bom?: boolean } = {},
): string {
  if (filas.length === 0) return '';
  const delimitador = opciones.delimitador || ',';
  const columnas = opciones.columnas || Object.keys(filas[0]);

  const lineas: string[] = [columnas.map((c) => escaparCampoCsv(c)).join(delimitador)];
  for (const fila of filas) {
    lineas.push(columnas.map((c) => escaparCampoCsv(fila[c])).join(delimitador));
  }
  const cuerpo = lineas.join('\r\n');
  return opciones.bom ? `\uFEFF${cuerpo}` : cuerpo;
}

/** Nombre de archivo de reporte con fecha UTC: reporte-operacion-2026-09-17.csv */
export function nombreArchivoReporte(tipo: string, hasta: Date = new Date()): string {
  const fecha = hasta.toISOString().slice(0, 10);
  return `reporte-${tipo}-${fecha}.csv`;
}

/** Dispara la descarga de un CSV en el navegador (cliente). */
export function descargarCsv(nombre: string, contenido: string): void {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
