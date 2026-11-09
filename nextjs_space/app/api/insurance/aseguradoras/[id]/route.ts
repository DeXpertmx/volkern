export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { maskIntegracionApi, mergeIntegracionApiForSave } from '@/lib/insurance/aseguradora-types';

// GET - Obtener aseguradora individual
export async function GET(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const aseguradora = await prisma.aseguradora.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
      include: {
        productos: { where: { activo: true }, orderBy: { nombre: 'asc' } },
        _count: { select: { polizas: true } },
      },
    });

    if (!aseguradora) {
      return NextResponse.json({ error: 'Aseguradora no encontrada' }, { status: 404 });
    }

    // Enmascarar secretos de integración (Bloque 6) en respuestas GET
    const segura = {
      ...aseguradora,
      integracionApi: aseguradora.integracionApi ? maskIntegracionApi(aseguradora.integracionApi) : null,
    };
    return NextResponse.json(segura);
  } catch (error) {
    console.error('Error al obtener aseguradora:', error);
    return NextResponse.json({ error: 'Error al obtener aseguradora' }, { status: 500 });
  }
}

// PATCH - Actualizar aseguradora
export async function PATCH(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const existing = await prisma.aseguradora.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Aseguradora no encontrada' }, { status: 404 });
    }

    const data = await req.json();
    const updateData: any = {};

    if (data.nombre !== undefined) {
      const dup = await prisma.aseguradora.findFirst({
        where: { tenantId: auth.tenant!.id, nombre: data.nombre, id: { not: params.id } },
      });
      if (dup) return NextResponse.json({ error: 'Ya existe una aseguradora con este nombre' }, { status: 400 });
      updateData.nombre = data.nombre;
    }

    if (data.nif !== undefined) updateData.nif = data.nif;
    if (data.direccion !== undefined) updateData.direccion = data.direccion;
    if (data.telefono !== undefined) updateData.telefono = data.telefono;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.web !== undefined) updateData.web = data.web;
    if (data.activa !== undefined) updateData.activa = data.activa;

    // Bloque 1: Identificación Legal y Fiscal
    if (data.razonSocial !== undefined) updateData.razonSocial = data.razonSocial;
    if (data.nombreComercial !== undefined) updateData.nombreComercial = data.nombreComercial;
    if (data.codigoPostal !== undefined) updateData.codigoPostal = data.codigoPostal;
    if (data.provincia !== undefined) updateData.provincia = data.provincia;
    if (data.pais !== undefined) updateData.pais = data.pais;
    if (data.regimenFiscal !== undefined) updateData.regimenFiscal = data.regimenFiscal;

    // Bloque 2: Regulación y Licencias
    if (data.numeroRegistro !== undefined) updateData.numeroRegistro = data.numeroRegistro;
    if (data.ramosAutorizados !== undefined) updateData.ramosAutorizados = data.ramosAutorizados;
    if (data.fechaVigenciaLicenciaInicio !== undefined)
      updateData.fechaVigenciaLicenciaInicio = data.fechaVigenciaLicenciaInicio ? new Date(data.fechaVigenciaLicenciaInicio) : null;
    if (data.fechaVigenciaLicenciaFin !== undefined)
      updateData.fechaVigenciaLicenciaFin = data.fechaVigenciaLicenciaFin ? new Date(data.fechaVigenciaLicenciaFin) : null;

    // Bloque 3: Contacto y Representación Legal
    if (data.representanteLegal !== undefined) updateData.representanteLegal = data.representanteLegal;
    if (data.mesaEntradas !== undefined) updateData.mesaEntradas = data.mesaEntradas;
    if (data.contactosOperativos !== undefined) updateData.contactosOperativos = data.contactosOperativos;

    // Bloque 4: Parámetros Operativos y Comerciales
    if (data.modelosComision !== undefined) updateData.modelosComision = data.modelosComision;
    if (data.condicionesPago !== undefined) updateData.condicionesPago = data.condicionesPago;
    if (data.limitesSuscripcion !== undefined) updateData.limitesSuscripcion = data.limitesSuscripcion;
    if (data.gestionSiniestros !== undefined) updateData.gestionSiniestros = data.gestionSiniestros;

    // Bloque 5: Configuración Financiera y Bancaria
    if (data.cuentasBancarias !== undefined) updateData.cuentasBancarias = data.cuentasBancarias;
    if (data.monedaBase !== undefined) updateData.monedaBase = data.monedaBase;
    if (data.monedaLiquidacion !== undefined) updateData.monedaLiquidacion = data.monedaLiquidacion;

    // Bloque 6: Integración Técnica y Seguridad
    // Sanitiza + deep-merge: si el cliente reenvía valores enmascarados del GET
    // (prefijo ••••) o solo una parte del objeto anidado (oauth/certificados),
    // NO se sobrescriben los secretos reales almacenados en BD.
    if (data.integracionApi !== undefined) {
      const merged = mergeIntegracionApiForSave(existing.integracionApi, data.integracionApi);
      if (merged === null) {
        // Limpieza explícita de todo el bloque.
        updateData.integracionApi = null;
      } else if (merged !== undefined) {
        // Prisma REEMPLAZA el campo Json completo en update (no hace merge).
        updateData.integracionApi = merged;
      }
      // Si el payload no traía campos útiles (todo masked) => merged undefined:
      // no tocamos el campo (los secretos reales de BD se conservan).
    }

    if (data.notas !== undefined) updateData.notas = data.notas;
    if (data.codigoExterno !== undefined) updateData.codigoExterno = data.codigoExterno;

    const aseguradora = await prisma.aseguradora.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(aseguradora);
  } catch (error) {
    console.error('Error al actualizar aseguradora:', error);
    return NextResponse.json({ error: 'Error al actualizar aseguradora' }, { status: 500 });
  }
}

// DELETE - Eliminar aseguradora
export async function DELETE(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const existing = await prisma.aseguradora.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
      include: { _count: { select: { polizas: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Aseguradora no encontrada' }, { status: 404 });
    }

    if (existing._count.polizas > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${existing._count.polizas} pólizas asociadas` },
        { status: 400 }
      );
    }

    await prisma.aseguradora.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar aseguradora:', error);
    return NextResponse.json({ error: 'Error al eliminar aseguradora' }, { status: 500 });
  }
}
