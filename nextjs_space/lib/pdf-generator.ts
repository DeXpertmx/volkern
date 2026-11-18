/**
 * PDF Generator stub — used by several API routes for PDF generation.
 * Keep this file light: the implantacion-alta flow does not depend on it.
 * If a real PDF service is needed, replace this with a proper implementation
 * that does not import puppeteer (which is not available in Workers).
 *
 * Contrato: devuelve los bytes del PDF (`Buffer`), que es lo que consumen
 * `NextResponse`, los adjuntos de correo y la firma electrónica. Los márgenes
 * se aceptan como número o como unidad CSS ("20mm"), que es como los escriben
 * las rutas.
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

export const generatePdf = async (html: string, options?: PdfOptions): Promise<Buffer> => {
  void html;
  void options;
  // Stub: cabecera PDF mínima. Una implementación real debe devolver Buffer.
  return Buffer.from('%PDF-1.4');
};
