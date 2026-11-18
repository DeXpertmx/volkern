/**
 * Generador de PDF compartido — STUB: no genera PDFs reales.
 *
 * Devuelve solo la cabecera `%PDF-1.4` (8 bytes), así que ningún visor puede
 * abrir el resultado. Existe para no arrastrar puppeteer al build (no está
 * disponible en Workers) mientras las rutas que lo usan mantienen su flujo.
 *
 * Rutas que hoy sirven un PDF inválido:
 *   · GET  /api/cotizaciones/[id]/pdf
 *   · GET  /api/cotizaciones/public/[id]/pdf
 *   · GET  /api/ordenes-venta/[id]/pdf
 *   · GET  /api/contratos/public/[id]/pdf
 *   · POST /api/contratos/[id]/volkernsign · envía el archivo a firmar
 *   · GET  /api/compliance/certificate-pdf
 *   · GET  /api/invoices/[id]/pdf
 *   · POST /api/invoices/[id]/send-email · lo adjunta al correo
 *
 * Contrato para la implementación real: mismo `PdfOptions` y PDF completo en
 * `Buffer` (nunca una data URI), porque el resultado va a `NextResponse`, a los
 * adjuntos de correo y al servicio de firma.
 */
export interface PdfOptions {
  filename?: string;
  format?: 'A4' | 'Letter';
  margin?: {
    top?: number | string;
    bottom?: number | string;
    left?: number | string;
    right?: number | string;
  };
  printBackground?: boolean;
}

export const generatePdf = async (_html: string, _options?: PdfOptions): Promise<Buffer> => {
  return Buffer.from('%PDF-1.4');
};
