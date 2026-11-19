/**
 * Generador de PDF compartido: HTML → PDF con el Chromium del contenedor.
 *
 * Los callers pasan HTML autocontenido (facturas, cotizaciones, contratos,
 * órdenes, certificados) y reciben los bytes del PDF en `Buffer`, que es lo que
 * consumen `NextResponse`, los adjuntos de correo y el servicio de firma.
 *
 * Se usa el binario de Chromium (`CHROME_PATH`, o el que instala el Dockerfile
 * en /usr/bin/chromium) en modo headless con `--print-to-pdf`: no hace falta
 * puppeteer ni ninguna dependencia de npm, y el navegador ya está en la imagen.
 * Es un proceso por documento; los PDF no son un camino caliente y conviene
 * aislar una renderización de otra.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

/** Candidatos de binario, en orden: el del contenedor primero. */
const CANDIDATOS_CHROME = [
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter((ruta): ruta is string => Boolean(ruta));

function rutaChrome(): string {
  const encontrada = CANDIDATOS_CHROME.find((ruta) => existsSync(ruta));
  if (!encontrada) {
    throw new Error(
      'No hay Chromium disponible para generar el PDF: define CHROME_PATH o instala chromium en la imagen.'
    );
  }
  return encontrada;
}

function aUnidadCss(valor: number | string | undefined, porDefecto: string): string {
  if (valor === undefined || valor === '') return porDefecto;
  return typeof valor === 'number' ? `${valor}px` : valor;
}

/**
 * Chromium no acepta márgenes por argumento: el tamaño y los márgenes de
 * página salen de `@page`, y el fondo se imprime si se pide con
 * `print-color-adjust`. Se inyecta en el `<head>` para no depender de que el
 * HTML de cada documento los traiga.
 */
function prepararHtml(html: string, options?: PdfOptions): string {
  const tamano = options?.format === 'Letter' ? 'Letter' : 'A4';
  const margen = options?.margin ?? {};
  const margenes = [
    aUnidadCss(margen.top, '20mm'),
    aUnidadCss(margen.right, '15mm'),
    aUnidadCss(margen.bottom, '20mm'),
    aUnidadCss(margen.left, '15mm'),
  ].join(' ');

  const estilos = [
    '<style>',
    `@page { size: ${tamano}; margin: ${margenes}; }`,
    // Los documentos traen cabeceras y badges con fondo: sin esto Chromium los
    // imprime en blanco aunque printBackground sea true.
    'html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '</style>',
  ].join('');

  return html.includes('</head>')
    ? html.replace('</head>', `${estilos}</head>`)
    : estilos + html;
}

/** Lanza Chromium y espera a que escriba el PDF (o falla con su stderr). */
function ejecutarChrome(binario: string, htmlPath: string, pdfPath: string): Promise<void> {
  const argumentos = [
    '--headless',
    '--disable-gpu',
    // El contenedor corre como root y sin namespaces de usuario: sin esto
    // Chromium aborta al arrancar.
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ];

  return new Promise((resolve, reject) => {
    const proceso = spawn(binario, argumentos, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proceso.stderr.on('data', (trozo) => {
      stderr += trozo.toString();
    });

    const temporizador = setTimeout(() => {
      proceso.kill('SIGKILL');
      reject(new Error('Chromium tardó más de 45 s en generar el PDF'));
    }, 45_000);

    proceso.on('error', (error) => {
      clearTimeout(temporizador);
      reject(new Error(`No se pudo ejecutar Chromium (${binario}): ${error.message}`));
    });

    proceso.on('close', (codigo) => {
      clearTimeout(temporizador);
      if (codigo === 0) return resolve();
      reject(new Error(`Chromium salió con código ${codigo}: ${stderr.slice(-500) || 'sin detalle'}`));
    });
  });
}

export const generatePdf = async (html: string, options?: PdfOptions): Promise<Buffer> => {
  const binario = rutaChrome();
  const directorio = await mkdtemp(join(tmpdir(), 'volkern-pdf-'));

  try {
    const htmlPath = join(directorio, 'documento.html');
    const pdfPath = join(directorio, 'documento.pdf');

    await writeFile(htmlPath, prepararHtml(html, options), 'utf8');
    await ejecutarChrome(binario, htmlPath, pdfPath);

    const pdf = await readFile(pdfPath);
    // Un PDF válido empieza por "%PDF-": mejor fallar aquí que devolver bytes
    // vacíos a la descarga, al correo o a la firma.
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error('Chromium no generó un PDF válido (falta la cabecera %PDF-)');
    }
    return pdf;
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
};
