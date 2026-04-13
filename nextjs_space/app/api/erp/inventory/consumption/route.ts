import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';

/**
 * POST /api/erp/inventory/consumption
 * Procesa el consumo de un ítem (directo o via BoM) y activa el radar de IA.
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { productId, quantity, warehouseId } = body;

    if (!productId || quantity === undefined) {
      return NextResponse.json({ error: 'productId y quantity son obligatorios' }, { status: 400 });
    }

    // 1. Ejecutar consumo
    const result = await skills.process_inventory_consumption({
      tenantId: auth.tenant!.id,
      productId,
      quantity: parseFloat(quantity),
      warehouseId,
      userId: auth.user?.id
    });

    // 2. Ejecutar Watchdog de forma asíncrona (fuera del await principal para no bloquear la respuesta)
    // En un entorno serverless/Next.js, si queremos asegurar ejecución usamos un background job, 
    // pero para Volkern local, podemos dispararlo y dejar que corra.
    skills.inventory_watchdog({ tenantId: auth.tenant!.id }).catch(err => {
      console.error('[InventoryWatchdog] Error background task:', err);
    });

    return NextResponse.json({
      success: true,
      message: 'Consumo procesado exitosamente',
      details: result
    });

  } catch (error) {
    console.error('Error in inventory consumption API:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error interno al procesar consumo' 
    }, { status: 500 });
  }
}, ['erp:write']);
