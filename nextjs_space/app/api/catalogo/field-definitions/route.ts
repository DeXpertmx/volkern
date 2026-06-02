export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

/**
 * GET /api/catalogo/field-definitions
 * Lista todas las definiciones de campos personalizados del tenant
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['catalogo:read']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const categoria = searchParams.get('categoria');
    const soloActivos = searchParams.get('activos') !== 'false';

    const whereClause: any = {
      tenantId: auth.tenant.id,
    };

    if (soloActivos) {
      whereClause.activo = true;
    }

    if (categoria) {
      whereClause.OR = [
        { categoria: categoria },
        { categoria: null } // Campos globales (sin categoría específica)
      ];
    }

    const fieldDefinitions = await prisma.catalogoFieldDefinition.findMany({
      where: whereClause,
      orderBy: [
        { categoria: 'asc' },
        { orden: 'asc' },
        { label: 'asc' }
      ]
    });

    // Normalizar options: Prisma devuelve Json? que puede ser array u objeto
    const normalized = fieldDefinitions.map(f => ({
      ...f,
      options: Array.isArray(f.options) ? f.options : []
    }));

    return NextResponse.json({
      success: true,
      fieldDefinitions: normalized,
      total: normalized.length
    });
  } catch (error: any) {
    console.error('Error fetching field definitions:', error);
    return NextResponse.json(
      { error: 'Error al obtener definiciones de campos' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/catalogo/field-definitions
 * Crea una nueva definición de campo personalizado
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['catalogo:write']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      fieldKey,
      label,
      type,
      options,
      required,
      orden,
      categoria,
      placeholder,
      unidad,
      valorDefecto
    } = body;

    // Validaciones
    if (!fieldKey || !label || !type) {
      return NextResponse.json(
        { error: 'fieldKey, label y type son requeridos' },
        { status: 400 }
      );
    }

    // Validar que fieldKey sea un identificador válido (sin espacios, caracteres especiales)
    const fieldKeyRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!fieldKeyRegex.test(fieldKey)) {
      return NextResponse.json(
        { 
          error: 'fieldKey debe ser un identificador válido (letras, números y guiones bajos, comenzando con letra)',
          ejemplo: 'superficie_m2, num_habitaciones, tipo_operacion'
        },
        { status: 400 }
      );
    }

    // Validar tipo
    const tiposValidos = ['text', 'number', 'select', 'boolean', 'date', 'url', 'textarea'];
    if (!tiposValidos.includes(type)) {
      return NextResponse.json(
        { error: `Tipo inválido. Tipos válidos: ${tiposValidos.join(', ')}` },
        { status: 400 }
      );
    }

    // Si es select, options es requerido
    if (type === 'select' && (!options || !Array.isArray(options) || options.length === 0)) {
      return NextResponse.json(
        { error: 'Para campos tipo "select", options es requerido y debe ser un array no vacío' },
        { status: 400 }
      );
    }

    // Verificar que no exista ya un campo con el mismo fieldKey para este tenant
    const existente = await prisma.catalogoFieldDefinition.findUnique({
      where: {
        tenantId_fieldKey: {
          tenantId: auth.tenant.id,
          fieldKey: fieldKey
        }
      }
    });

    if (existente) {
      return NextResponse.json(
        { error: `Ya existe un campo con la clave "${fieldKey}"` },
        { status: 409 }
      );
    }

    // Obtener el máximo orden actual para asignar el siguiente
    const maxOrden = await prisma.catalogoFieldDefinition.aggregate({
      where: { tenantId: auth.tenant.id },
      _max: { orden: true }
    });

    const fieldDefinition = await prisma.catalogoFieldDefinition.create({
      data: {
        tenantId: auth.tenant.id,
        fieldKey,
        label,
        type,
        options: options || null,
        required: required || false,
        orden: orden ?? (maxOrden._max.orden ?? 0) + 1,
        categoria: categoria || null,
        placeholder: placeholder || null,
        unidad: unidad || null,
        valorDefecto: valorDefecto || null,
        activo: true
      }
    });

    // Audit log
    if (auth.user?.id) {
      await prisma.auditLog.create({
        data: {
          tenantId: auth.tenant.id,
          userId: auth.user.id,
          accion: 'CREATE',
          entidad: 'CatalogoFieldDefinition',
          entidadId: fieldDefinition.id,
          descripcion: `Campo personalizado "${label}" (${fieldKey}) creado`,
          cambiosDespues: JSON.stringify(fieldDefinition)
        }
      });
    }

    return NextResponse.json({
      success: true,
      fieldDefinition
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating field definition:', error);
    return NextResponse.json(
      { error: 'Error al crear definición de campo', details: error.message },
      { status: 500 }
    );
  }
}
