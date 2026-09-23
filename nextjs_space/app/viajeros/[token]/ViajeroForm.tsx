'use client';

/**
 * Formulario público del viajero: llega desde el enlace firmado del mensaje de
 * WhatsApp y completa aquí sus datos obligatorios. Al guardar, el servidor los
 * escribe sobre el viajero ya declarado en la reserva y recalcula el parte.
 *
 * No pide nada que el Ministerio no exija y no enseña datos que no sean del
 * propio formulario: el viajero no ve documentos de otras personas.
 */
import { useState } from 'react';

export interface PropsFormulario {
  token: string;
  /** Texto de contexto que llegó en la carga inicial (unidad, referencia). */
  contexto: string;
  /** Nombre completo del viajero guardado en el registro (no viaja en el enlace). */
  nombreCompleto: string | null;
  /** true si nombre y primer apellido ya están guardados: se muestran bloqueados. */
  nombrePrellenado: boolean;
  /** Valores ya presentes en el registro: se rellenan si el rol los sirve. */
  inicial: {
    nombre: string;
    apellido1: string;
    apellido2: string;
    tipoDocumento: string;
    numeroDocumento: string;
    soporteDocumento: string;
    fechaNacimiento: string;
    nacionalidad: string;
    direccion: string;
    municipio: string;
    codigoPostal: string;
    paisDireccion: string;
  };
  /** Tipos de documento que exigen número de soporte (DNI/NIE hoy). */
  tiposConSoporte: readonly string[];
}

const etiquetas: Record<string, string> = {
  nombre: 'Nombre',
  apellido1: 'Primer apellido',
  apellido2: 'Segundo apellido',
  tipoDocumento: 'Tipo de documento',
  numeroDocumento: 'Número de documento',
  soporteDocumento: 'Soporte del documento',
  fechaNacimiento: 'Fecha de nacimiento',
  nacionalidad: 'Nacionalidad',
  direccion: 'Dirección (vía y número)',
  municipio: 'Municipio',
  codigoPostal: 'Código postal',
  paisDireccion: 'País de residencia',
};

export default function ViajeroForm({
  token,
  contexto,
  nombreCompleto,
  nombrePrellenado,
  inicial,
  tiposConSoporte,
}: PropsFormulario) {
  const [datos, setDatos] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');

  const requiereSoporte = tiposConSoporte.includes((datos.tipoDocumento || '').trim().toUpperCase());
  const faltanObligatorios =
    !datos.nombre.trim() ||
    !datos.apellido1.trim() ||
    !datos.tipoDocumento.trim() ||
    !datos.numeroDocumento.trim() ||
    !datos.fechaNacimiento ||
    !datos.direccion.trim() ||
    !datos.codigoPostal.trim();

  const actualizar = (campo: string, valor: string) => {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(`/api/public/viajeros/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(cuerpo.error || 'No se pudieron guardar tus datos');
      }
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setGuardando(false);
    }
  };

  if (guardado) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center shadow-sm dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl dark:bg-green-950">
          ✅
        </div>
        <h1 className="text-xl font-semibold">¡Datos registrados!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tus datos quedaron guardados en la reserva. No hace falta que hagas nada más:
          el alojamiento los comunicará al registro oficial cuando corresponda.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-slate-900">
      <h1 className="text-lg font-semibold">Completa tus datos de viajero</h1>
      {contexto && <p className="mt-1 text-sm text-muted-foreground">{contexto}</p>}

      {nombrePrellenado && nombreCompleto ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Formulario de {nombreCompleto}
          </p>
          <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-300/80">
            El nombre ya está registrado: completa documento, fecha de nacimiento y tu domicilio.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(['nombre', 'apellido1', 'apellido2'] as const).map((campo) => (
          <label key={campo} className="block text-sm">
            <span className="font-medium">
              {etiquetas[campo]}
              {campo !== 'apellido2' && <span className="text-red-500"> *</span>}
            </span>
            <input
              type="text"
              autoComplete="off"
              value={datos[campo]}
              readOnly={nombrePrellenado && campo !== 'apellido2'}
              onChange={(e) => actualizar(campo, e.target.value)}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 ${
                nombrePrellenado && campo !== 'apellido2' ? 'opacity-70' : ''
              }`}
            />
          </label>
        ))}

        <label className="block text-sm">
          <span className="font-medium">
            {etiquetas.tipoDocumento} <span className="text-red-500">*</span>
          </span>
          <select
            value={datos.tipoDocumento}
            onChange={(e) => actualizar('tipoDocumento', e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Elige…</option>
            <option value="DNI">DNI</option>
            <option value="NIE">NIE</option>
            <option value="PASAPORTE">Pasaporte</option>
            <option value="OTRO">Otro</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">
            {etiquetas.numeroDocumento} <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            autoComplete="off"
            value={datos.numeroDocumento}
            onChange={(e) => actualizar('numeroDocumento', e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        {requiereSoporte && (
          <label className="block text-sm">
            <span className="font-medium">{etiquetas.soporteDocumento}</span>
            <input
              type="text"
              autoComplete="off"
              value={datos.soporteDocumento}
              onChange={(e) => actualizar('soporteDocumento', e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="font-medium">
            {etiquetas.fechaNacimiento} <span className="text-red-500">*</span>
          </span>
          <input
            type="date"
            value={datos.fechaNacimiento}
            onChange={(e) => actualizar('fechaNacimiento', e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">{etiquetas.nacionalidad}</span>
          <input
            type="text"
            autoComplete="off"
            placeholder="ES, FR, DE…"
            value={datos.nacionalidad}
            onChange={(e) => actualizar('nacionalidad', e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </div>

      <div className="mt-5 border-t pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Domicilio (el registro oficial lo exige)
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium">
              {etiquetas.direccion} <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              autoComplete="street-address"
              value={datos.direccion}
              onChange={(e) => actualizar('direccion', e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{etiquetas.municipio}</span>
            <input
              type="text"
              autoComplete="address-level2"
              value={datos.municipio}
              onChange={(e) => actualizar('municipio', e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">
              {etiquetas.codigoPostal} <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              autoComplete="postal-code"
              value={datos.codigoPostal}
              onChange={(e) => actualizar('codigoPostal', e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{etiquetas.paisDireccion}</span>
            <select
              value={datos.paisDireccion || 'ESP'}
              onChange={(e) => actualizar('paisDireccion', e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="ESP">España</option>
              <option value="FRA">Francia</option>
              <option value="PRT">Portugal</option>
              <option value="DEU">Alemania</option>
              <option value="GBR">Reino Unido</option>
              <option value="ITA">Italia</option>
              <option value="MAR">Marruecos</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={guardando || faltanObligatorios}
        className="mt-5 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar mis datos'}
      </button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Tus datos se usan exclusivamente para el registro obligatorio de viajeros
        y se comunican al Ministerio del Interior según la ley.
      </p>
    </div>
  );
}
