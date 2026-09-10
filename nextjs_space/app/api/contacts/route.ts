export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { incrementUsage } from '@/lib/subscription';
import { validateBody } from '@/lib/validation';
import { ContactCreateSchema } from '@/lib/validation/schemas';

// GET /api/contacts - Listar todos los contactos
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get('tipo'); // person, company
    const search = searchParams.get('search');
    const sinEmpresa = searchParams.get('sinEmpresa'); // true para contactos sin empresa

    const where: any = {
      tenantId: auth.tenant!.id
    };

    if (tipo) {
      where.tipo = tipo;
    }

    if (sinEmpresa === 'true') {
      where.companyId = null;
    }

    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    // El 'prisma' proxy redirige automáticamente a la base de datos física del tenant
    const contacts = await prisma.contact.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            nombre: true
          }
        },
        perfilFiscal: {
          // Incluir los datos fiscales que el flujo de facturación muestra al
          // seleccionar el contacto (sin nif decía "Sin datos fiscales").
          select: {
            id: true,
            idFiscalValidado: true,
            nif: true,
            razonSocial: true,
            address: true,
            city: true,
            country: true,
          }
        },
        _count: {
          select: {
            deals: true,
            persons: true
          }
        }
      },
      orderBy: {
        fechaCreacion: 'desc'
      }
    });

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Error al obtener contactos:', error);
    return NextResponse.json(
      { error: 'Error al obtener contactos' },
      { status: 500 }
    );
  }
}, ['contacts:read']);

// POST /api/contacts - Crear un nuevo contacto
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const userId = auth.user?.id;
    const tenantId = auth.tenant!.id;

    const body = await request.json();
    const data = validateBody(ContactCreateSchema, body);
    if (data instanceof NextResponse) return data;

    const { nombre, email, telefono, tipo, companyId, cargo, ubicacion, direccion, ciudad, codigoPostal, pais, linkedin, notas, tags } = data;

    // Verificar si el email ya existe en la DB del tenant (solo si hay email:
    // los contactos sin email no se consideran duplicados entre sí).
    const existingContact = email
      ? await prisma.contact.findFirst({
          where: {
            email
          }
        })
      : null;

    if (existingContact) {
      return NextResponse.json(
        { success: false, error: 'Ya existe un contacto con este email' },
        { status: 400 }
      );
    }

    const { createFiscalProfile, fiscalData: fiscalProfileData } = body;

    const contact = await prisma.contact.create({
      data: {
        tenantId, // Mantenemos tenantId para consistencia de esquema
        nombre,
        email,
        telefono,
        tipo: tipo || 'person',
        companyId,
        cargo,
        ubicacion,
        direccion,
        ciudad,
        codigoPostal,
        pais,
        linkedin,
        notas,
        tags,
        isTaxValidated: !!createFiscalProfile,
      } as any,
      include: {
        company: {
          select: {
            id: true,
            nombre: true
          }
        }
      }
    });

    // Crear PerfilFiscalCliente si se solicitó
    if (createFiscalProfile && fiscalProfileData) {
      await prisma.perfilFiscalCliente.create({
        data: {
          tenantId,
          contactId: contact.id,
          tipo: fiscalProfileData.tipo || 'EMPRESA',
          razonSocial: fiscalProfileData.razonSocial || nombre,
          country: fiscalProfileData.country || 'ES',
          tipoIdFiscal: fiscalProfileData.tipo === 'PARTICULAR' ? 'NIF' : 'CIF',
          nif: fiscalProfileData.nif || '',
          address: fiscalProfileData.address || null,
          city: fiscalProfileData.city || null,
          zipCode: fiscalProfileData.zipCode || null,
          idFiscalValidado: true,
          fechaValidacion: new Date(),
          defaultIva: 21.0,
          defaultIrpf: 0.0,
          recargoEquivalencia: false,
        }
      });
    }

    // Audit log
    const { AuditService } = await import('@/lib/audit-service');
    const requestIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    await AuditService.log({
      tenantId,
      userId: userId || 'api',
      action: 'crear',
      entity: 'contact',
      entityId: contact.id,
      description: `Contacto "${nombre}" creado`,
      changesAfter: { nombre, email, tipo },
      ipAddress: (requestIp as string) || '',
      userAgent
    });

    // Track usage
    try {
      await incrementUsage(tenantId, 'contacts', 1);
    } catch (usageError) {
      console.error('[POST /contacts] Error tracking usage:', usageError);
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error al crear contacto:', error);
    return NextResponse.json(
      { error: 'Error al crear contacto' },
      { status: 500 }
    );
  }
}, ['contacts:write']);
