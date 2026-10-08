export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { sugerenciasDeReposicion } from '@/lib/compras/service';

/**
 * GET /api/compras/sugerencias — Artículos por debajo de su punto de pedido.
 *
 * Es la fuente del botón «Generar orden de compra sugerida» del hub de
 * inventario: devuelve artículo, almacén, lo que hay, el umbral y cuánto
 * pediría el sistema, para que el operador lo revise antes de crear el pedido.
 */
export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const sugerencias = await sugerenciasDeReposicion(auth.tenant!.id);
    return NextResponse.json({ total: sugerencias.length, sugerencias });
  } catch (error) {
    console.error('Error calculando sugerencias de compra:', error);
    return NextResponse.json({ error: 'Error al calcular las sugerencias' }, { status: 500 });
  }
}, ['erp:read']);
