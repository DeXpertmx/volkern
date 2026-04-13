import { ProductionService } from '../lib/erp/production-service';
import { prisma } from '../lib/db';

async function fireTestVisionLock() {
  console.log('--- 🔥 INICIANDO PRUEBA DE FUEGO: PROTOCOLO VISION-LOCK ---');
  
  // 1. Crear entorno controlado de prueba
  const testTenantId = `test_vault_${Date.now()}`;
  const MADRID = { lat: 40.4168, lng: -3.7038 };
  const BARCELONA = { lat: 41.3851, lng: 2.1734 };

  const tenant = await prisma.tenant.create({
    data: { id: testTenantId, nombre: 'Industrial Test Lab', slug: testTenantId }
  });

  const project = await prisma.project.create({
    data: { 
      tenantId: testTenantId, 
      name: 'Planta de Energía Solar Madrid',
      latitude: MADRID.lat,
      longitude: MADRID.lng
    }
  });

  const itemId = `solar_${Date.now()}`;
  const item = await prisma.catalogoItem.create({
    data: { id: itemId, tenantId: testTenantId, nombre: 'Panel Solar X1', precioBase: 500, moneda: 'EUR' }
  });

  const bom = await prisma.billOfMaterials.create({
    data: {
      tenantId: testTenantId,
      productId: item.id,
      components: []
    }
  });

  const wo = await prisma.workOrder.create({
    data: {
      tenantId: testTenantId,
      projectId: project.id,
      bomId: bom.id,
      batchNumber: `BT-TEST-${Date.now()}`,
      quantityToMake: 100
    }
  });

  console.log(`📍 Entorno creado: Proyecto '${project.name}' ubicado en MADRID.`);

  // --- PRUEBA 1: GPS OUT OF RANGE (Barcelona vs Madrid) ---
  console.log('\n--- ❌ PRUEBA 1: Reporte desde fuera de rango (Distancia > 100m) ---');
  try {
    await ProductionService.reportWaste({
      tenantId: testTenantId,
      workOrderId: wo.id,
      itemId: itemId,
      quantity: 1,
      evidenceUrl: 'https://cdn.volkern.app/test/legal.jpg',
      reportLat: BARCELONA.lat, // BARCELONA
      reportLng: BARCELONA.lng,
      clientTimestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.log(`🛡️ BLOQUEO EXITOSO: ${err.message}`);
  }

  // --- PRUEBA 2: EXIF TIME SYNC (Foto vieja) ---
  console.log('\n--- ❌ PRUEBA 2: Manipulación de tiempo (Foto de hace 24 horas) ---');
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    await ProductionService.reportWaste({
      tenantId: testTenantId,
      workOrderId: wo.id,
      itemId: itemId,
      quantity: 1,
      evidenceUrl: 'https://cdn.volkern.app/test/legal.jpg',
      reportLat: MADRID.lat, // UBICACION CORRECTA
      reportLng: MADRID.lng,
      clientTimestamp: yesterday.toISOString() // TIEMPO INCORRECTO
    });
  } catch (err: any) {
    console.log(`🛡️ BLOQUEO EXITOSO: ${err.message}`);
  }

  // --- PRUEBA 3: FRAUDE VISUAL (Detección de textura/recaptura) ---
  console.log('\n--- ❌ PRUEBA 3: Intento de recaptura (Foto de pantalla) ---');
  try {
    await ProductionService.reportWaste({
      tenantId: testTenantId,
      workOrderId: wo.id,
      itemId: itemId,
      quantity: 1,
      evidenceUrl: 'https://cdn.volkern.app/test/screen_recapture_detected.jpg', // DISPARADOR SIMULACIÓN
      reportLat: MADRID.lat,
      reportLng: MADRID.lng,
      clientTimestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.log(`🛡️ BLOQUEO EXITOSO: ${err.message}`);
  }

  // --- PRUEBA 4: ÉXITO (Todo en regla) ---
  console.log('\n--- ✅ PRUEBA 4: Reporte íntegro (GPS OK, Tiempo OK, Visión OK) ---');
  try {
    const result = await ProductionService.reportWaste({
      tenantId: testTenantId,
      workOrderId: wo.id,
      itemId: itemId,
      quantity: 1,
      evidenceUrl: 'https://cdn.volkern.app/test/valid_scrap.jpg',
      reportLat: MADRID.lat + 0.0001, // 10 metros de diferencia
      reportLng: MADRID.lng + 0.0001,
      clientTimestamp: new Date().toISOString()
    });
    console.log(`✅ REPORTE ACEPTADO: Veredicto: ${result.verdict}`);
  } catch (err: any) {
    console.error(`❌ FALLO INESPERADO: ${err.message}`);
  }

  // Verificar incidentes creados
  const incidents = await prisma.securityIncident.findMany({
    where: { tenantId: testTenantId, type: { in: ['GPS_DISTANCE_ANOMALY', 'EXIF_TIME_MISMATCH', 'INTEGRITY_ANOMALY'] } },
    orderBy: { timestamp: 'desc' },
    take: 3
  });

  console.log('\n--- 🚨 LOG DE INCIDENTES GENERADOS (The Vault 2.0) ---');
  incidents.forEach(inc => {
    console.log(`Type: ${inc.type} | Severity: ${inc.severity} | Detail: ${inc.details.substring(0, 80)}...`);
  });

  console.log('\n--- 🔥 PRUEBA DE FUEGO FINALIZADA ---');
}

fireTestVisionLock();
