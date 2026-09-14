export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import {
  viajeroPublico,
  ESTADOS_REGISTRO,
  FICHAS_ESTADO,
  viajerosAQuienesPedirDatos,
} from '@/lib/hospitality/compliance';
import {
  firmarTokenEnlace,
  urlPedirDatos,
  getEnlaceAppUrl,
  EnlaceNoConfigurado,
} from '@/lib/hospitality/compliance-link';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { guestTelefono, guestNombre } from '@/lib/hospitality/comunicaciones';
import {
  actualizarViajero,
  anularRegistro,
  crearViajero,
  detalleRegistro,
  eliminarViajero,
  enviarAlMinisterio,
  leerConfig,
  registrarEnvioEnlace,
  type EntradaViajero,
} from '@/lib/hospitality/compliance-store';

const ACCIONES = [
  'crear_viajero',
  'actualizar_viajero',
  'eliminar_viajero',
  'enviar_reserva',
  'enviar_viajeros',
  'anular',
  'pedir_datos_whatsapp',
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

      case 'pedir_datos_whatsapp': {
        const destino = await pedirDatosPorWhatsapp(
          tenantId,
          params.reservationId,
          usuarioId,
          cuerpo?.viajeroId as string | undefined
        );
        const status = destino.ok ? 200 : destino.motivo === 'whatsapp' ? 502 : 409;
        return NextResponse.json(destino, { status });
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

/**
 * "Pedir por WhatsApp": mensaje al huésped con un enlace firmado donde completa
 * él mismo sus datos obligatorios y, al guardarlos, queda declarado como
 * viajero de la reserva.
 *
 * El enlace se firma por viajero (un mensaje por cada incompleto), porque el
 * formulario escribe sobre ese viajero concreto. Si no hay teléfono, el 409 lo
 * dice: la persona puede añadir el teléfono al huésped y reintentar.
 */
async function pedirDatosPorWhatsapp(
  tenantId: string,
  reservationId: string,
  usuarioId: string,
  soloViajeroId?: string
): Promise<
  | { ok: true; enviados: number; total: number; viajeros: number }
  | { ok: false; motivo: 'sin_telefono' | 'whatsapp' | 'desconocido'; error: string; enviados?: number }
> {
  // Pide el detalle por la capa de datos (el viaje ya incluye el huésped y el
  // contacto) y calcula el teléfono con la misma regla que las comunicaciones.
  const { detalleRegistro } = await import('@/lib/hospitality/compliance-store');
  const detalle = await detalleRegistro(tenantId, reservationId);
  if (!detalle) return { ok: false, motivo: 'desconocido', error: 'La reserva no existe en esta cuenta' };

  // Reenvío a un viajero concreto, o petición a todos los incompletos.
  //
  // A quién se le pide se decide por lo que le falta en los datos, no por la
  // columna guardada: si el Ministerio endurece los campos obligatorios, la
  // columna se queda atrás y el botón se negaría a pedir datos a quien la bandeja
  // marca en amarillo («no hay viajeros incompletos» con tres pendientes).
  let objetivo = viajerosAQuienesPedirDatos(detalle.reserva.travelers);
  if (soloViajeroId) {
    const viajero = detalle.reserva.travelers.find((v) => v.id === soloViajeroId);
    if (!viajero) {
      return { ok: false, motivo: 'desconocido', error: 'Ese viajero no pertenece a esta reserva' };
    }
    objetivo = viajerosAQuienesPedirDatos([viajero]);
  }
  if (objetivo.length === 0) {
    return {
      ok: false,
      motivo: 'desconocido',
      error: soloViajeroId
        ? 'Ese viajero ya tiene los datos completos: no hay nada que pedirle'
        : 'No hay viajeros incompletos a quienes pedirles datos',
    };
  }

  let telefono = guestTelefono(detalle.reserva.guestData);
  if (!telefono && detalle.reserva.contact?.telefono) telefono = detalle.reserva.contact.telefono;
  if (!telefono) {
    return {
      ok: false,
      motivo: 'sin_telefono',
      error: 'El huésped no tiene teléfono: añádeselo a la reserva o al contacto y vuelve a intentarlo',
    };
  }

  const nombreHuesped = guestNombre(detalle.reserva.guestData) || detalle.reserva.contact?.nombre || '';
  const unidad = detalle.reserva.unit?.nombre || '';
  const appUrl = getEnlaceAppUrl();

  // Se firman todos los enlaces antes de enviar: si falta el secreto, no se
  // manda un mensaje a medias.
  const firmados: { viajero: (typeof objetivo)[number]; nombre: string; token: string }[] = [];
  for (const viajero of objetivo) {
    try {
      firmados.push({
        viajero,
        nombre: [viajero.nombre, viajero.apellido1].filter(Boolean).join(' ').trim(),
        token: firmarTokenEnlace(viajero.id),
      });
    } catch (error) {
      if (error instanceof EnlaceNoConfigurado) {
        return { ok: false, motivo: 'desconocido', error: 'El servidor no tiene secreto para firmar enlaces (TRAVELER_LINK_SECRET)' };
      }
      throw error;
    }
  }

  // Un solo WhatsApp por huésped: la reserva tiene un teléfono y todos los
  // enlaces del grupo viajan en el mismo mensaje. El reenvío de un viajero
  // concreto (soloViajeroId) ya llega aquí con un único objetivo y conserva su
  // mensaje personalizado.
  const hayTitular =
    nombreHuesped &&
    firmados.some(
      (f) => f.nombre && nombreHuesped.toLowerCase().includes(f.nombre.split(' ')[0].toLowerCase())
    );
  const lineas = [
    hayTitular
      ? `Hola ${nombreHuesped.split(' ')[0]}, tu reserva${unidad ? ` en ${unidad}` : ''} está confirmada.`
      : `Hola, te escribimos por la reserva${unidad ? ` en ${unidad}` : ''} de ${nombreHuesped || 'tu grupo'}.`,
    firmados.length === 1
      ? 'La ley exige registrar los datos de cada viajero ante el Ministerio del Interior.'
      : 'La ley exige registrar los datos de cada viajero ante el Ministerio del Interior:',
    ...(firmados.length === 1
      ? [`Completa aquí tus datos (tarda un minuto): ${urlPedirDatos(appUrl, firmados[0].token)}`]
      : firmados.map((f) => `• ${f.nombre || 'Viajero'}: ${urlPedirDatos(appUrl, f.token)}`)),
  ];
  if (firmados.length > 1) lineas.push('Completa cada enlace con tus datos (tarda un minuto).');

  const res = await sendWhatsAppMessage(telefono, lineas.join('\n'), tenantId, true);
  if (!res?.success) {
    return { ok: false, motivo: 'whatsapp', error: res?.error || 'No se pudo enviar el mensaje por WhatsApp' };
  }

  // Seguimiento para la bandeja: cuándo se le pidió y cuántas veces. Solo se
  // marca tras un envío real; la auditoría queda por viajero.
  for (const f of firmados) {
    await registrarEnvioEnlace(f.viajero.id).catch(() => {});
    await logAuditAction(
      usuarioId,
      tenantId,
      'enviar',
      'hospitality_traveler',
      f.viajero.id,
      firmados.length > 1
        ? `Incluido en la solicitud grupal de datos por WhatsApp (${firmados.length} viajeros)`
        : `Solicitud de datos por WhatsApp para el viajero ${f.nombre || f.viajero.id}`
    ).catch(() => {});
  }

  return { ok: true, enviados: 1, total: 1, viajeros: firmados.length };
}
