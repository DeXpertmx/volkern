export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { ItemIntegrityService } from '@/lib/security/item-integrity';

// GET - Obtener ítem específico
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const item = await prisma.catalogoItem.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id,
      },
      include: {
        tasaImpuesto: true,
        _count: {
          select: {
            servicios: true,
            cursos: true,
            citas: true,
            cotizacionItems: true,
            contratoItems: true,
            ordenVentaItems: true,
          },
        },
        inventoryConfig: true,
        billOfMaterials: {
          include: {
            components: {
              include: {
                component: {
                  select: { id: true, nombre: true, sku: true }
                }
              }
            }
          }
        }
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error al obtener ítem:', error);
    return NextResponse.json({ error: 'Error al obtener ítem' }, { status: 500 });
  }
}

// PATCH - Actualizar ítem
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const data = await req.json();
    const {
      nombre,
      descripcion,
      sku,
      tipo,
      precioBase,
      moneda,
      categoriaFiscal,
      tasaImpuestoId,
      duracionMinutos,
      modalidad,
      unidad,
      activo,
      destacado,
      media,
      pricing,
      customFieldValues,
      categorias,
      etiquetas,
      metadata,
      // Onboarding 2.0 / MRP Fields
      isManufactured,
      costOfAcquisition,
      inventoryConfig, // { minStock, reorderPoint, valuationMethod, storageLocation }
      bom, // { laborCost, overheadCost, components: [{ componentId, quantityRequired, unit }] }
    } = data;

    // Verificar que el ítem existe y pertenece al tenant
    const existing = await prisma.catalogoItem.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }

    // Verificar SKU único si se está actualizando
    if (sku && sku !== existing.sku) {
      const skuExists = await prisma.catalogoItem.findFirst({
        where: {
          tenantId: auth.tenant!.id,
          sku,
          id: { not: params.id },
        },
      });
      if (skuExists) {
        return NextResponse.json(
          { error: 'Ya existe un ítem con este SKU' },
          { status: 400 }
        );
      }
    }

    const updateData: any = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (sku !== undefined) updateData.sku = sku || null;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (precioBase !== undefined) updateData.precioBase = parseFloat(precioBase);
    if (moneda !== undefined) updateData.moneda = moneda;
    if (categoriaFiscal !== undefined) updateData.categoriaFiscal = categoriaFiscal;
    if (tasaImpuestoId !== undefined) updateData.tasaImpuestoId = tasaImpuestoId || null;
    if (duracionMinutos !== undefined) updateData.duracionMinutos = duracionMinutos ? parseInt(duracionMinutos) : null;
    if (modalidad !== undefined) updateData.modalidad = modalidad || null;
    if (unidad !== undefined) updateData.unidad = unidad;
    if (activo !== undefined) updateData.activo = activo;
    if (destacado !== undefined) updateData.destacado = destacado;
    // Nuevos campos Fase 1
    if (customFieldValues !== undefined) updateData.customFieldValues = customFieldValues;
    if (categorias !== undefined) updateData.categorias = categorias;
    if (etiquetas !== undefined) updateData.etiquetas = etiquetas;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (media !== undefined) updateData.media = media;
    if (pricing !== undefined) updateData.pricing = pricing;
    if (isManufactured !== undefined) updateData.isManufactured = isManufactured;
    if (costOfAcquisition !== undefined) updateData.costOfAcquisition = parseFloat(costOfAcquisition);

    // 🛡️ Integrity Hash: Calcular si cambian campos críticos
    if (updateData.nombre || updateData.precioBase !== undefined || updateData.costOfAcquisition !== undefined || updateData.sku) {
      updateData.integrityHash = ItemIntegrityService.calculateHash({
        tenantId: auth.tenant!.id,
        nombre: updateData.nombre || existing.nombre,
        sku: updateData.sku === undefined ? existing.sku : updateData.sku,
        precioBase: updateData.precioBase === undefined ? existing.precioBase : updateData.precioBase,
        costOfAcquisition: updateData.costOfAcquisition === undefined ? existing.costOfAcquisition : updateData.costOfAcquisition,
      });
    }

    // 📦 Inventory Config
    if (inventoryConfig) {
      updateData.inventoryConfig = {
        upsert: {
          create: inventoryConfig,
          update: inventoryConfig,
        }
      };
    }

    // 🏗️ Bill of Materials (BoM)
    if (isManufactured && bom) {
      const bomData = {
        tenantId: auth.tenant!.id,
        laborCost: parseFloat(bom.laborCost || 0),
        overheadCost: parseFloat(bom.overheadCost || 0),
        components: {
          deleteMany: {}, // Simplificado: recreamos componentes
          create: bom.components.map((c: any) => ({
            componentId: c.componentId,
            quantityRequired: parseFloat(c.quantityRequired),
            unit: c.unit || 'unit'
          }))
        }
      };

      updateData.billOfMaterials = {
        upsert: {
          create: bomData,
          update: bomData
        }
      };
    }

    const item = await prisma.catalogoItem.update({
      where: { id: params.id },
      data: updateData,
      include: {
        tasaImpuesto: true,
        inventoryConfig: true,
        billOfMaterials: {
          include: { components: true }
        }
      },
    });

    // 🧠 AI Indexing Stub: Si hay documento técnico, solicitar indexación al MCP
    if (media?.documento_tecnico) {
      console.log(`[MCP] Requesting indexing for document: ${media.documento_tecnico} (Item: ${item.id})`);
      // TODO: Call MCP tool 'index_technical_spec' via internal bridge
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error al actualizar ítem:', error);
    return NextResponse.json({ error: 'Error al actualizar ítem' }, { status: 500 });
  }
}

// DELETE - Eliminar ítem
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // Verificar que el ítem existe y pertenece al tenant
    const existing = await prisma.catalogoItem.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id,
      },
      include: {
        _count: {
          select: {
            citas: true,
            cotizacionItems: true,
            contratoItems: true,
            ordenVentaItems: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }

    // Verificar si el ítem está en uso
    const totalUso = 
      existing._count.citas +
      existing._count.cotizacionItems +
      existing._count.contratoItems +
      existing._count.ordenVentaItems;

    if (totalUso > 0) {
      return NextResponse.json(
        { 
          error: 'No se puede eliminar el ítem porque está en uso',
          detalles: {
            citas: existing._count.citas,
            cotizaciones: existing._count.cotizacionItems,
            contratos: existing._count.contratoItems,
            ordenesVenta: existing._count.ordenVentaItems,
          }
        },
        { status: 400 }
      );
    }

    await prisma.catalogoItem.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar ítem:', error);
    return NextResponse.json({ error: 'Error al eliminar ítem' }, { status: 500 });
  }
}
