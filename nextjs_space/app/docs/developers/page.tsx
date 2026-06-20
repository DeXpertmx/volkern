/**
 * /docs/developers
 *
 * Documentación + herramientas para integradores externos (ERPs, POS, e-commerce)
 * que se conectan a Volkern vía la Partner API v1.
 *
 * Combina:
 *  - **Redoc**: spec OpenAPI 3.0 navegable (POST /v1/invoices, GET /v1/invoices/{id}).
 *  - **Webhook Tester**: cliente interactivo que firma payloads con HMAC-SHA256
 *    (`X-Volkern-Signature: sha256=<hex>` sobre `${timestamp}.${payload}`) usando
 *    `crypto.subtle` (Web Crypto API) y los envía al endpoint del partner.
 *    Cubre el caso browser-direct (CORS-cooperating) y servidor-proxy
 *    (`/api/v1/webhooks/test-sign`) con rate-limit + anti-SSRF.
 *
 * Página pública: cualquier integrador puede usarla sin autenticarse.
 * El secret que el usuario ingresa NUNCA abandona su navegador salvo
 * cuando voluntariamente pulsa "Vía Volkern (proxy server)".
 */

export const dynamic = 'force-static';

export const metadata = {
  title: 'Volkern · Developer Hub',
  description:
    'Documentación interactiva de la Partner API v1 de Volkern y herramientas para tester webhooks firmados con HMAC-SHA256.',
  robots: {
    index: true,
    follow: true,
  },
};

import WebhookTester from '@/components/developers/WebhookTester';

const REDOC_THEME = JSON.stringify({
  colors: {
    primary: { main: '#2563eb' },
    success: { main: '#16a34a' },
    warning: { main: '#f59e0b' },
    error: { main: '#dc2626' },
    text: { primary: '#0f172a', secondary: '#475569' },
    background: { canvas: '#ffffff', section: '#f8fafc' },
  },
  typography: {
    fontSize: '15px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    headings: { fontFamily: 'inherit', fontWeight: '600' },
    code: {
      fontSize: '13px',
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    },
  },
  sidebar: { backgroundColor: '#f8fafc', width: '260px' },
  rightPanel: { backgroundColor: '#1e293b', textColor: '#f8fafc' },
});

export default function DevelopersHubPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* ── Hero ligero ─────────────────────────────────────────────── */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Volkern · Developer Hub
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Partner API v1 & Webhook Tester
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Integradores externos (ERPs, POS, e-commerce) encuentran aquí el
                spec OpenAPI navegable y un playground firmado con HMAC-SHA256
                para validar que tu endpoint recibe eventos Volkern correctamente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/openapi.json"
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-500 hover:text-blue-700"
              >
                Descargar openapi.json ↓
              </a>
              <a
                href="#webhook-tester"
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Probar webhook ahora →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quick start + estructura general ──────────────────────────── */}
      <section className="border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                1
              </span>
              <h2 className="text-sm font-semibold text-slate-900">
                Genera tu API Key
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              En el dashboard del tenant (
              <code className="rounded bg-slate-100 px-1 text-xs">/dashboard/developers</code>
              ) crea una API key con scope{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">invoices:write</code>.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                2
              </span>
              <h2 className="text-sm font-semibold text-slate-900">
                Configura tu webhook
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Asocia un{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">webhookUrl</code>{' '}
              público y suscríbete a{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">invoice.accepted</code>,{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">invoice.rejected</code>.
              Guarda el <code className="rounded bg-slate-100 px-1 text-xs">webhookSecret</code>{' '}
              (se muestra una sola vez).
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                3
              </span>
              <h2 className="text-sm font-semibold text-slate-900">Verifica HMAC</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Tu endpoint recalcula{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">
                sha256(secret, `${'${ts}'}.${'${payload}'}`)
              </code>{' '}
              y la compara en tiempo constante contra{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">
                X-Volkern-Signature
              </code>
              .
            </p>
          </div>
        </div>
      </section>

      {/* ── Tabs: Redoc (spec) | Webhook Tester ───────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center gap-2 border-b border-slate-200">
          <a
            href="#spec"
            className="-mb-px rounded-t-md border border-x border-t border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700"
          >
            API Reference
          </a>
          <a
            href="#webhook-tester"
            className="-mb-px rounded-t-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:text-blue-700"
          >
            Webhook Tester
          </a>
          <a
            href="#snippet"
            className="-mb-px rounded-t-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:text-blue-700"
          >
            Verify in your server
          </a>
        </div>

        {/* ─── API Reference (Redoc embed) ─── */}
        <article id="spec" className="scroll-mt-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold text-slate-900">
              API Reference
            </h2>
            <a
              href="/openapi.json"
              className="text-xs text-slate-500 hover:text-blue-700"
            >
              OpenAPI 3.0 JSON →
            </a>
          </div>
          {/* Redocly standalone bundle (~600KB, async). */}
          <script
            src="https://cdn.redocly.com/redoc/latest/bundles/redoc.standalone.js"
            async
          />
          <div id="redoc-container" className="w-full rounded-xl border border-slate-200 bg-white">
            {/* @ts-expect-error - <redoc> es custom element del bundle Redocly */}
            <redoc
              spec-url="/openapi.json"
              hide-download-button="false"
              expand-responses="200,201"
              json-sample-expand-level="2"
              path-in-middle-panel="true"
              required-props-first="true"
              sort-props-alphabetically="false"
              theme={REDOC_THEME}
              scroll-y-offset="0"
            />
          </div>
        </article>

        {/* ─── Webhook Tester ─── */}
        <article id="webhook-tester" className="mt-12 scroll-mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-slate-900">
              Webhook Tester
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Firma payloads con HMAC-SHA256 (Stripe-compat) y los envía a tu URL.
              La firma usa{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">
                X-Volkern-Signature: sha256=&lt;hex&gt;
              </code>{' '}
              sobre{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">
                ${'${timestamp}'}.${'${payload}'}
              </code>
              .
            </p>
          </div>
          <WebhookTester />
        </article>

        {/* ─── Verificación server-side ─── */}
        <article id="snippet" className="mt-12 scroll-mt-6">
          <h2 className="text-xl font-semibold text-slate-900">
            Verifica la firma en tu servidor
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Compara la firma entrante con un HMAC-SHA256 calculado sobre{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">
              ${'${X-Volkern-Timestamp}'}.${'${rawBody}'}
            </code>{' '}
            con <code className="rounded bg-slate-100 px-1 text-xs">crypto.timingSafeEqual</code>.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Node.js (Express)
              </h3>
              <pre className="mt-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-800">
                <code>{`import crypto from 'node:crypto'

app.post('/webhook', (req, res) => {
  const ts = req.header('X-Volkern-Timestamp')
  const sigHeader = req.header('X-Volkern-Signature') || ''
  const match = sigHeader.match(/^sha256=([a-f0-9]+)$/)
  if (!ts || !match) return res.status(400).send('Invalid signature header')

  const expected = crypto
    .createHmac('sha256', process.env.VOLKERN_WEBHOOK_SECRET)
    .update(\`\${ts}.\${req.rawBody}\`)
    .digest('hex')

  if (
    expected.length !== match[1].length ||
    !crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(match[1], 'hex'),
    )
  ) {
    return res.status(401).send('Bad signature')
  }
  // OK → procesa req.body
  return res.status(200).send({ received: true })
})`}</code>
              </pre>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Python (Flask)</h3>
              <pre className="mt-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-800">
                <code>{`import hmac, hashlib
from flask import request, abort

@app.post('/webhook')
def webhook():
    ts = request.headers.get('X-Volkern-Timestamp')
    sig_header = request.headers.get('X-Volkern-Signature', '')
    if not ts or not sig_header.startswith('sha256='):
        abort(400)

    expected = hmac.new(
        WEBHOOK_SECRET.encode(),
        f'{ts}.{request.get_data()}'.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, sig_header.removeprefix('sha256=')):
        abort(401)
    # OK → procesa request.json
    return {'received': True}, 200`}</code>
              </pre>
            </div>
          </div>
        </article>
      </section>

      <noscript>
        <div className="mx-auto max-w-3xl px-6 py-12 text-center text-slate-700">
          La sección Webhook Tester requiere JavaScript activo (usa Web Crypto
          API). La{' '}
          <a href="/openapi.json" className="text-blue-600 underline">
            especificación OpenAPI
          </a>{' '}
          y la verificación server-side siguen funcionando sin JS.
        </div>
      </noscript>
    </main>
  );
}
