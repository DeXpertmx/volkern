/**
 * PDF Generator stub — used by several API routes for PDF generation.
 * Keep this file light: the implantacion-alta flow does not depend on it.
 * If a real PDF service is needed, replace this with a proper implementation
 * that does not import puppeteer (which is not available in Workers).
 */
export const generatePdf = async (html: string, options?: {
  filename?: string;
  format?: 'A4' | 'Letter';
  margin?: { top?: number; bottom?: number; left?: number; right?: number };
}) => {
  // Stub: return a placeholder Base64-encoded PDF header.
  // The real implementation would use Puppeteer or a similar library.
  const placeholderPdf = Buffer.from('%PDF-1.4').toString('base64');
  return `data:application/pdf;base64,${placeholderPdf}`;
};