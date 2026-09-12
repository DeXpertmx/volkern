export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import { viajeroPublico, ESTADOS_REGISTRO, FICHAS_ESTADO } from '@/lib/hospitality/compliance';
import {
  actualizarViajero,
  anularRegistro,
  crearViajero,
  detalleRegistro,
  eliminarViajero,
  enviarAlMinisterio,
  leerConfig,
  type EntradaViajero,
} from '@/lib/hospitality/compliance-store';

const ACCIONES = [
  'crear_viajero',
  'actualizar_viajero',
  'eliminar_viajero',
  'enviar_reserva',
  'enviar_viajeros',
  'anular',
] as const;

type Accion = (typeof ACCIONES)[number];

// GET /api/hospitality/compliance/[reservationId] — la ficha del registro.
//
// Los documentos salen enmascarados salvo para quien tiene privilegio (ver
// `viajeroPublico`), y el acceso queda auditado: son datos personales y hay que
// poder responder quién los miró.
export async function GET(req: NextRequest, { params }: { params: { reservationId: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const detalle = await detalleRegistro(tenantId, params.reservationId);
    if (!detalle) return NextResponse.json({ error: 'La reserva no existe en esta cuenta' }, { status: 404 });

    const rol = auth.user?.role?.nombre ?? null;

    if (auth.user?.id) {
      await logAuditAction(
        auth.user.id,
        tenantId,
        'ver',
        'hospitality_compliance',
        params.reservationId,
        `Acceso al registro de viajeros de la reserva ${detalle.reserva.externalBookingId}`
      ).catch(() => {});
    }

    return NextResponse.json({
      reserva: {
        id: detalle.reserva.id,
        referencia: detalle.reserva.externalBookingId,
        canal: detalle.reserva.channel,
        estado: detalle.reserva.estado,
        checkIn: detalle.reserva.checkIn,
        checkOut: detalle.reserva.checkOut,
        propiedad: detalle.reserva.property?.nombre ?? null,
        unidad: detalle.reserva.unit?.nombre ?? null,
        contacto: detalle.reserva.contact ?? null,
      },
      resumen: detalle.resumen,
      viajeros: detalle.reserva.travelers.map((viajero) => viajeroPublico(viajero, { rol })),
      registro: detalle.reserva.compliance
        ? {
            estadoReserva: detalle.reserva.compliance.estadoReserva,
            estadoViajeros: detalle.reserva.compliance.estadoViajeros,
            codigoComunicacion: detalle.reserva.compliance.codigoComunicacion,
            loteId: detalle.reserva.compliance.loteId,
            enviadoEn: detalle.reserva.compliance.enviadoEn,
            procesadoEn: detalle.reserva.compliance.procesadoEn,
            codigoError: detalle.reserva.compliance.codigoError,
            mensajeError: detalle.reserva.compliance.mensajeError,
          }
        : null,
      eventos: detalle.reserva.compliance?.eventos ?? [],
      configuracion: await leerConfig(tenantId),
      estados: ESTADOS_REGISTRO.map((valor) => ({ valor, ...FICHAS_ESTADO[valor] })),
    });
  } catch (error) {
    console.error('[Hospitality] Error al leer el registro de viajeros:', error);
    return NextResponse.json({ error: 'No se pudo leer el registro de esta reserva' }, { status: 500 });
  }
}

/**
 * POST /api/hospitality/compliance/[reservationId] — las acciones del registro.
 *
 * Una sola ruta con `accion` explícita en vez de cinco endpoints: los cinco
 * cambian el mismo registro de la misma reserva, y tenerlos juntos hace que la
 * auditoría y la comprobación de tenant se lean de una vez.
 */
export async function POST(req: NextRequest, { params }: { params: { reservationId: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const usuarioId = auth.user?.id ?? auth.apiKey?.id ?? 'sistema';
    const cuerpo = await req.json().catch(() => null);
    const accion = cuerpo?.accion as Accion | undefined;

    if (!accion || !ACCIONES.includes(accion)) {
      return NextResponse.json(
        { error: `Acción no reconocida. Válidas: ${ACCIONES.join(', ')}` },
        { status: 400 }
      );
    }

    switch (accion) {
      case 'crear_viajero': {
        const entrada = cuerpo?.viajero as EntradaViajero | undefined;
        const faltante = validarViajero(entrada);
        if (faltante) return NextResponse.json({ error: faltante }, { status: 400 });

        const viajero = await crearViajero(tenantId, params.reservationId, entrada!, usuarioId);
        return NextResponse.json({ ok: true, viajero: viajeroPublico(viajero, { rol: auth.user?.role?.nombre }) });
      }

      case 'actualizar_viajero': {
        const viajeroId = cuerpo?.viajeroId as string | undefined;
        const entrada = cuerpo?.viajero as Partial<EntradaViajero> | undefined;
        if (!viajeroId || !entrada) {
          return NextResponse.json({ error: 'Falta el viajero que se quiere actualizar' }, { status: 400 });
        }

        const viajero = await actualizarViajero(tenantId, viajeroId, entrada, usuarioId);
        if (!viajero) return NextResponse.json({ error: 'El viajero no existe en esta cuenta' }, { status: 404 });

        return NextResponse.json({ ok: true, viajero: viajeroPublico(viajero, { rol: auth.user?.role?.nombre }) });
      }

      case 'eliminar_viajero': {
        const viajeroId = cuerpo?.viajeroId as string | undefined;
        if (!viajeroId) return NextResponse.json({ error: 'Falta el viajero que se quiere retirar' }, { status: 400 });

        const borrado = await eliminarViajero(tenantId, viajeroId, usuarioId);
        if (!borrado) return NextResponse.json({ error: 'El viajero no existe en esta cuenta' }, { status: 404 });

        return NextResponse.json({ ok: true });
      }

      case 'enviar_reserva':
      case 'enviar_viajeros': {
        const tipo = accion === 'enviar_reserva' ? 'reserva' : 'viajeros';
        const resultado = await enviarAlMinisterio(tenantId, params.reservationId, tipo, usuarioId);

        // Un 409 cuando falta algo que la persona puede resolver (configuración,
        // datos o el esquema), y un 502 cuando fue el Ministerio quien falló: el
        // código tiene que decirle a la interfaz qué enseñar.
        if (!resultado.ok) {
          const status =
            resultado.motivo === 'rechazado' ? 502 : resultado.motivo === 'transporte' ? 502 : 409;
          return NextResponse.json(resultado, { status });
        }

        return NextResponse.json(resultado);
      }

      case 'anular': {
        const anulado = await anularRegistro(tenantId, params.reservationId, usuarioId, cuerpo?.motivo);
        if (!anulado) return NextResponse.json({ error: 'La reserva no existe en esta cuenta' }, { status: 404 });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Hospitality] Error en la acción del registro de viajeros:', error);
    return NextResponse.json({ error: 'No se pudo completar la acción' }, { status: 500 });
  }
}

/** Lo mínimo que se exige al declarar un viajero: nombre y primer apellido. */
function validarViajero(entrada: EntradaViajero | undefined): string | null {
  if (!entrada) return 'Falta el viajero';
  if (!entrada.nombre?.trim()) return 'El nombre es obligatorio';
  if (!entrada.apellido1?.trim()) return 'El primer apellido es obligatorio';
  return null;
}
