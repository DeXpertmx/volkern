export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('id');

  if (!productId) {
    return NextResponse.json({ error: 'Missing product ID' }, { status: 400 });
  }

  try {
    // Buscar el ítem en el catálogo
    const item = await prisma.catalogoItem.findUnique({
      where: { id: productId },
      select: { 
        id: true,
        nombre: true,
        // En Volkern, el stock puede estar en StockLevel vinculado al Warehouse
        stockLevels: {
          select: { cantidad: true }
        }
      }
    });

    if (!item) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Sumar stock de todos los almacenes
    const totalStock = item.stockLevels.reduce((sum, level) => sum + level.cantidad, 0);

    return NextResponse.json({ 
      productId, 
      stock: totalStock,
      lastUpdated: new Date()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
