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
        reservation: {
          select: {
            tenantId: true,
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
    };

    const faltantes = camposFaltantes(fusionado);
    if (faltantes.length > 0) {
      const lista = faltantes.map((c) => ETIQUETAS_CAMPO[c] || c).join(', ');
      return NextResponse.json({ error: `Faltan datos obligatorios: ${lista}` }, { status: 400 });
    }

    // Solo lo que el viajero escribió de verdad se envía (PATCH por campo).
    const entrada: Partial<EntradaViajero> = {};
    if (limpiar(cuerpo.nombre)) entrada.nombre = fusionado.nombre!;
    if (limpiar(cuerpo.apellido1)) entrada.apellido1 = fusionado.apellido1!;
    if (cuerpo.apellido2 !== undefined) entrada.apellido2 = limpiar(cuerpo.apellido2);
    if (limpiar(cuerpo.tipoDocumento)) entrada.tipoDocumento = fusionado.tipoDocumento;
    if (limpiar(cuerpo.numeroDocumento)) entrada.numeroDocumento = fusionado.numeroDocumento;
    if (limpiar(cuerpo.soporteDocumento)) entrada.soporteDocumento = fusionado.soporteDocumento;
    if (limpiar(cuerpo.fechaNacimiento)) entrada.fechaNacimiento = fusionado.fechaNacimiento!;
    if (cuerpo.nacionalidad !== undefined) entrada.nacionalidad = fusionado.nacionalidad;

    const actualizado = await actualizarViajero(
      viajero.tenantId,
      viajero.id,
      entrada,
      'viajero-enlace-publico'
    );
    if (!actualizado) return NextResponse.json({ error: 'Este registro ya no existe' }, { status: 404 });

    // Para la bandeja: el viajero respondió al enlace de WhatsApp.
    await registrarRespuestaEnlace(viajero.id).catch(() => {});

    return NextResponse.json({ ok: true, estado: actualizado.estado });
  } catch (error) {
    console.error('[Hospitality] Error guardando datos del viajero desde el enlace:', error);
    return NextResponse.json({ error: 'No se pudieron guardar tus datos' }, { status: 500 });
  }
}
