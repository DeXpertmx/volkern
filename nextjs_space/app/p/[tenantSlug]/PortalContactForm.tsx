'use client';

import { useState } from 'react';

/**
 * Formulario de contacto de la portada del portal.
 *
 * Envía el `slug` de esta cuenta, así que el lead se crea en la cuenta de la
 * oficina que recibe la visita (y no en la matriz): el franquiciado lo ve en su
 * CRM al momento y la matriz lo consolida desde el suyo.
 */
export default function PortalContactForm({
  tenantSlug,
  brandingColor,
}: {
  tenantSlug: string;
  brandingColor: string;
}) {
  const [datos, setDatos] = useState({ name: '', email: '', phone: '', message: '' });
  const [consent, setConsent] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState('');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');

    try {
      const res = await fetch('/api/public/real-estate/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: tenantSlug,
          name: datos.name,
          email: datos.email,
          phone: datos.phone,
          message: datos.message,
          consent,
        }),
      });

      if (res.ok) {
        setOk(true);
        setDatos({ name: '', email: '', phone: '', message: '' });
        setConsent(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'No pudimos enviar tu mensaje. Inténtalo de nuevo.');
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (ok) {
    return (
      <div className="rounded-2xl border p-6" style={{ borderColor: `${brandingColor}44` }}>
        <p className="text-lg font-semibold text-gray-900">Mensaje enviado</p>
        <p className="mt-2 text-sm text-gray-600">
          Hemos recibido tu consulta. La oficina te contactará en breve.
        </p>
        <button
          type="button"
          onClick={() => setOk(false)}
          className="mt-4 text-sm font-medium hover:underline"
          style={{ color: brandingColor }}
        >
          Enviar otra consulta
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Nombre*</span>
          <input
            required
            value={datos.name}
            onChange={(e) => setDatos({ ...datos, name: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Email*</span>
          <input
            required
            type="email"
            value={datos.email}
            onChange={(e) => setDatos({ ...datos, email: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-gray-600">Teléfono</span>
          <input
            value={datos.phone}
            onChange={(e) => setDatos({ ...datos, phone: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-gray-600">¿Qué estás buscando?</span>
          <textarea
            rows={3}
            value={datos.message}
            onChange={(e) => setDatos({ ...datos, message: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs text-gray-500">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        Acepto que me contacten por teléfono o email para responder a esta consulta.
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: brandingColor }}
      >
        {enviando ? 'Enviando…' : 'Enviar consulta'}
      </button>
    </form>
  );
}
