import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// GET - Obtener todas las definiciones de campos personalizados para el tenant
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['leads:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const fields = await prisma.leadFieldDefinition.findMany({
      where: {
        tenantId: auth.tenant!.id,
        activo: true
      },
      orderBy: {
        orden: 'asc'
      }
    });

    return NextResponse.json(fields);
  } catch (error) {
    console.error('Error fetching lead fields:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST - Crear o actualizar una definición de campo
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['leads:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, fieldKey, label, type, required, options, orden, placeholder, valorDefecto } = body;

    if (!fieldKey || !label || !type) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    if (id) {
      // Update
      const field = await prisma.leadFieldDefinition.update({
        where: { id, tenantId: auth.tenant!.id },
        data: { label, type, required, options, orden, placeholder, valorDefecto }
      });
      return NextResponse.json(field);
    } else {
      // Create
      const field = await prisma.leadFieldDefinition.create({
        data: {
          tenantId: auth.tenant!.id,
          fieldKey,
          label,
          type,
          required,
          options,
          orden,
          placeholder,
          valorDefecto
        }
      });
      return NextResponse.json(field);
    }
  } catch (error) {
    console.error('Error saving lead field:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE - Desactivar un campo
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['leads:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    await prisma.leadFieldDefinition.delete({
      where: { id, tenantId: auth.tenant!.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead field:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
