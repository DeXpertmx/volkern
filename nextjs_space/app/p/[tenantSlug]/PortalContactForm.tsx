'use client';

import { useState } from 'react';
import { colorTextoEnClaro, fondoConTextoBlanco } from '@/lib/real-estate/contraste';

const CAMPOS_VACIOS = { name: '', email: '', phone: '', message: '', consent: false };
type Campo = keyof typeof CAMPOS_VACIOS;

/** Estado del envío: un solo valor en vez de tres banderas que pueden contradecirse. */
type Estado =
  | { tipo: 'inicial' }
  | { tipo: 'enviando' }
  | { tipo: 'enviado' }
  | { tipo: 'error'; mensaje: string };

const CLASE_CAMPO =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900';

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
  const [datos, setDatos] = useState(CAMPOS_VACIOS);
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicial' });
  // Mismo criterio que el resto del portal: el botón oscurece la marca lo
  // justo para que su etiqueta blanca se lea, y los enlaces se aclaran u
  // oscurecen para leerse sobre el fondo gris claro del formulario.
  const accion = fondoConTextoBlanco(brandingColor);
  const acento = colorTextoEnClaro(brandingColor);

  const cambiar = (campo: Campo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDatos((previos) => ({
      ...previos,
      [campo]: campo === 'consent' ? (e.target as HTMLInputElement).checked : e.target.value,
    }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado({ tipo: 'enviando' });

    try {
      const res = await fetch('/api/public/real-estate/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: tenantSlug, ...datos }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEstado({
          tipo: 'error',
          mensaje: data.error || 'No pudimos enviar tu mensaje. Inténtalo de nuevo.',
        });
        return;
      }

      setDatos(CAMPOS_VACIOS);
      setEstado({ tipo: 'enviado' });
    } catch {
      setEstado({ tipo: 'error', mensaje: 'Error de conexión. Inténtalo de nuevo.' });
    }
  };

  if (estado.tipo === 'enviado') {
    return (
      <div className="rounded-2xl border p-6" style={{ borderColor: `${brandingColor}44` }}>
        <p className="text-lg font-semibold text-gray-900">Mensaje enviado</p>
        <p className="mt-2 text-sm text-gray-600">
          Hemos recibido tu consulta. La oficina te contactará en breve.
        </p>
        <button
          type="button"
          onClick={() => setEstado({ tipo: 'inicial' })}
          className="mt-4 text-sm font-medium hover:underline"
          style={{ color: acento }}
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
          <input required value={datos.name} onChange={cambiar('name')} className={CLASE_CAMPO} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Email*</span>
          <input
            required
            type="email"
            value={datos.email}
            onChange={cambiar('email')}
            className={CLASE_CAMPO}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-gray-600">Teléfono</span>
          <input value={datos.phone} onChange={cambiar('phone')} className={CLASE_CAMPO} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-gray-600">¿Qué estás buscando?</span>
          <textarea rows={3} value={datos.message} onChange={cambiar('message')} className={CLASE_CAMPO} />
        </label>
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs text-gray-500">
        <input
          type="checkbox"
          required
          checked={datos.consent}
          onChange={cambiar('consent')}
          className="mt-0.5"
        />
        Acepto que me contacten por teléfono o email para responder a esta consulta.
      </label>

      {estado.tipo === 'error' && <p className="mt-3 text-sm text-red-600">{estado.mensaje}</p>}

      <button
        type="submit"
        disabled={estado.tipo === 'enviando'}
        className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: accion }}
      >
        {estado.tipo === 'enviando' ? 'Enviando…' : 'Enviar consulta'}
      </button>
    </form>
  );
}
