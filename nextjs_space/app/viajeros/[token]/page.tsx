/**
 * Página pública `/viajeros/[token]`: destino del enlace firmado del mensaje de
 * WhatsApp. Verifica la firma y la caducidad del token y, si es válido,
 * muestra el formulario donde el viajero completa sus datos obligatorios.
 *
 * Es una página pública (como /orden, /cotizacion): el middleware la deja
 * pasar porque `viajeros` está en TOP_LEVEL, y no expone ningún dato de la
 * reserva más allá del contexto mínimo para que el viajero sepa dónde está.
 */
import { prisma } from '@/lib/db';
import { verificarTokenEnlace } from '@/lib/hospitality/compliance-link';
import { TIPOS_DOCUMENTO_CON_SOPORTE } from '@/lib/hospitality/compliance';
import ViajeroForm from './ViajeroForm';

export const dynamic = 'force-dynamic';

export default async function PaginaViajero({
  params,
}: {
  params: { token: string };
}) {
  const verificacion = verificarTokenEnlace(params.token);

  if (!verificacion.ok) {
    const motivo =
      verificacion.motivo === 'caducado'
        ? 'Este enlace ha caducado. Pide al alojamiento que te envíe uno nuevo.'
        : 'Este enlace no es válido. Pide al alojamiento que te envíe uno nuevo.';
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm dark:bg-slate-900">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-950">
            ⚠️
          </div>
          <h1 className="text-lg font-semibold">Enlace no válido</h1>
          <p className="mt-2 text-sm text-muted-foreground">{motivo}</p>
        </div>
      </main>
    );
  }

  // Carga mínima: solo el viajero destinatario del enlace. Ni otros viajeros,
  // ni documentos de terceros, ni datos de la reserva más allá del contexto.
  const viajero = await prisma.hospitalityTraveler.findUnique({
    where: { id: verificacion.viajeroId },
    select: {
      nombre: true,
      apellido1: true,
      apellido2: true,
      tipoDocumento: true,
      numeroDocumento: true,
      soporteDocumento: true,
      fechaNacimiento: true,
      nacionalidad: true,
      estado: true,
      reservation: {
        select: {
          externalBookingId: true,
          unit: { select: { nombre: true } },
        },
      },
    },
  });

  if (!viajero) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm dark:bg-slate-900">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-950">
            ⚠️
          </div>
          <h1 className="text-lg font-semibold">Registro no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este registro ya no existe. Pide al alojamiento que te envíe un enlace nuevo.
          </p>
        </div>
      </main>
    );
  }

  const unidad = viajero.reservation?.unit?.nombre || '';
  const referencia = viajero.reservation?.externalBookingId || '';
  const contexto = [unidad ? `Alojamiento: ${unidad}` : '', referencia ? `Referencia: ${referencia}` : '']
    .filter(Boolean)
    .join(' · ');

  const iso = viajero.fechaNacimiento ? new Date(viajero.fechaNacimiento).toISOString().slice(0, 10) : '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <ViajeroForm
          token={params.token}
          contexto={contexto}
          inicial={{
            nombre: viajero.nombre || '',
            apellido1: viajero.apellido1 || '',
            apellido2: viajero.apellido2 || '',
            // Los datos ya guardados NO se rellenan: el viajero los conoce y
            // así nadie con el enlace ve un documento ajeno en pantalla.
            tipoDocumento: viajero.tipoDocumento || '',
            numeroDocumento: '',
            soporteDocumento: '',
            fechaNacimiento: iso,
            nacionalidad: viajero.nacionalidad || '',
          }}
          tiposConSoporte={TIPOS_DOCUMENTO_CON_SOPORTE}
        />
      </div>
    </main>
  );
}
