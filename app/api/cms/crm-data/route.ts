export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/cms/crm-data?type=servicios|catalogo|lead-fields
 * Provee datos del CRM para alimentar componentes del constructor (ej. selectores de servicios)
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const type = new URL(req.url).searchParams.get('type');

    if (type === 'servicios') {
      const servicios = await prisma.servicio.findMany({
        where: { tenantId, activo: true },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          duracionMinutos: true,
          precio: true,
          moneda: true,
          modalidad: true,
        },
        orderBy: { nombre: 'asc' },
      });
      return NextResponse.json({ items: servicios });
    }

    if (type === 'catalogo') {
      const items = await prisma.catalogoItem.findMany({
        where: { tenantId, activo: true },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          tipo: true,
          precioBase: true,
          moneda: true,
          duracionMinutos: true,
          modalidad: true,
          categorias: true,
          etiquetas: true,
          customFieldValues: true,
          media: true,
        },
        orderBy: { nombre: 'asc' },
      });
      return NextResponse.json({ items });
    }

    if (type === 'lead-fields') {
      const standardFields = [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'telefono', label: 'Teléfono', type: 'phone', required: false },
        { name: 'empresa', label: 'Empresa', type: 'text', required: false },
        { name: 'cargo', label: 'Cargo', type: 'text', required: false },
        { name: 'ubicacion', label: 'Ubicación', type: 'text', required: false },
        { name: 'fuente', label: 'Fuente', type: 'text', required: false },
        { name: 'notas', label: 'Notas / Mensaje', type: 'textarea', required: false },
        { name: 'contextoProyecto', label: 'Contexto del Proyecto', type: 'textarea', required: false },
      ];
      return NextResponse.json({ fields: standardFields });
    }

    if (type === 'field-definitions') {
      const tenantName = auth.tenant!.nombre;
      
      // Intentar inferir definiciones de campos desde items existentes
      const sampleItems = await prisma.catalogoItem.findMany({
        where: { tenantId },
        select: { customFieldValues: true },
        take: 10,
      });
      
      const fieldNames = new Set<string>();
      sampleItems.forEach(item => {
        if (item.customFieldValues && typeof item.customFieldValues === 'object') {
          Object.keys(item.customFieldValues as object).forEach(k => fieldNames.add(k));
        }
      });
      
      return NextResponse.json({
        tenant: tenantName,
        customFields: Array.from(fieldNames),
      });
    }

    return NextResponse.json({ 
      error: 'Tipo no válido. Usa: servicios, catalogo, lead-fields, field-definitions' 
    }, { status: 400 });
  } catch (error) {
    console.error('Error fetching CRM data:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}, ['cms:read']);
