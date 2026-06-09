import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function seedLogistics(tenantId: string) {
  console.log('🚚 Sembrando datos de Logística...')

  const now = new Date()
  const updatedAt = now
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000)
  const today = () => {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    return d
  }

  // ─── 1. FLOTA (5 vehículos) ───
  const vehicles = await Promise.all([
    (prisma as any).erp_fleet_vehicles.upsert({
      where: { id: 'fleet-van-001' },
      update: {},
      create: {
        id: 'fleet-van-001',
        tenantId,
        plate: 'MAT-8421',
        brand: 'Mercedes-Benz',
        model: 'Sprinter 319',
        year: 2023,
        type: 'furgoneta',
        capacity: 3500,
        capacityUnit: 'kg',
        status: 'ACTIVE',
        currentKm: 45230,
        lastMaintenanceKm: 40000,
        itvExpiration: daysFromNow(45),
        insuranceExpiration: daysFromNow(120),
        fuelType: 'diesel',
      },
    }),
    (prisma as any).erp_fleet_vehicles.upsert({
      where: { id: 'fleet-cam-002' },
      update: {},
      create: {
        id: 'fleet-cam-002',
        tenantId,
        plate: 'MAT-5632',
        brand: 'Iveco',
        model: 'Daily 70C18',
        year: 2022,
        type: 'camion',
        capacity: 7500,
        capacityUnit: 'kg',
        status: 'ACTIVE',
        currentKm: 89120,
        lastMaintenanceKm: 80000,
        itvExpiration: daysFromNow(12),
        insuranceExpiration: daysFromNow(90),
        fuelType: 'diesel',
      },
    }),
    (prisma as any).erp_fleet_vehicles.upsert({
      where: { id: 'fleet-fur-003' },
      update: {},
      create: {
        id: 'fleet-fur-003',
        tenantId,
        plate: 'MAT-3345',
        brand: 'Ford',
        model: 'Transit 350L',
        year: 2024,
        type: 'furgoneta',
        capacity: 1800,
        capacityUnit: 'kg',
        status: 'ACTIVE',
        currentKm: 12450,
        itvExpiration: daysFromNow(210),
        insuranceExpiration: daysFromNow(6),
        fuelType: 'hibrido',
      },
    }),
    (prisma as any).erp_fleet_vehicles.upsert({
      where: { id: 'fleet-cam-004' },
      update: {},
      create: {
        id: 'fleet-cam-004',
        tenantId,
        plate: 'MAT-9087',
        brand: 'MAN',
        model: 'TGS 26.480',
        year: 2021,
        type: 'camion',
        capacity: 18000,
        capacityUnit: 'kg',
        status: 'MAINTENANCE',
        currentKm: 156780,
        lastMaintenanceKm: 150000,
        itvExpiration: daysFromNow(180),
        insuranceExpiration: daysFromNow(200),
        fuelType: 'diesel',
      },
    }),
    (prisma as any).erp_fleet_vehicles.upsert({
      where: { id: 'fleet-mot-005' },
      update: {},
      create: {
        id: 'fleet-mot-005',
        tenantId,
        plate: 'MAT-1122',
        brand: 'Yamaha',
        model: 'Nmax 155',
        year: 2024,
        type: 'moto',
        capacity: 50,
        capacityUnit: 'kg',
        status: 'ACTIVE',
        currentKm: 3200,
        itvExpiration: daysFromNow(365),
        insuranceExpiration: daysFromNow(180),
        fuelType: 'gasolina',
      },
    }),
  ])
  console.log(`✅ ${vehicles.length} vehículos creados`)

  // ─── 2. ALMACENES (3) ───
  const warehouses = await Promise.all([
    prisma.warehouse.upsert({
      where: { id: 'wh-central' },
      update: {},
      create: {
        id: 'wh-central',
        tenantId,
        name: 'Almacén Central',
        location: 'Polígono Industrial La Fuensanta, Málaga',
        active: true,
        description: 'Almacén principal con capacidad para 5000 palets',
      },
    }),
    prisma.warehouse.upsert({
      where: { id: 'wh-norte' },
      update: {},
      create: {
        id: 'wh-norte',
        tenantId,
        name: 'Almacén Norte',
        location: 'Parque Logístico Plaza, Zaragoza',
        active: true,
        description: 'Centro de distribución para zona norte y noreste',
      },
    }),
    prisma.warehouse.upsert({
      where: { id: 'wh-sur' },
      update: {},
      create: {
        id: 'wh-sur',
        tenantId,
        name: 'Almacén Sur',
        location: 'Polígono Industrial El Manchón, Sevilla',
        active: true,
        description: 'Almacén de respaldo para distribución sur',
      },
    }),
  ])
  console.log(`✅ ${warehouses.length} almacenes creados`)

  // ─── 3. PRODUCTOS (Catálogo) ───
  const productos = await Promise.all([
    prisma.catalogoItem.upsert({
      where: { id: 'log-prod-001' },
      update: {},
      create: { id: 'log-prod-001', tenantId, nombre: 'Widget A-200', sku: 'WID-A200', precioBase: 25.50, tipo: 'producto' },
    }),
    prisma.catalogoItem.upsert({
      where: { id: 'log-prod-002' },
      update: {},
      create: { id: 'log-prod-002', tenantId, nombre: 'Widget B-150', sku: 'WID-B150', precioBase: 18.00, tipo: 'producto' },
    }),
    prisma.catalogoItem.upsert({
      where: { id: 'log-prod-003' },
      update: {},
      create: { id: 'log-prod-003', tenantId, nombre: 'Componente X1', sku: 'COM-X1', precioBase: 45.00, tipo: 'producto' },
    }),
    prisma.catalogoItem.upsert({
      where: { id: 'log-prod-004' },
      update: {},
      create: { id: 'log-prod-004', tenantId, nombre: 'Componente Y2', sku: 'COM-Y2', precioBase: 32.75, tipo: 'producto' },
    }),
  ])
  console.log(`✅ ${productos.length} productos de catálogo creados`)

  // ─── CONTACT (required by erp_sales_orders FK) ───
  const logContact = await prisma.contact.upsert({
    where: { id: 'log-contact-001' },
    update: {},
    create: {
      id: 'log-contact-001',
      tenantId,
      nombre: 'Cliente Logística Default',
      email: 'logistica-cliente@ejemplo.com',
      tipo: 'company',
    },
  })
  console.log('✅ Contacto de logística creado')

  // ─── INDUSTRIAL ASSETS (for maintenance orders FK) ───
  await (prisma as any).erp_maintenance_orders.deleteMany({ where: { tenantId } }).catch(() => {})
  await (prisma as any).erp_industrial_assets.deleteMany({ where: { tenantId } }).catch(() => {})
  
  const assetsToCreate = [
    { id: 'fleet-cam-002', name: 'Iveco Daily MAT-5632' },
    { id: 'fleet-cam-004', name: 'MAN TGS MAT-9087' },
    { id: 'fleet-van-001', name: 'Mercedes Sprinter MAT-8421' },
    { id: 'fleet-fur-003', name: 'Ford Transit MAT-3345' },
  ]
  for (const a of assetsToCreate) {
    await (prisma as any).erp_industrial_assets.create({
      data: { id: a.id, tenantId, name: a.name, status: 'OPERATIONAL', createdAt: new Date(), updatedAt: new Date() },
    })
  }
  console.log(`✅ ${assetsToCreate.length} activos industriales creados`)

  // ─── STOCK LEVELS ───
  const stockLevels = await Promise.all([
    (prisma as any).stockLevel.upsert({
      where: { id: 'stock-central-001' },
      update: {},
      create: {
        id: 'stock-central-001',
        tenantId,
        warehouseId: 'wh-central',
        catalogoItemId: 'log-prod-001',
        quantity: 340,
        minStock: 50,
        maxStock: 500,
      },
    }),
    (prisma as any).stockLevel.upsert({
      where: { id: 'stock-central-002' },
      update: {},
      create: {
        id: 'stock-central-002',
        tenantId,
        warehouseId: 'wh-central',
        catalogoItemId: 'log-prod-002',
        quantity: 120,
        minStock: 30,
        maxStock: 300,
      },
    }),
    (prisma as any).stockLevel.upsert({
      where: { id: 'stock-central-003' },
      update: {},
      create: {
        id: 'stock-central-003',
        tenantId,
        warehouseId: 'wh-central',
        catalogoItemId: 'log-prod-003',
        quantity: 4,
        minStock: 20,
        maxStock: 200,
      },
    }),
    (prisma as any).stockLevel.upsert({
      where: { id: 'stock-norte-001' },
      update: {},
      create: {
        id: 'stock-norte-001',
        tenantId,
        warehouseId: 'wh-norte',
        catalogoItemId: 'log-prod-001',
        quantity: 85,
        minStock: 20,
        maxStock: 200,
      },
    }),
    (prisma as any).stockLevel.upsert({
      where: { id: 'stock-norte-003' },
      update: {},
      create: {
        id: 'stock-norte-003',
        tenantId,
        warehouseId: 'wh-norte',
        catalogoItemId: 'log-prod-003',
        quantity: 2,
        minStock: 10,
        maxStock: 100,
      },
    }),
    (prisma as any).stockLevel.upsert({
      where: { id: 'stock-sur-004' },
      update: {},
      create: {
        id: 'stock-sur-004',
        tenantId,
        warehouseId: 'wh-sur',
        catalogoItemId: 'log-prod-004',
        quantity: 60,
        minStock: 15,
        maxStock: 150,
      },
    }),
  ])
  console.log(`✅ ${stockLevels.length} registros de stock creados`)

  // ─── 4. ÓRDENES DE MANTENIMIENTO (5) ───
  const maintenanceOrders = await Promise.all([
    (prisma as any).erp_maintenance_orders.upsert({
      where: { id: 'mnt-001' },
      update: {},
      create: {
        id: 'mnt-001',
        tenantId,
        assetId: 'fleet-cam-002',
        type: 'PREVENTIVE',
        status: 'PLANNED',
        description: 'Cambio de aceite y filtros — Iveco Daily MAT-5632',
        plannedDate: daysFromNow(5),
      },
    }),
    (prisma as any).erp_maintenance_orders.upsert({
      where: { id: 'mnt-002' },
      update: {},
      create: {
        id: 'mnt-002',
        tenantId,
        assetId: 'fleet-cam-004',
        type: 'CORRECTIVE',
        status: 'IN_PROGRESS',
        description: 'Reparación de frenos y revisión de suspensión — MAN TGS MAT-9087',
        plannedDate: daysAgo(2),
        startDate: daysAgo(2),
      },
    }),
    (prisma as any).erp_maintenance_orders.upsert({
      where: { id: 'mnt-003' },
      update: {},
      create: {
        id: 'mnt-003',
        tenantId,
        assetId: 'fleet-van-001',
        type: 'PREVENTIVE',
        status: 'PLANNED',
        description: 'Revisión de 50.000 km — Mercedes Sprinter MAT-8421',
        plannedDate: daysFromNow(12),
      },
    }),
    (prisma as any).erp_maintenance_orders.upsert({
      where: { id: 'mnt-004' },
      update: {},
      create: {
        id: 'mnt-004',
        tenantId,
        assetId: 'fleet-fur-003',
        type: 'PREVENTIVE',
        status: 'COMPLETED',
        description: 'Mantenimiento programado — Ford Transit MAT-3345',
        plannedDate: daysAgo(10),
        startDate: daysAgo(10),
        endDate: daysAgo(9),
      },
    }),
    (prisma as any).erp_maintenance_orders.upsert({
      where: { id: 'mnt-005' },
      update: {},
      create: {
        id: 'mnt-005',
        tenantId,
        assetId: 'fleet-cam-002',
        type: 'PREVENTIVE',
        status: 'PLANNED',
        description: 'ITV programada — Iveco Daily MAT-5632 (vence en 12 días)',
        plannedDate: daysFromNow(10),
      },
    }),
  ])
  console.log(`✅ ${maintenanceOrders.length} órdenes de mantenimiento creadas`)

  // ─── 5. ÓRDENES DE VENTA (5) ───
  const salesOrders = await Promise.all([
    (prisma as any).erp_sales_orders.upsert({
      where: { id: 'so-001' },
      update: {},
      create: {
        id: 'so-001', tenantId, contactId: logContact.id,
        batchNumber: 'V-2024-001', status: 'CONFIRMED',
        totalPrice: 1250.00, subtotal: 1033.06, taxTotal: 216.94, grandTotal: 1250.00,
        currency: 'EUR', updatedAt,
        requestedDate: daysAgo(3), deliveryPromise: daysAgo(1),
      },
    }),
    (prisma as any).erp_sales_orders.upsert({
      where: { id: 'so-002' },
      update: {},
      create: {
        id: 'so-002', tenantId, contactId: logContact.id,
        batchNumber: 'V-2024-002', status: 'CONFIRMED',
        totalPrice: 890.50, subtotal: 735.95, taxTotal: 154.55, grandTotal: 890.50,
        currency: 'EUR', updatedAt,
        requestedDate: daysAgo(2), deliveryPromise: today(),
      },
    }),
    (prisma as any).erp_sales_orders.upsert({
      where: { id: 'so-003' },
      update: {},
      create: {
        id: 'so-003', tenantId, contactId: logContact.id,
        batchNumber: 'V-2024-003', status: 'DRAFT',
        totalPrice: 2340.00, subtotal: 1933.88, taxTotal: 406.12, grandTotal: 2340.00,
        currency: 'EUR', updatedAt,
        requestedDate: daysFromNow(5),
      },
    }),
    (prisma as any).erp_sales_orders.upsert({
      where: { id: 'so-004' },
      update: {},
      create: {
        id: 'so-004', tenantId, contactId: logContact.id,
        batchNumber: 'V-2024-004', status: 'CONFIRMED',
        totalPrice: 3200.00, subtotal: 2644.63, taxTotal: 555.37, grandTotal: 3200.00,
        currency: 'EUR', updatedAt,
        requestedDate: daysAgo(7), deliveryPromise: daysAgo(5),
      },
    }),
    (prisma as any).erp_sales_orders.upsert({
      where: { id: 'so-005' },
      update: {},
      create: {
        id: 'so-005', tenantId, contactId: logContact.id,
        batchNumber: 'V-2024-005', status: 'CONFIRMED',
        totalPrice: 675.00, subtotal: 557.85, taxTotal: 117.15, grandTotal: 675.00,
        currency: 'EUR', updatedAt,
        requestedDate: daysAgo(1), deliveryPromise: daysFromNow(2),
      },
    }),
  ])
  console.log(`✅ ${salesOrders.length} órdenes de venta creadas`)

  // ─── 6. ENVÍOS (6) ───
  const shipments = await Promise.all([
    // Entregado con POD
    (prisma as any).erp_shipments.upsert({
      where: { id: 'shp-001' },
      update: {},
      create: {
        id: 'shp-001',
        tenantId,
        salesOrderId: 'so-001',
        batchNumber: 'SHP-2024-001',
        status: 'DELIVERED',
        carrier: 'SEUR',
        trackingNumber: 'SEUR-482917365',
        dispatchedAt: daysAgo(2),
        deliveredAt: daysAgo(1),
        receiverName: 'Carlos Martínez',
        // GPS: Málaga → Madrid
        originLat: 36.7213,
        originLng: -4.4214,
        destinationLat: 40.4168,
        destinationLng: -3.7038,
        currentLat: 40.4168,
        currentLng: -3.7038,
        lastGpsUpdate: daysAgo(1),
        routeWaypoints: [
          { lat: 37.1600, lng: -4.1500 },
          { lat: 38.0000, lng: -3.8500 },
          { lat: 38.8800, lng: -3.7200 },
          { lat: 39.5000, lng: -3.6500 },
        ],
      },
    }),
    // En tránsito
    (prisma as any).erp_shipments.upsert({
      where: { id: 'shp-002' },
      update: {},
      create: {
        id: 'shp-002',
        tenantId,
        salesOrderId: 'so-002',
        batchNumber: 'SHP-2024-002',
        status: 'SHIPPED',
        carrier: 'MRW',
        trackingNumber: 'MRW-739201846',
        dispatchedAt: daysAgo(1),
        deliveredAt: null,
        receiverName: null,
        // GPS: Málaga → Barcelona (en ruta, 40% del trayecto)
        originLat: 36.7213,
        originLng: -4.4214,
        destinationLat: 41.3874,
        destinationLng: 2.1686,
        currentLat: 38.9500,
        currentLng: -1.2000,
        lastGpsUpdate: new Date(),
        routeWaypoints: [
          { lat: 37.5000, lng: -3.9000 },
          { lat: 38.7000, lng: -2.5000 },
          { lat: 39.8000, lng: -1.1000 },
          { lat: 40.5000, lng: 0.1000 },
          { lat: 41.0000, lng: 1.2000 },
        ],
      },
    }),
    // Preparando
    (prisma as any).erp_shipments.upsert({
      where: { id: 'shp-003' },
      update: {},
      create: {
        id: 'shp-003',
        tenantId,
        salesOrderId: 'so-003',
        batchNumber: 'SHP-2024-003',
        status: 'PREPARING',
        carrier: null,
        trackingNumber: null,
        dispatchedAt: null,
        deliveredAt: null,
        // GPS: Zaragoza → Bilbao (preparando, aún en origen)
        originLat: 41.6488,
        originLng: -0.8891,
        destinationLat: 43.2630,
        destinationLng: -2.9350,
        currentLat: 41.6488,
        currentLng: -0.8891,
        lastGpsUpdate: new Date(),
        routeWaypoints: [
          { lat: 42.0000, lng: -1.2000 },
          { lat: 42.5000, lng: -1.8000 },
          { lat: 42.9000, lng: -2.5000 },
        ],
      },
    }),
    // Entregado con POD
    (prisma as any).erp_shipments.upsert({
      where: { id: 'shp-004' },
      update: {},
      create: {
        id: 'shp-004',
        tenantId,
        salesOrderId: 'so-004',
        batchNumber: 'SHP-2024-004',
        status: 'DELIVERED',
        carrier: 'DHL',
        trackingNumber: 'DHL-5544332211',
        dispatchedAt: daysAgo(6),
        deliveredAt: daysAgo(5),
        receiverName: 'Ana López',
        // GPS: Zaragoza → Sevilla
        originLat: 41.6488,
        originLng: -0.8891,
        destinationLat: 37.3891,
        destinationLng: -5.9845,
        currentLat: 37.3891,
        currentLng: -5.9845,
        lastGpsUpdate: daysAgo(5),
        routeWaypoints: [
          { lat: 40.5000, lng: -1.5000 },
          { lat: 39.2000, lng: -3.0000 },
          { lat: 38.2000, lng: -4.5000 },
          { lat: 37.8000, lng: -5.5000 },
        ],
      },
    }),
    // En tránsito
    (prisma as any).erp_shipments.upsert({
      where: { id: 'shp-005' },
      update: {},
      create: {
        id: 'shp-005',
        tenantId,
        salesOrderId: 'so-005',
        batchNumber: 'SHP-2024-005',
        status: 'SHIPPED',
        carrier: 'Correos Express',
        trackingNumber: 'CEX-9988776655',
        dispatchedAt: daysAgo(0.5),
        deliveredAt: null,
        // GPS: Málaga → Valencia (en ruta, 25% del trayecto)
        originLat: 36.7213,
        originLng: -4.4214,
        destinationLat: 39.4699,
        destinationLng: -0.3763,
        currentLat: 38.0000,
        currentLng: -2.5000,
        lastGpsUpdate: new Date(),
        routeWaypoints: [
          { lat: 37.2000, lng: -3.8000 },
          { lat: 37.8000, lng: -2.8000 },
          { lat: 38.3000, lng: -1.8000 },
          { lat: 38.8000, lng: -0.8000 },
        ],
      },
    }),
    // Pendiente (nuevo)
    (prisma as any).erp_shipments.upsert({
      where: { id: 'shp-006' },
      update: {},
      create: {
        id: 'shp-006',
        tenantId,
        salesOrderId: 'so-003',
        batchNumber: 'SHP-2024-006',
        status: 'PENDING',
        carrier: null,
        trackingNumber: null,
        dispatchedAt: null,
        deliveredAt: null,
        // GPS: Sevilla → Granada (pendiente, en origen)
        originLat: 37.3891,
        originLng: -5.9845,
        destinationLat: 37.1773,
        destinationLng: -3.5986,
        currentLat: 37.3891,
        currentLng: -5.9845,
        lastGpsUpdate: new Date(),
        routeWaypoints: [
          { lat: 37.3000, lng: -5.0000 },
          { lat: 37.2000, lng: -4.2000 },
        ],
      },
    }),
  ])
  console.log(`✅ ${shipments.length} envíos creados`)

  // ─── 7. CONFIRMACIONES DE ENTREGA (POD) ───
  const confirmations = await Promise.all([
    (prisma as any).erp_delivery_confirmations.upsert({
      where: { id: 'pod-001' },
      update: {},
      create: {
        id: 'pod-001',
        tenantId,
        shipmentId: 'shp-001',
        confirmedBy: 'Carlos Martínez',
        confirmedAt: daysAgo(1),
        notes: 'Recibido en perfectas condiciones. Producto conforme.',
      },
    }),
    (prisma as any).erp_delivery_confirmations.upsert({
      where: { id: 'pod-004' },
      update: {},
      create: {
        id: 'pod-004',
        tenantId,
        shipmentId: 'shp-004',
        confirmedBy: 'Ana López',
        confirmedAt: daysAgo(5),
        notes: 'Entrega completa. Firma digital registrada.',
        signatureHash: 'sha256-abc123def456',
      },
    }),
  ])
  console.log(`✅ ${confirmations.length} confirmaciones de entrega creadas`)

  // ─── 8. PROMESAS DE ENTREGA (try, no crítico) ───
  try {
    await Promise.all([
      (prisma as any).erp_delivery_promises.upsert({
        where: { id: 'promise-001' },
        update: {},
        create: {
          id: 'promise-001', tenantId, salesOrderId: 'so-001',
          promisedDate: daysAgo(1), status: 'MET', actualDate: daysAgo(1),
          deliveryPath: {} as any, updatedAt: now,
        },
      }),
      (prisma as any).erp_delivery_promises.upsert({
        where: { id: 'promise-002' },
        update: {},
        create: {
          id: 'promise-002', tenantId, salesOrderId: 'so-002',
          promisedDate: today(), status: 'PENDING', actualDate: null,
          deliveryPath: {} as any, updatedAt: now,
        },
      }),
    ])
    console.log('✅ Promesas de entrega creadas')
  } catch (e: any) {
    console.log('⚠️ Promesas de entrega omitidas:', e.message)
  }

  const counts = {
    vehicles: vehicles.length,
    warehouses: warehouses.length,
    stockLevels: stockLevels.length,
    maintenanceOrders: maintenanceOrders.length,
    salesOrders: salesOrders.length,
    shipments: shipments.length,
    confirmations: confirmations.length,
  }

  console.log(`📊 Resumen Logística:`, counts)
  return counts
}

// ─── Ejecución directa ───
async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'volkern-default' } })
  if (!tenant) {
    console.error('❌ Tenant predeterminado no encontrado. Ejecuta primero: npx tsx scripts/seed.ts')
    process.exit(1)
  }

  await seedLogistics(tenant.id)
  await prisma.$disconnect()
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
}
