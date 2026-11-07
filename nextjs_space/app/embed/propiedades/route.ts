import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /embed/propiedades?tenantId=...
 *
 * Página mínima (HTML plano, sin React) que carga el widget real de
 * propiedades con la configuración elegida en el panel. Se usa como iframe de
 * vista previa dentro del dashboard, de modo que el cliente ve exactamente el
 * resultado antes de pegar el código.
 *
 * Es un Route Handler y no una página de React a propósito: el widget escribe
 * dentro de su contenedor en cuanto se ejecuta, y si ese contenedor lo hubiera
 * renderizado React la hidratación fallaría (error #418) al encontrar hijos que
 * no existían en el HTML del servidor.
 *
 * Es pública (el middleware deja pasar `/embed/`) porque no expone nada que la
 * API pública de propiedades no devuelva ya.
 */

const ATRIBUTOS_PERMITIDOS = [
  'titulo',
  'subtitulo',
  'color',
  'limite',
  'operacion',
  'ciudad',
  'estado',
  'moneda',
] as const;

function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function documento(contenido: string): Response {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Vista previa · Widget de propiedades</title>
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  main { padding: 28px 20px; }
  .envoltorio { max-width: 1024px; margin: 0 auto; }
  .aviso { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #64748b; text-align: center; padding: 64px 0; }
</style>
</head>
<body>
<main><div class="envoltorio">${contenido}</div></main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tenantId = (params.get('tenantId') || '').trim();

  if (!tenantId) {
    return documento(
      '<p class="aviso">Falta el identificador de la cuenta (tenantId) para generar la vista previa.</p>'
    );
  }

  const atributos = [`data-tenant-id="${escapar(tenantId)}"`];

  for (const nombre of ATRIBUTOS_PERMITIDOS) {
    const valor = (params.get(nombre) || '').trim();
    if (valor) atributos.push(`data-${nombre}="${escapar(valor)}"`);
  }

  if (params.get('modo') === 'lista') atributos.push('data-modo="lista"');
  if (params.get('destacadas') === '1') atributos.push('data-solo-destacadas="true"');
  if (params.get('verTodas') === '0') atributos.push('data-ver-todas="false"');
  if (params.get('filtros') === '0') atributos.push('data-filtros="false"');

  return documento(
    `<div id="volkern-propiedades"></div>\n<script src="/propiedades-embed.js?v=3" ${atributos.join(' ')}></script>`
  );
}
