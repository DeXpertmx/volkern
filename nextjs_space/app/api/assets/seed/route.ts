import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // Verificar si ya hay activos
    const count = await prisma.asset.count({ where: { tenantId } });
    if (count > 0) {
      return NextResponse.json({ message: 'Ya existen activos para este tenant.', count });
    }

    const testAssets = [
      {
        name: 'MacBook Pro M3 Max',
        category: 'HARDWARE',
        model: 'A2991',
        serialNumber: 'SN-VOLK-001',
        status: 'ASSIGNED',
        purchasePrice: 3500.00,
        purchaseDate: new Date('2024-01-15'),
        metadata: { processor: 'M3 Max', ram: '64GB' }
      },
      {
        name: 'Tesla Model 3 Admin',
        category: 'VEHICLE',
        model: '2024 Performance',
        serialNumber: 'VIN-VOLK-999',
        status: 'AVAILABLE',
        purchasePrice: 45000.00,
        purchaseDate: new Date('2024-02-10'),
        metadata: { color: 'Pearl White' }
      },
      {
        name: 'Licencia Adobe Creative Cloud',
        category: 'SOFTWARE',
        model: 'Enterprise Plan',
        serialNumber: 'LIC-ADOBE-CC',
        status: 'AVAILABLE',
        purchasePrice: 85.00,
        renewalDate: new Date('2025-01-01'),
        metadata: { users: 5 }
      }
    ];

    const created = await Promise.all(
      testAssets.map(asset => 
        prisma.asset.create({
          data: { ...asset, tenantId }
        })
      )
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Activos de prueba generados.', 
      count: created.length 
    });
  } catch (error: any) {
    console.error('[AssetsSeed] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, { requiredScopes: ['hr:write'] });
