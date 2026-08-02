export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { maskIntegracionApi, sanitizeIntegracionApiForSave } from '@/lib/insurance/aseguradora-types';

// GET - Listar aseguradoras
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const activa = searchParams.get('activa');

    const where: any = { tenantId: auth.tenant!.id };
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { nif: { contains: search, mode: 'insensitive' } },
        { razonSocial: { contains: search, mode: 'insensitive' } },
        { nombreComercial: { contains: search, mode: 'insensitive' } },
        { numeroRegistro: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (activa !== null && activa !== undefined) {
      where.activa = activa === 'true';
    }

    const aseguradoras = await prisma.aseguradora.findMany({
      where,
      include: {
        _count: { select: { polizas: true, productos: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    // Envolver en objeto { aseguradoras } para que la UI lea data.aseguradoras
    // (también aceptamos el formato legacy de array plano por compatibilidad).
    // Los secretos de integración (Bloque 6) se enmascaran: nunca exponer API keys.
    const seguras = aseguradoras.map((a) => ({
      ...a,
      integracionApi: a.integracionApi ? maskIntegracionApi(a.integracionApi) : null,
    }));
    return NextResponse.json({ aseguradoras: seguras });
  } catch (error) {
    console.error('Error al obtener aseguradoras:', error);
    return NextResponse.json({ error: 'Error al obtener aseguradoras' }, { status: 500 });
  }
}

// POST - Crear aseguradora
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const data = await req.json();
    const {
      nombre, nif, direccion, telefono, email, web,
      razonSocial, nombreComercial, codigoPostal, provincia, pais, regimenFiscal,
      numeroRegistro, ramosAutorizados, fechaVigenciaLicenciaInicio, fechaVigenciaLicenciaFin,
      representanteLegal, mesaEntradas, contactosOperativos,
      modelosComision, condicionesPago, limitesSuscripcion, gestionSiniestros,
      cuentasBancarias, monedaBase, monedaLiquidacion,
      integracionApi,
      notas, codigoExterno, activa,
    } = data;

    if (!nombre) {
      return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
    }

    // Verificar duplicado
    const existing = await prisma.aseguradora.findFirst({
      where: { tenantId: auth.tenant!.id, nombre },
    });
    if (existing) {
      return NextResponse.json({ error: 'Ya existe una aseguradora con este nombre' }, { status: 400 });
    }

    const aseguradora = await prisma.aseguradora.create({
      data: {
        tenantId: auth.tenant!.id,
        nombre,
        nif: nif || null,
        direccion: direccion || null,
        telefono: telefono || null,
        email: email || null,
        web: web || null,
        // Bloque 1: Identificación Legal y Fiscal
        razonSocial: razonSocial || null,
        nombreComercial: nombreComercial || null,
        codigoPostal: codigoPostal || null,
        provincia: provincia || null,
        pais: pais || null,
        regimenFiscal: regimenFiscal || null,
        // Bloque 2: Regulación y Licencias
        numeroRegistro: numeroRegistro || null,
        ramosAutorizados: ramosAutorizados ?? null,
        fechaVigenciaLicenciaInicio: fechaVigenciaLicenciaInicio ? new Date(fechaVigenciaLicenciaInicio) : null,
        fechaVigenciaLicenciaFin: fechaVigenciaLicenciaFin ? new Date(fechaVigenciaLicenciaFin) : null,
        // Bloque 3: Contacto y Representación Legal
        representanteLegal: representanteLegal ?? null,
        mesaEntradas: mesaEntradas || null,
        contactosOperativos: contactosOperativos ?? null,
        // Bloque 4: Parámetros Operativos y Comerciales
        modelosComision: modelosComision ?? null,
        condicionesPago: condicionesPago ?? null,
        limitesSuscripcion: limitesSuscripcion ?? null,
        gestionSiniestros: gestionSiniestros ?? null,
        // Bloque 5: Configuración Financiera y Bancaria
        cuentasBancarias: cuentasBancarias ?? null,
        monedaBase: monedaBase || null,
        monedaLiquidacion: monedaLiquidacion || null,
        // Bloque 6: Integración Técnica y Seguridad
        // Sanitiza también en POST: si el cliente reenvía valores enmascarados
        // (p.ej. clonando una ficha desde el GET), no se persisten sentinels.
        // `as any`: el resto del objeto viene de req.json() sin tipar.
        integracionApi: integracionApi
          ? ((sanitizeIntegracionApiForSave(integracionApi) ?? null) as any)
          : null,
        notas: notas || null,
        codigoExterno: codigoExterno || null,
        activa: activa !== undefined ? activa : true,
      },
    });

    return NextResponse.json(aseguradora, { status: 201 });
  } catch (error) {
    console.error('Error al crear aseguradora:', error);
    return NextResponse.json({ error: 'Error al crear aseguradora' }, { status: 500 });
  }
}
