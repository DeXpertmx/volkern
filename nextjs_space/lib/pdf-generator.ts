/**
 * PDF Generator — reemplaza el servicio HTML→PDF de Abacus AI
 * Usa Puppeteer-core con Chrome del sistema para conversión local
 *
 * Ahorro estimado: ~300MB (evita empaquetar Chromium en el build)
 */
import puppeteer, { Browser, Page } from 'puppeteer-core';

const CHROME_PATH =
  process.env.CHROME_PATH ||
  '/usr/bin/google-chrome';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    return browserInstance;
  }
  browserInstance = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  return browserInstance;
}

export interface PdfOptions {
  format?: 'A4' | 'Letter' | 'Legal';
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  printBackground?: boolean;
  landscape?: boolean;
}

const defaultOptions: PdfOptions = {
  format: 'A4',
  margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
  printBackground: true,
};

/**
 * Convierte HTML a PDF y devuelve un Buffer
 */
export async function generatePdf(
  htmlContent: string,
  options: PdfOptions = {}
): Promise<Buffer> {
  const browser = await getBrowser();
  const page: Page = await browser.newPage();

  try {
    const mergedOptions = { ...defaultOptions, ...options };

    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const pdfBuffer = await page.pdf({
      format: mergedOptions.format as any,
      margin: mergedOptions.margin,
      printBackground: mergedOptions.printBackground,
      landscape: mergedOptions.landscape,
      preferCSSPageSize: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

/**
 * Cierra el navegador (útil para graceful shutdown)
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
