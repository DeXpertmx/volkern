export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/uptime-developers
 *
 * Vigila que las páginas públicas críticas para integradores externos
 * (`/docs/developers` + `/openapi.json`) respondan 200 y contenido válido.
 * Schedule configurado en `vercel.json` → `crons[]`.
 *   - Plan Pro de Vercel: cron cada 5 minutos acepta esto sin problema.
 *   - Plan Hobby de Vercel: cron jobs solo corren 1 vez/día → cambiar
 *     schedule a `0 * * * *` (cada hora, minuto 0) en `vercel.json`.
 *
 * Comportamiento:
 *   - Auth con CRON_SECRET (Header Bearer) — solo en producción.
 *   - En Vercel Preview deployments el handler se salta los probes
 *     (`skipped: preview-env`) para no consumir cuota contra el
 *     dominio de producción ni alertar en un build que aún no es estable.
 *   - Probe en paralelo con timeout 10s por endpoint.
 *   - Primer intento usa `redirect: "manual"` (no sigue redirects CDN).
 *   - Si el primer intento recibe 3xx legítimo, retry 1 vez con
 *     `redirect: "follow"`. NO reintenta 4xx/5xx (esos siempre alertan).
 *   - Para `/openapi.json`:
 *       a) Cap body size a 256 KB antes de leer (defensa contra OOM si
 *          el spec crece sin control).
 *       b) Verifica que el body parsea como JSON con `"openapi":"3.0.3"`
 *          y al menos 1 entry en `paths` (descarta respuestas cache rotas
 *          o builds que regeneraron mal el spec).
 *   - Si hay cualquier falla → alerta cooldowned 5 min. Canales opcionales:
 *       (1) `console.warn` (siempre, para Vercel runtime logs).
 *       (2) `UPTIME_APPRISE_URL` → POST al endpoint `/notify` de Apprise.
 *       (3) Resend API → email a `process.env.ADMIN_EMAIL`.
 *   - Retorna JSON SIEMPRE (200) con timestamp + resultados. Vercel cron
 *     confirma job como ejecutado solo si recibe 2xx.
 *
 * Variables de entorno usadas:
 *   - CRON_SECRET            (requerido en producción)
 *   - VERCEL_ENV             (auto-set por Vercel: production | preview | development)
 *   - NEXT_PUBLIC_APP_URL    (default: https://volkern.app)
 *   - ADMIN_EMAIL            (destinatario Resend)
 *   - RESEND_API_KEY         (auth Resend)
 *   - UPTIME_APPRISE_URL     (opcional: URL completa prebuilt del endpoint Apprise)
 */

interface ProbeResult {
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
  /** Solo para /openapi.json: ¿el body parsea como OpenAPI 3.0.3 con paths? */
  contentValid?: boolean;
  /** Detalle de error si el probe falló (timeout, red, schema inválido, etc.) */
  error?: string;
  /** Si hubo un retry por redirect 3xx (visible en alert body). */
  retried?: boolean;
}

const PROBE_TIMEOUT_MS = 10_000;
const OPENAPI_MAX_BYTES = 256 * 1024; // 256 KB — defensa contra OOM si /openapi.json crece sin control.
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 min — evita spam si outage > 1h.
const USER_AGENT = "volkern-uptime/1.0 (volkern.app public heartbeat)";

async function probe(
  url: string,
  opts: { checkOpenApiSchema?: boolean } = {}
): Promise<ProbeResult> {
  const first = await probeOnce(url, opts, { allowRedirect: false });
  if (first.ok) {
    return first;
  }
  // Retry único para 3xx (CDN edge redirects legítimos) — no aplica a 4xx/5xx.
  if (first.status >= 300 && first.status < 400) {
    return probeOnce(url, opts, { allowRedirect: true, retried: true });
  }
  return first;
}

async function probeOnce(
  url: string,
  opts: { checkOpenApiSchema?: boolean },
  config: { allowRedirect: boolean; retried?: boolean }
): Promise<ProbeResult> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: config.allowRedirect ? "follow" : "manual",
      cache: "no-store",
      headers: { "user-agent": USER_AGENT },
    });

    let contentValid: boolean | undefined;
    if (r.ok && opts.checkOpenApiSchema && url.endsWith("/openapi.json")) {
      contentValid = await validateOpenApiBody(r);
    }

    clearTimeout(timer);
    return {
      url,
      status: r.status,
      ok: r.ok && (contentValid === undefined ? true : contentValid),
      durationMs: Date.now() - start,
      contentValid,
      retried: config.retried,
    };
  } catch (err: any) {
    clearTimeout(timer);
    const isAbort = err?.name === "AbortError";
    return {
      url,
      status: 0,
      ok: false,
      durationMs: Date.now() - start,
      error: isAbort ? `TIMEOUT_${PROBE_TIMEOUT_MS}ms` : (err?.message ?? "UNKNOWN"),
      retried: config.retried,
    };
  }
}

async function validateOpenApiBody(response: Response): Promise<boolean> {
  try {
    const ct = (response.headers.get("content-type") ?? "").toLowerCase();
    if (ct && !ct.includes("application/json")) {
      return false;
    }
    // Cap por Content-Length declarado. Previene OOM antes de .text().
    const clHeader = response.headers.get("content-length");
    if (clHeader) {
      const declared = parseInt(clHeader, 10);
      if (Number.isFinite(declared) && declared > OPENAPI_MAX_BYTES) {
        return false;
      }
    }
    const text = await response.text();
    // Cap defensivo por contenido real (por si Content-Length miente).
    if (text.length > OPENAPI_MAX_BYTES) {
      return false;
    }
    const parsed = JSON.parse(text);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.openapi === "3.0.3" &&
      typeof parsed.paths === "object" &&
      parsed.paths !== null &&
      Object.keys(parsed.paths).length > 0
    );
  } catch {
    return false;
  }
}

function formatAlertText(failures: ProbeResult[]): { title: string; body: string } {
  const title =
    failures.length === 1
      ? `🚨 Volkern public docs DOWN: ${failures[0].url}`
      : `🚨 Volkern public docs DOWN: ${failures.length} endpoints`;

  const lines = failures
    .map((f) => {
      const status = f.status ? `HTTP ${f.status}` : "no-response";
      const reason =
        f.error
          ? `${status} (${f.error})`
          : f.contentValid === false
          ? `${status} (openapi schema inválido)`
          : status;
      const tail = f.retried ? " (tras retry)" : "";
      return `• ${f.url} → ${reason}${tail} en ${f.durationMs}ms`;
    })
    .join("\n");

  const actionBlock = [
    "Acción sugerida:",
    "1. Ejecutar `vercel ls --prod` para ver el último deployment.",
    "2. Ejecutar `vercel logs <deployment-url>` para errores runtime.",
    "3. Si la regresión es reciente, `vercel rollback <prev-deployment-url>`.",
    "4. Si persiste >15min, abrir incident y ver `docs/DEPLOY.md` §Troubleshooting.",
  ].join("\n");

  const body = [
    title,
    "",
    lines,
    "",
    `Detectado:  ${new Date().toISOString()}`,
    `Ambiente:   ${process.env.NODE_ENV ?? "development"}`,
    "",
    actionBlock,
  ].join("\n");

  return { title, body };
}

async function sendAlert(failures: ProbeResult[]): Promise<void> {
  const { title, body } = formatAlertText(failures);

  // 1) Siempre log vía console — sobrevive aunque los webhooks externos fallen.
  console.warn(`[uptime-developers] ${title}\n${body}`);

  // 2) Slack/Apprise notify URL — opcional, webcall directo sin Prisma lookup.
  const appriseUrl = process.env.UPTIME_APPRISE_URL;
  if (appriseUrl) {
    try {
      const r = await fetch(appriseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, type: "error", tag: "volkern-uptime" }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!r.ok) {
        console.error(`[uptime-developers] Apprise notify failed: HTTP ${r.status}`);
      }
    } catch (err: any) {
      console.error(`[uptime-developers] Apprise notify error: ${err?.message ?? err}`);
    }
  }

  // 3) Resend email a ADMIN_EMAIL — independiente del stack multi-tenant.
  const adminEmail = process.env.ADMIN_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (adminEmail && resendKey) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Volkern Uptime <noreply@volkern.app>",
          to: [adminEmail],
          subject: title,
          text: body,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        console.error(
          `[uptime-developers] Resend email failed: HTTP ${r.status} — ${errBody.slice(0, 200)}`
        );
      }
    } catch (err: any) {
      console.error(`[uptime-developers] Resend email error: ${err?.message ?? err}`);
    }
  }
}

export async function GET(request: NextRequest) {
  // ─── Skip en Vercel Preview deployments ─────────────────────────
  // El handler se salta para no consumir cuota contra el dominio de
  // producción ni alertar en builds no estables. `VERCEL_ENV` es auto-set
  // por Vercel: "production" | "preview" | "development".
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") {
    return NextResponse.json({
      success: true,
      skipped: "preview-env",
      timestamp: new Date().toISOString(),
      vercelEnv,
    });
  }

  // ─── Auth ─────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (
      !process.env.CRON_SECRET ||
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401, headers: { "cache-control": "no-store" } }
      );
    }
  }

  // ─── Probes en paralelo ───────────────────────────────────────────
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://volkern.app";
  const probes = await Promise.all([
    probe(`${baseUrl}/docs/developers`),
    probe(`${baseUrl}/openapi.json`, { checkOpenApiSchema: true }),
  ]);

  const failures = probes.filter(
    (p) => !p.ok || p.contentValid === false
  );

  // ─── Alert con throttle (5min cooldown) ──────────────────────────
  // `globalThis.__volkernUptimeAlertLastAt` persiste entre invocaciones
  // de la misma lambda instance. NO es durable across cold starts — eso
  // aceptaría hasta N alerts duplicadas si un outage cruza un restart,
  // acotado por la frecuencia del cron (cada 5 min). Para durabilidad
  // completa se necesitaría Upstash/KV — overkill para MVP.
  let alertSent = false;
  let cooldownSkipped = false;
  if (failures.length > 0) {
    const g = globalThis as unknown as {
      __volkernUptimeAlertLastAt?: number;
    };
    const lastAlertAt = g.__volkernUptimeAlertLastAt ?? 0;
    const now = Date.now();
    if (now - lastAlertAt >= ALERT_COOLDOWN_MS) {
      g.__volkernUptimeAlertLastAt = now;
      try {
        await sendAlert(failures);
        alertSent = true;
      } catch (err: any) {
        console.error(
          `[uptime-developers] sendAlert crashed: ${err?.message ?? err}`
        );
      }
    } else {
      cooldownSkipped = true;
      const remainingS = Math.round((ALERT_COOLDOWN_MS - (now - lastAlertAt)) / 1000);
      console.warn(
        `[uptime-developers] ${failures.length} fallo(s) detectado(s) — alerta suprimida por cooldown ` +
          `(faltan ${remainingS}s)`
      );
    }
  }

  return NextResponse.json({
    success: failures.length === 0,
    timestamp: new Date().toISOString(),
    probes,
    failures: failures.length,
    alertSent,
    cooldownSkipped,
  });
}

// Vercel cron usa GET por defecto; cubrimos POST también por robustez
// (e.g. retried invocations que el LB pueda transformar).
export async function POST(request: NextRequest) {
  return GET(request);
}
