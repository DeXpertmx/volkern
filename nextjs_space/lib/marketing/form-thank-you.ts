export const DEFAULT_THANK_YOU = {
  title: '¡Gracias! Hemos recibido tus datos.',
  message: 'Tu información se registró correctamente. Muy pronto recibirás información sobre los siguientes pasos.',
  buttonText: '',
  buttonUrl: '',
  redirectUrl: '',
};

export type ThankYouConfig = Partial<typeof DEFAULT_THANK_YOU>;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeThankYouUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  return url.startsWith('https://') || url.startsWith('http://') || url.startsWith('/') || url.startsWith('#')
    ? url
    : '';
}

/** Solo permite redirecciones absolutas HTTP(S) configuradas por el tenant. */
export function getThankYouRedirectUrl(config?: ThankYouConfig): string {
  const value = String(config?.redirectUrl ?? '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

/** Construye la pantalla de agradecimiento que SurveyJS o un submit HTML muestran al completar. */
export function buildThankYouHtml(config?: ThankYouConfig): string {
  const values = { ...DEFAULT_THANK_YOU, ...(config || {}) };
  const titleValue = String(values.title ?? '').trim();
  const messageValue = String(values.message ?? '').trim();
  const buttonTextValue = String(values.buttonText ?? '').trim();
  const title = escapeHtml(titleValue || DEFAULT_THANK_YOU.title);
  const message = escapeHtml(messageValue || DEFAULT_THANK_YOU.message).replace(/\n/g, '<br />');
  const buttonText = escapeHtml(buttonTextValue);
  const buttonUrl = safeThankYouUrl(values.buttonUrl);
  const button = buttonText && buttonUrl
    ? `<a href="${escapeHtml(buttonUrl)}" style="display:inline-block;margin-top:24px;padding:11px 20px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600">${buttonText}</a>`
    : '';

  return `<div style="max-width:560px;margin:24px auto;padding:40px 24px;text-align:center;border-radius:16px;background:#f0fdf4;color:#166534">
    <div style="font-size:42px;line-height:1;margin-bottom:16px">✓</div>
    <h2 style="margin:0 0 12px;font-size:24px;color:#166534">${title}</h2>
    <p style="margin:0;color:#15803d;line-height:1.6">${message}</p>
    ${button}
  </div>`;
}

export function buildThankYouDocument(config?: ThankYouConfig): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(String(config?.title || DEFAULT_THANK_YOU.title))}</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif}</style></head><body>${buildThankYouHtml(config)}</body></html>`;
}
