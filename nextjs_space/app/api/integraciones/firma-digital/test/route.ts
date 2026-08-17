export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/core/crypto';

const MASK = '••••••••••••••••';
const TIMEOUT_MS = 8000;

interface CheckResult {
  ok: boolean;
  detail: string;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/**
 * Prueba de conexión no destructiva contra la instancia LibreSign del tenant:
 *  1. Host: GET a la URL base (cualquier respuesta HTTP = alcanzable)
 *  2. Nextcloud: GET /status.php (LibreSign corre sobre Nextcloud; devuelve JSON con versión)
 *  3. API + token: GET /index.php/apps/libresign/api/v1.0/file/list con Bearer token.
 *     200 = token válido · 401 = token rechazado · 404/405 = API viva pero ruta distinta
 * Nunca crea documentos ni envía firmas.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const body = await req.json();
    const stored = await prisma.clientSignatureSettings.findUnique({
      where: { tenantId: user.tenantId }
    });

    // URL: la del formulario, o la guardada como fallback
    const url = (body.url || stored?.url || '').trim().replace(/\/+$/, '');
    if (!url) {
      return NextResponse.json({ error: 'Indica la URL de la instancia LibreSign' }, { status: 400 });
    }

    // Token: el del formulario si es nuevo; si viene enmascarado, el descifrado guardado
    const rawToken = (body.apiToken || '').trim();
    const token = rawToken && !rawToken.includes(MASK)
      ? rawToken
      : (stored?.apiTokenEncrypted ? decrypt(stored.apiTokenEncrypted) : '');

    const checks: Record<string, CheckResult> = {};

    // ── 1. Host alcanzable ────────────────────────────────────────────
    try {
      const res = await fetchWithTimeout(url);
      checks.host = {
        ok: true,
        detail: `HTTP ${res.status} — el host responde`
      };
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        checks: {
          host: {
            ok: false,
            detail: `No se pudo conectar: ${e?.name === 'TimeoutError' ? 'tiempo de espera agotado' : e?.cause?.code || e?.message || 'error desconocido'}`
          }
        }
      }, { status: 200 });
    }

    // ── 2. ¿Es una instancia Nextcloud (LibreSign)? ──────────────────
    try {
      const statusRes = await fetchWithTimeout(`${url}/status.php`);
      const text = await statusRes.text();
      let version = '';
      try {
        const json = JSON.parse(text);
        if (json?.versionstring) version = json.versionstring;
      } catch { /* no es JSON */ }

      if (statusRes.ok && (text.includes('Nextcloud') || version)) {
        checks.nextcloud = {
          ok: true,
          detail: `Instancia Nextcloud detectada (${version || 'versión desconocida'})`
        };
      } else {
        checks.nextcloud = {
          ok: false,
          detail: `HTTP ${statusRes.status} en /status.php — no parece una instancia Nextcloud estándar`
        };
      }
    } catch {
      checks.nextcloud = {
        ok: false,
        detail: 'No se pudo comprobar /status.php (puede estar detrás de un proxy que lo bloquee)'
      };
    }

    // ── 3. API + token ────────────────────────────────────────────────
    if (token) {
      try {
        const apiRes = await fetchWithTimeout(`${url}/index.php/apps/libresign/api/v1.0/file/list`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (apiRes.status === 200) {
          checks.api = { ok: true, detail: 'Token aceptado: la API de LibreSign responde (200)' };
        } else if (apiRes.status === 401 || apiRes.status === 403) {
          checks.api = { ok: false, detail: `HTTP ${apiRes.status} — el token no fue aceptado por la API` };
        } else if (apiRes.status === 404 || apiRes.status === 405) {
          checks.api = {
            ok: true,
            detail: `HTTP ${apiRes.status} — la API responde pero con otra ruta (el host es correcto; revisa la URL de la API)`
          };
        } else {
          checks.api = { ok: false, detail: `HTTP ${apiRes.status} — respuesta inesperada de la API` };
        }
      } catch {
        checks.api = { ok: false, detail: 'No se pudo contactar la API de LibreSign' };
      }
    } else {
      checks.api = { ok: false, detail: 'Sin token: guarda primero un API token o escríbelo en el formulario' };
    }

    const allOk = checks.host.ok && (checks.nextcloud?.ok ?? false) && (checks.api?.ok ?? false);
    return NextResponse.json({ success: allOk, checks });
  } catch (error: any) {
    console.error('Error testing firma digital:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
