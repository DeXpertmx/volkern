'use client';

/**
 * WebhookTester — client component para /docs/developers
 *
 *  - Firma payloads con HMAC-SHA256 (`crypto.subtle`) sobre `${timestamp}.${payload}`,
 *    100% compatible con `hmacSignPayload` en `lib/developer-console.ts`.
 *  - Envía la request fetch()'d directamente al endpoint del partner (requiere
 *    que permita CORS) o vía proxy server-side (`/api/v1/webhooks/test-sign`)
 *    que ignora CORS.
 *  - Muestra preview de la firma, headers, payload, respuesta del partner, y
 *    snippets copyables de cURL/Node.js/Python para ejecutar desde terminal.
 *
 * Privacidad: el `secret` que el usuario escribe NUNCA abandona el navegador
 * salvo cuando pulsa "Vía Volkern (proxy)". El proxy server-side lo usa
 * únicamente para esa request y no lo persiste (ver
 * `app/api/v1/webhooks/test-sign/route.ts`).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

// ─── Presets de eventos ───────────────────────────────────────────

type EventType = keyof typeof PRESETS;

const PRESETS = {
  'invoice.accepted': {
    label: 'invoice.accepted · Verifactu OK',
    description: 'AEAT aceptó la factura y emitió CSV firmado.',
    payload: () => ({
      id: 'evt_demo_' + Math.random().toString(36).slice(2, 10),
      type: 'invoice.accepted',
      createdAt: Math.floor(Date.now() / 1000),
      tenantId: 'cm_demo_tenant',
      data: {
        invoiceId: 'cm_demo_invoice_abc123',
        numero: 'F-' + String(Math.floor(Math.random() * 1000)).padStart(5, '0'),
        amount: 1210.0,
        currency: 'EUR',
        fingerprint:
          'a1b2c3d4e5f6' +
          Array.from({ length: 52 }, () =>
            Math.floor(Math.random() * 16).toString(16),
          ).join(''),
        aeat_csv_url: 'https://aeat.volkern.app/csv/cm_demo_invoice_abc123.csv',
        acceptedAt: new Date().toISOString(),
      },
    }),
  },
  'invoice.rejected': {
    label: 'invoice.rejected · Verifactu error',
    description: 'AEAT rechazó la factura (XML/QR inválido, NIF no registrado, etc.).',
    payload: () => ({
      id: 'evt_demo_' + Math.random().toString(36).slice(2, 10),
      type: 'invoice.rejected',
      createdAt: Math.floor(Date.now() / 1000),
      tenantId: 'cm_demo_tenant',
      data: {
        invoiceId: 'cm_demo_invoice_def456',
        numero: 'F-' + String(Math.floor(Math.random() * 1000)).padStart(5, '0'),
        fingerprint: 'f1e2d3c4b5a6...',
        aeat_error_code: '3001',
        aeat_error_message: 'NIF del receptor no encontrado en censo AEAT.',
        rejectedAt: new Date().toISOString(),
      },
    }),
  },
  'webhook.ping': {
    label: 'webhook.ping · test connectivity',
    description: 'Ping vacío para verificar la conexión sin una factura real.',
    payload: () => ({
      id: 'evt_ping_' + Math.random().toString(36).slice(2, 10),
      type: 'webhook.ping',
      createdAt: Math.floor(Date.now() / 1000),
      data: { ping: true, message: 'Si recibes esto, tu endpoint está vivo.' },
    }),
  },
} as const;

// ─── Crypto helpers (browser-side) ────────────────────────────────

async function computeSignatureHex(
  secret: string,
  message: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Componente principal ────────────────────────────────────────

export default function WebhookTester() {
  const [url, setUrl] = useState('https://your-app.example.com/webhook');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [eventType, setEventType] = useState<EventType>('invoice.accepted');
  const [payloadText, setPayloadText] = useState(() =>
    JSON.stringify(PRESETS['invoice.accepted'].payload(), null, 2),
  );
  const [overrideTimestamp, setOverrideTimestamp] = useState('');
  const [signatureHex, setSignatureHex] = useState('');
  const [signedTimestamp, setSignedTimestamp] = useState('');
  const [sending, setSending] = useState<null | 'direct' | 'proxy'>(null);
  const [response, setResponse] = useState<{
    status: number;
    ok: boolean;
    body: string;
    headers: Record<string, string>;
    via: 'direct' | 'proxy';
    durationMs: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secretTouched, setSecretTouched] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Re-fill payload al cambiar eventType ──
  useEffect(() => {
    setPayloadText(JSON.stringify(PRESETS[eventType].payload(), null, 2));
    setResponse(null);
    setError(null);
  }, [eventType]);

  // ── Debounced auto-firma cuando cambia payload o secret ──
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void recomputeSignature({ silent: true });
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, payloadText, overrideTimestamp]);

  async function recomputeSignature(opts: { silent?: boolean } = {}) {
    if (!secret) {
      setSignatureHex('');
      setSignedTimestamp('');
      if (!opts.silent) setError('Introduce tu webhookSecret para ver la firma.');
      return;
    }
    try {
      const ts = overrideTimestamp || Math.floor(Date.now() / 1000).toString();
      const hex = await computeSignatureHex(secret, `${ts}.${payloadText}`);
      setSignatureHex('sha256=' + hex);
      setSignedTimestamp(ts);
      if (!opts.silent) setError(null);
    } catch (e: any) {
      setSignatureHex('');
      setError('Error firmando: ' + e.message);
    }
  }

  function buildCurlCommand(): string {
    const safe = payloadText.replace(/'/g, "'\\''");
    // No inyectamos la firma porque depende de timestamp dinámico;
    // el usuario la reemplazará tras ejecutar o copiará el realtime.
    return [
      `curl -X POST '${url}' \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -H 'X-Volkern-Event: ${eventType}' \\`,
      `  -H 'X-Volkern-Timestamp: ${signedTimestamp || '<TIMESTAMP>'}' \\`,
      `  -H 'X-Volkern-Signature: ${signatureHex || '<SIGNATURE>'}' \\`,
      `  --data-raw '${safe}'`,
    ].join('\n');
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore — fallback no soportado
    }
  }

  // ── Send directo desde navegador ──
  async function sendDirect() {
    setError(null);
    setResponse(null);
    setSending('direct');
    try {
      // Firmar LOCALMENTE con los valores snapshots al click. NO dependemos
      // del debounce / state de signatureHex: si el auto-compute disparó entre
      // este await y el fetch, el user vería firmado un payload viejo en el POST.
      if (!secret) throw new Error('Falta el secret');
      const tsLocal = overrideTimestamp || Math.floor(Date.now() / 1000).toString();
      const sigLocal = 'sha256=' + (await computeSignatureHex(secret, `${tsLocal}.${payloadText}`));
      // Best-effort: refrescar el preview a los mismos valores (no awaited).
      setSignatureHex(sigLocal);
      setSignedTimestamp(tsLocal);
      const started = performance.now();
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Volkern-Signature': sigLocal,
          'X-Volkern-Timestamp': tsLocal,
          'X-Volkern-Event': eventType,
          'User-Agent': 'Volkern-Webhook-Tester/1.0',
        },
        body: payloadText,
        mode: 'cors',
        credentials: 'omit',
      });
      const text = await r.text();
      const headers: Record<string, string> = {};
      r.headers.forEach((v, k) => {
        headers[k] = v;
      });
      setResponse({
        status: r.status,
        ok: r.ok,
        body: text.slice(0, 4096),
        headers,
        via: 'direct',
        durationMs: Math.round(performance.now() - started),
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(
        msg +
          (msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('failed to fetch')
            ? ' — Error CORS. Prueba el botón "Vía Volkern (proxy)" o usa el comando cURL abajo desde tu terminal.'
            : ''),
      );
    } finally {
      setSending(null);
    }
  }

  // ── Send vía proxy server-side (Volkern firma y POSTa por ti) ──
  async function sendViaProxy() {
    setError(null);
    setResponse(null);
    setSending('proxy');
    try {
      const r = await fetch('/api/v1/webhooks/test-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret,
          eventType,
          payload: payloadText,
          timestamp: overrideTimestamp || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(`Proxy error (${r.status}): ${j.error ?? JSON.stringify(j)}`);
        return;
      }
      setResponse({
        status: j.responseStatus ?? 0,
        ok: (j.responseStatus ?? 0) >= 200 && (j.responseStatus ?? 0) < 300,
        body: j.responseBody ?? '',
        headers: j.responseHeaders ?? {},
        via: 'proxy',
        durationMs: j.durationMs ?? 0,
      });
    } catch (e: any) {
      setError('Proxy error: ' + (e?.message ?? String(e)));
    } finally {
      setSending(null);
    }
  }

  const curl = useMemo(() => buildCurlCommand(), [url, eventType, payloadText, signatureHex, signedTimestamp]);

  // crypto.subtle.importKey('raw', ...) requiere exactamente el tamaño del
  // output del hash: 32 bytes (64 hex chars) para SHA-256. Chrome/Firefox
  // modernos rechazan claves más cortas con DataError.
  const secretInvalid = secretTouched && secret.length < 32;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── LEFT: Inputs ───────────────────────────────────── */}
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <label htmlFor="wt-url" className="block text-xs font-semibold text-slate-700">
            Webhook URL
          </label>
          <input
            id="wt-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.example.com/webhook"
            spellCheck={false}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Tu endpoint público. Si es localhost, usa el botón "Vía Volkern (proxy)" o el cURL de abajo.
          </p>
        </div>

        <div>
          <label htmlFor="wt-secret" className="block text-xs font-semibold text-slate-700">
            Webhook secret (HMAC shared)
          </label>
          <div className="mt-1 flex rounded-md border border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <input
              id="wt-secret"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => {
                setSecret(e.target.value);
                setSecretTouched(true);
              }}
              placeholder="vksec_<64 hex chars>"
              spellCheck={false}
              autoComplete="off"
              className="block w-full rounded-l-md border-0 bg-transparent px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowSecret((s) => !s)}
              className="rounded-r-md bg-slate-50 px-3 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              {showSecret ? 'ocultar' : 'mostrar'}
            </button>
          </div>
          {secretInvalid && (
            <p className="mt-1 text-xs text-amber-600">
              El secret debe tener al menos 32 caracteres (= 64 hex chars) para
              que crypto.subtle.importKey() funcione con HMAC-SHA256.
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Lo obtuviste al crear la API Key en /dashboard/developers. La firma HMAC nunca se envía a un servidor (salvo el proxy opcional).
          </p>
        </div>

        <div>
          <label htmlFor="wt-event" className="block text-xs font-semibold text-slate-700">
            Evento
          </label>
          <select
            id="wt-event"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {(Object.keys(PRESETS) as EventType[]).map((k) => (
              <option key={k} value={k}>
                {PRESETS[k].label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{PRESETS[eventType].description}</p>
        </div>

        <div>
          <label htmlFor="wt-timestamp" className="block text-xs font-semibold text-slate-700">
            Timestamp override (opcional)
          </label>
          <input
            id="wt-timestamp"
            value={overrideTimestamp}
            onChange={(e) => setOverrideTimestamp(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={`${Math.floor(Date.now() / 1000)}  (auto si vacío)`}
            spellCheck={false}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="wt-payload" className="block text-xs font-semibold text-slate-700">
            Payload (JSON)
          </label>
          <textarea
            id="wt-payload"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={10}
            spellCheck={false}
            className="mt-1 block w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={!secret || sending !== null}
            onClick={() => void sendDirect()}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {sending === 'direct' ? 'Enviando…' : 'Enviar desde navegador →'}
          </button>
          <button
            type="button"
            disabled={!secret || sending !== null}
            onClick={() => void sendViaProxy()}
            className="inline-flex items-center rounded-md border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-blue-300 disabled:text-blue-300"
          >
            {sending === 'proxy' ? 'Enviando…' : 'Vía Volkern (proxy)'}
          </button>
          <button
            type="button"
            disabled={!secret}
            onClick={() => void recomputeSignature({ silent: false })}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Recalcular firma
          </button>
        </div>

        <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
          La petición directa requiere que tu endpoint acepte CORS o que lo
          pruebes desde terminal (cURL abajo). El proxy server-side salta CORS
          pero pasa momentáneamente tu secret por Volkern:{' '}
          <strong>no lo uses en producción con secrets reales</strong>.
        </p>
      </div>

      {/* ── RIGHT: Output ─────────────────────────────────── */}
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Request preview
          </h3>
          <div className="mt-3 space-y-2 text-xs">
            <div>
              <span className="font-semibold text-slate-500">POST</span>{' '}
              <span className="font-mono text-slate-900">{url || '(empty URL)'}</span>
            </div>
            <div className="space-y-1 rounded-md bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800">
              <div>
                <span className="text-blue-700">X-Volkern-Event</span>: {eventType}
              </div>
              <div>
                <span className="text-blue-700">X-Volkern-Timestamp</span>:{' '}
                {signedTimestamp || '—'}
              </div>
              <div className="break-all">
                <span className="text-blue-700">X-Volkern-Signature</span>:{' '}
                {signatureHex ? (
                  <span className="text-emerald-700">{signatureHex}</span>
                ) : (
                  <span className="text-slate-400">(introduce tu secret)</span>
                )}
              </div>
              <div>
                <span className="text-blue-700">Content-Type</span>:
                application/json
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">cURL</h3>
            <button
              type="button"
              onClick={() => void copyToClipboard(curl)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Copy
            </button>
          </div>
          <pre className="mt-3 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
            <code>{curl}</code>
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Reemplaza <code>{'<TIMESTAMP>'}</code> y <code>{'<SIGNATURE>'}</code> con los
            valores actuales mostrados arriba, o ejecuta el comando y mira los
            headers del request recibido en tu servidor.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Response</h3>
          {error && (
            <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md bg-rose-50 p-3 text-xs text-rose-800">
              {error}
            </pre>
          )}
          {!error && !response && (
            <p className="mt-3 text-xs text-slate-500">
              Envía una request para ver aquí la respuesta de tu endpoint.
            </p>
          )}
          {response && (
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                    (response.ok
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800')
                  }
                >
                  {response.status || '—'}
                </span>
                <span className="text-slate-500">
                  vía {response.via === 'direct' ? 'navegador' : 'proxy Volkern'} ·{' '}
                  {response.durationMs}ms
                </span>
              </div>
              {Object.keys(response.headers).length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-slate-700">
                    Response headers ({Object.keys(response.headers).length})
                  </summary>
                  <pre className="mt-2 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-800">
                    {Object.entries(response.headers)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n')}
                  </pre>
                </details>
              )}
              <div>
                <div className="mb-1 text-xs font-medium text-slate-700">Body</div>
                <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                  <code>
                    {response.body || '(empty body)'}
                    {response.body.length >= 4096 ? '\n…truncated to 4KB' : ''}
                  </code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
