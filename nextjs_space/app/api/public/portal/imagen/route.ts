import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import {
  anchoImagenPortal,
  esHostDeImagenPermitido,
  hostsDeImagenPermitidos,
} from '@/lib/real-estate/portal-imagenes';

/**
 * GET /api/public/portal/imagen?w=640&url=https://…
 *
 * Variante redimensionada de una foto del portal: WebP, ancho pedido y caché
 * inmutable. Existe porque el proyecto sirve las imágenes sin optimizador de
 * Next (`images.unoptimized`), así que el `srcset` necesita alguien que genere
 * las variantes.
 *
 * Si algo falla (host no permitido, timeout, formato raro) se redirige a la foto
 * original: la página nunca se queda sin imagen por culpa del optimizador.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PESO_MAXIMO = 15 * 1024 * 1024;
const CACHE_MAXIMA = 120;
const cache = new Map<string, { cuerpo: Buffer; tipo: string }>();

function respuesta(cuerpo: Buffer, tipo: string): NextResponse {
  return new NextResponse(new Uint8Array(cuerpo), {
    headers: {
      'Content-Type': tipo,
      'Content-Length': String(cuerpo.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

function original(url: string): NextResponse {
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function guardar(clave: string, cuerpo: Buffer, tipo: string): void {
  if (cache.size >= CACHE_MAXIMA) {
    const primera = cache.keys().next().value;
    if (primera) cache.delete(primera);
  }
  cache.set(clave, { cuerpo, tipo });
}

export async function GET(req: NextRequest) {
  const url = (req.nextUrl.searchParams.get('url') || '').trim();
  const ancho = anchoImagenPortal(req.nextUrl.searchParams.get('w'));

  if (!url || !ancho) {
    return NextResponse.json({ error: 'Faltan url o w válidos' }, { status: 400 });
  }

  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return NextResponse.json({ error: 'URL no válida' }, { status: 400 });
  }

  // Sólo https y hosts conocidos: el endpoint no puede convertirse en un proxy
  // hacia la red interna ni hacia URLs con credenciales.
  if (destino.protocol !== 'https:' || destino.username || destino.password) {
    return NextResponse.json({ error: 'Sólo se admiten URLs https' }, { status: 400 });
  }
  if (!esHostDeImagenPermitido(destino.hostname, hostsDeImagenPermitidos(req.nextUrl.hostname))) {
    return NextResponse.json({ error: 'Host no permitido' }, { status: 403 });
  }

  const clave = `${ancho}|${destino.toString()}`;
  const guardada = cache.get(clave);
  if (guardada) return respuesta(guardada.cuerpo, guardada.tipo);

  try {
    const remota = await fetch(destino, {
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      headers: { Accept: 'image/*' },
    });

    const tipo = (remota.headers.get('content-type') || '').toLowerCase();
    if (!remota.ok || !tipo.startsWith('image/') || tipo.includes('svg')) {
      return original(url);
    }

    const bytes = Buffer.from(await remota.arrayBuffer());
    if (bytes.byteLength > PESO_MAXIMO) return original(url);

    const optimizada = await sharp(bytes)
      .rotate()
      .resize({ width: ancho, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 72 })
      .toBuffer();

    guardar(clave, optimizada, 'image/webp');
    return respuesta(optimizada, 'image/webp');
  } catch {
    // Timeout, 404 o formato que sharp no entiende: se sirve la original.
    return original(url);
  }
}
