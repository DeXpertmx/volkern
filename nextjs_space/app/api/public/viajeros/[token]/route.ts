export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verificarTokenEnlace } from '@/lib/hospitality/compliance-link';
import { camposFaltantes } from '@/lib/hospitality/compliance';
import {
  actualizarViajero,
  registrarRespuestaEnlace,
  type EntradaViajero,
} from '@/lib/hospitality/compliance-store';

/** Estados del parte de viajeros en los que ya no se puede escribir desde el enlace. */
const PV_ENVIADOS = new Set(['enviado', 'completo', 'procesando']);

const ETIQUETAS_CAMPO: Record<string, string> = {
  nombre: 'nombre',
  apellido1: 'primer apellido',
  fechaNacimiento: 'fecha de nacimiento',
  tipoDocumento: 'tipo de documento',
  numeroDocumento: 'número de documento',
  soporteDocumento: 'soporte del documento',
  direccion: 'dirección (vía y número)',
  codigoPostal: 'código postal',
};

/**
 * POST /api/public/viajeros/[token] — el viajero guarda sus datos.
 *
 * El token firmado autoriza escribir UNICAMENTE sobre su viajero. Los campos
 * que llegan vacíos no borran lo ya guardado (el formulario no rellena el
 * documento para que nadie con el enlace lo vea): se validan los datos
 * fusionados y solo se envía a la API interna lo que el viajero escribió.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const verificacion = verificarTokenEnlace(params.token);
    if (!verificacion.ok) {
      const mensaje =
        verificacion.motivo === 'caducado'
          ? 'El enlace ha caducado: pide uno nuevo al alojamiento'
          : 'El enlace no es válido';
      return NextResponse.json({ error: mensaje }, { status: verificacion.motivo === 'caducado' ? 410 : 403 });
    }

    const cuerpo = (await req.json().catch(() => null)) as Record<string, string> | null;
    if (!cuerpo) return NextResponse.json({ error: 'Faltan los datos del formulario' }, { status: 400 });

    const viajero = await prisma.hospitalityTraveler.findUnique({
      where: { id: verificacion.viajeroId },
      select: {
        id: true,
        tenantId: true,
        nombre: true,
        apellido1: true,
        apellido2: true,
        tipoDocumento: true,
        numeroDocumento: true,
        soporteDocumento: true,
        fechaNacimiento: true,
        nacionalidad: true,
        direccion: true,
        municipio: true,
        codigoMunicipio: true,
        codigoPostal: true,
        paisDireccion: true,
        reservation: {
          select: {
            tenantId: true,
            externalBookingId: true,
            compliance: { select: { estadoViajeros: true } },
          },
        },
      },
    });
    if (!viajero || !viajero.reservation) {
      return NextResponse.json({ error: 'Este registro ya no existe' }, { status: 404 });
    }

    // Si el parte de viajeros ya salió al Ministerio, este formulario no puede
    // reescribirlo: habría que comunicar una modificación, no un alta.
    const estadoPV = viajero.reservation.compliance?.estadoViajeros ?? null;
    if (estadoPV && PV_ENVIADOS.has(estadoPV)) {
      return NextResponse.json(
        { error: 'Tus datos ya fueron comunicados al registro oficial: contacta con el alojamiento para cualquier cambio' },
        { status: 409 }
      );
    }

    // Fusión: lo que el viajero dejó vacío conserva su valor guardado.
    const limpiar = (valor: string | undefined): string | null => (valor ?? '').trim() || null;
    const fusionado = {
      nombre: limpiar(cuerpo.nombre) ?? viajero.nombre,
      apellido1: limpiar(cuerpo.apellido1) ?? viajero.apellido1,
      apellido2: limpiar(cuerpo.apellido2) ?? viajero.apellido2,
      tipoDocumento: limpiar(cuerpo.tipoDocumento) ?? viajero.tipoDocumento,
      numeroDocumento: limpiar(cuerpo.numeroDocumento) ?? viajero.numeroDocumento,
      soporteDocumento: limpiar(cuerpo.soporteDocumento) ?? viajero.soporteDocumento,
      fechaNacimiento: limpiar(cuerpo.fechaNacimiento) ?? viajero.fechaNacimiento,
      nacionalidad: limpiar(cuerpo.nacionalidad) ?? viajero.nacionalidad,
      direccion: limpiar(cuerpo.direccion) ?? viajero.direccion,
      municipio: limpiar(cuerpo.municipio) ?? viajero.municipio,
      codigoMunicipio: limpiar(cuerpo.codigoMunicipio) ?? viajero.codigoMunicipio,
      codigoPostal: limpiar(cuerpo.codigoPostal) ?? viajero.codigoPostal,
      paisDireccion: limpiar(cuerpo.paisDireccion) ?? viajero.paisDireccion,
    };

    const faltantes = camposFaltantes(fusionado);
    if (faltantes.length > 0) {
      const lista = faltantes.map((c) => ETIQUETAS_CAMPO[c] || c).join(', ');
      return NextResponse.json({ error: `Faltan datos obligatorios: ${lista}` }, { status: 400 });
    }

    // Solo lo que el viajero escribió de verdad se envía (PATCH por campo).
    // La dirección entra por el mismo camino que el documento: es dato que el
    // Ministerio exige, se guarda para comunicarla y no se vuelve a mostrar por
    // esta vía pública (los campos fusionados que no escribió el viajero no se
    // tocan; aquí solo se manda lo que él escribió).
    const entrada: Partial<EntradaViajero> = {};
    if (limpiar(cuerpo.nombre)) entrada.nombre = fusionado.nombre!;
    if (limpiar(cuerpo.apellido1)) entrada.apellido1 = fusionado.apellido1!;
    if (cuerpo.apellido2 !== undefined) entrada.apellido2 = limpiar(cuerpo.apellido2);
    if (limpiar(cuerpo.tipoDocumento)) entrada.tipoDocumento = fusionado.tipoDocumento;
    if (limpiar(cuerpo.numeroDocumento)) entrada.numeroDocumento = fusionado.numeroDocumento;
    if (limpiar(cuerpo.soporteDocumento)) entrada.soporteDocumento = fusionado.soporteDocumento;
    if (limpiar(cuerpo.fechaNacimiento)) entrada.fechaNacimiento = fusionado.fechaNacimiento!;
    if (cuerpo.nacionalidad !== undefined) entrada.nacionalidad = fusionado.nacionalidad;
    if (limpiar(cuerpo.direccion)) entrada.direccion = fusionado.direccion;
    if (limpiar(cuerpo.municipio)) entrada.municipio = fusionado.municipio;
    if (limpiar(cuerpo.codigoMunicipio)) entrada.codigoMunicipio = fusionado.codigoMunicipio;
    if (limpiar(cuerpo.codigoPostal)) entrada.codigoPostal = fusionado.codigoPostal;
    if (limpiar(cuerpo.paisDireccion)) entrada.paisDireccion = fusionado.paisDireccion;

    const actualizado = await actualizarViajero(
      viajero.tenantId,
      viajero.id,
      entrada,
      'viajero-enlace-publico'
    );
    if (!actualizado) return NextResponse.json({ error: 'Este registro ya no existe' }, { status: 404 });

    // Para la bandeja: el viajero respondió al enlace de WhatsApp.
    await registrarRespuestaEnlace(viajero.id).catch(() => {});

    // Auditoría al nivel de las acciones internas: quién (viajero identificado
    // por el enlace firmado), qué campos tocó y desde dónde. Se registran los
    // nombres de campo, no sus valores: el log de auditoría no pasa por el
    // enmascaramiento de documentos que aplica la API interna.
    //
    // Se inserta directo (patrón de los crons) y SIN userId: AuditLog.userId es
    // una FK real a User y un actor sintético la violaría en silencio; el actor
    // se documenta en metadata. Mismo verbo y entidad que la edición interna
    // del viajero ('editar' / 'hospitality_traveler').
    await prisma.auditLog
      .create({
        data: {
          tenantId: viajero.tenantId,
          accion: 'editar',
          entidad: 'hospitality_traveler',
          entidadId: viajero.id,
          descripcion: `El viajero completó sus datos desde el enlace firmado de la reserva ${viajero.reservation.externalBookingId}`,
          metadata: {
            actor: 'viajero-enlace-publico',
            campos: Object.keys(entrada),
          },
          ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
          userAgent: req.headers.get('user-agent') || undefined,
        },
      })
      .catch((error) => console.error('[Hospitality] Error auditando el alta pública del viajero:', error));

    return NextResponse.json({ ok: true, estado: actualizado.estado });
  } catch (error) {
    console.error('[Hospitality] Error guardando datos del viajero desde el enlace:', error);
    return NextResponse.json({ error: 'No se pudieron guardar tus datos' }, { status: 500 });
  }
}
