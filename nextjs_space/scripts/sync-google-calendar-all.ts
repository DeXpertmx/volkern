#!/usr/bin/env tsx

/**
 * Standalone script for Google Calendar sync
 * Can be run directly without the Next.js server
 */

import { syncAllFutureCitas, syncFromGoogleToVolkern } from '../lib/google-calendar';
import { prisma } from '../lib/db';

async function main() {
  const startTime = Date.now();
  
  try {
    console.log('\n========================================');
    console.log('🔄 INICIANDO SINCRONIZACIÓN AUTOMÁTICA DE TODOS LOS TENANTS');
    console.log(`📅 Fecha: ${new Date().toISOString()}`);
    console.log('========================================\n');

    // Obtener todos los tenants con integración activa
    const activeIntegrations = await prisma.googleCalendarIntegration.findMany({
      where: { activo: true },
      select: {
        userId: true,
        tenantId: true,
        tenant: {
          select: {
            nombre: true,
          },
        },
      },
    });

    console.log(`📊 Tenants con integración activa: ${activeIntegrations.length}`);

    if (activeIntegrations.length === 0) {
      const result = {
        success: true,
        message: 'No hay tenants con integración activa',
        results: [],
        summary: {
          total: 0,
          successful: 0,
          failed: 0,
          duration: Date.now() - startTime,
        },
      };
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    const results: Array<{
      tenantId: string;
      tenantName: string;
      success: boolean;
      volkernToGoogle?: number;
      error?: string;
    }> = [];

    // Procesar cada tenant
    for (const integration of activeIntegrations) {
      const userId = integration.userId;
      const tenantName = integration.tenant?.nombre || 'Unknown';
      
      console.log(`\n--- Procesando: ${tenantName} (userId: ${userId}) ---`);
      
      try {
        // PASO 1: Volkern → Google
        console.log('  📤 Sincronizando Volkern → Google...');
        const volkernToGoogleResult = await syncAllFutureCitas(userId);
        console.log(`  ✅ ${volkernToGoogleResult.creados + volkernToGoogleResult.actualizados}/${volkernToGoogleResult.total} citas enviadas`);

        // PASO 2: Google → Volkern
        console.log('  📥 Sincronizando Google → Volkern...');
        await syncFromGoogleToVolkern(userId, false); // false = usar syncToken (incremental)
        console.log('  ✅ Eventos importados');

        results.push({
          tenantId: integration.tenantId,
          tenantName,
          success: true,
          volkernToGoogle: volkernToGoogleResult.creados + volkernToGoogleResult.actualizados,
        });

      } catch (tenantError: any) {
        console.error(`  ❌ Error: ${tenantError.message}`);
        results.push({
          tenantId: integration.tenantId,
          tenantName,
          success: false,
          error: tenantError.message,
        });
      }
    }

    // Resumen
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const duration = Date.now() - startTime;

    console.log('\n========================================');
    console.log('📊 RESUMEN DE SINCRONIZACIÓN');
    console.log(`  ✅ Exitosos: ${successful}`);
    console.log(`  ❌ Fallidos: ${failed}`);
    console.log(`  ⏱️ Duración: ${duration}ms`);
    console.log('========================================\n');

    const result = {
      success: true,
      message: `Sincronización completada para ${activeIntegrations.length} tenant(s)`,
      results,
      summary: {
        total: activeIntegrations.length,
        successful,
        failed,
        duration,
      },
    };

    console.log('\n=== RESULTADO JSON ===');
    console.log(JSON.stringify(result, null, 2));
    
    return result;

  } catch (error: any) {
    console.error('❌ Error crítico en sync-all:', error.message);
    console.error('Stack:', error.stack);
    
    const result = {
      success: false,
      error: 'Error en sincronización masiva',
      details: error.message,
      duration: Date.now() - startTime,
    };
    
    console.log('\n=== RESULTADO JSON ===');
    console.log(JSON.stringify(result, null, 2));
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
