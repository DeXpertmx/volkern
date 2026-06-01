/**
 * Retro-Provisioning de Dominios de Email para Tenants Existentes
 *
 * Este script permite provisionar el dominio de email (Resend + Cloudflare DNS)
 * para tenants que fueron creados antes de que existiera este sistema.
 *
 * Uso:
 *   npx tsx scripts/retro-provision-email-domain.ts
 *     → Lista todos los tenants sin dominio de email configurado
 *
 *   npx tsx scripts/retro-provision-email-domain.ts --tenant dexpert
 *     → Provisiona el tenant con subdominio "dexpert"
 *
 *   npx tsx scripts/retro-provision-email-domain.ts --all
 *     → Provisiona todos los tenants con subdominio no nulo
 *
 *   npx tsx scripts/retro-provision-email-domain.ts --verify dexpert
 *     → Solo verifica el estado del dominio en Resend
 *
 * Requisitos:
 *   - RESEND_API_KEY en variables de entorno
 *   - CLOUDFLARE_API_TOKEN en variables de entorno (opcional, DNS se puede configurar manual)
 *   - Conexión a la base de datos (DATABASE_URL)
 */

import { PrismaClient } from '@prisma/client';
import { registerDomain, verifyDomain, buildTenantEmailDomain, deleteDomain } from '../lib/resend-domains';
import { getRootZoneId, configureEmailDnsRecords } from '../lib/cloudflare-dns';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────

function printLine(char: string = '─', length: number = 60) {
  console.log(char.repeat(length));
}

function printHeader(title: string) {
  printLine('═');
  console.log(`  ${title}`);
  printLine('═');
}

function printStatus(label: string, value: string, icon: string = '•') {
  console.log(`  ${icon} ${label}: ${value}`);
}

// ─── Acciones ────────────────────────────────────────────────

async function listTenantsWithoutEmailDomain() {
  const tenants = await prisma.tenant.findMany({
    where: {
      emailDomainStatus: 'not_started',
    },
    select: {
      id: true,
      nombre: true,
      slug: true,
      subdomain: true,
    },
    orderBy: { fechaCreacion: 'desc' },
  });

  if (tenants.length === 0) {
    console.log('\n✅ Todos los tenants tienen dominio de email configurado.');
    return;
  }

  console.log(`\n📋 Tenants SIN dominio de email (${tenants.length}):\n`);
  
  const withSubdomain = tenants.filter(t => t.subdomain);
  const withoutSubdomain = tenants.filter(t => !t.subdomain);

  if (withSubdomain.length > 0) {
    console.log(`  🏆 Con subdominio (aptos para provisionar):\n`);
    for (const t of withSubdomain) {
      const emailDomain = buildTenantEmailDomain(t.subdomain!);
      console.log(`     ID:       ${t.id}`);
      console.log(`     Empresa:  ${t.nombre}`);
      console.log(`     Subdomin: ${t.subdomain}`);
      console.log(`     Dominio:  ${emailDomain}`);
      console.log('');
    }
  }

  if (withoutSubdomain.length > 0) {
    console.log(`  ⚠️  Sin subdominio (requieren configuración previa): ${withoutSubdomain.length}`);
    for (const t of withoutSubdomain.slice(0, 5)) {
      console.log(`     - ${t.nombre} (${t.slug})`);
    }
    if (withoutSubdomain.length > 5) {
      console.log(`     ... y ${withoutSubdomain.length - 5} más`);
    }
    console.log('');
  }

  console.log('  Para provisionar:');
  console.log(`    npx tsx scripts/retro-provision-email-domain.ts --tenant <subdominio>`);
  console.log(`    npx tsx scripts/retro-provision-email-domain.ts --all\n`);
}

async function retroProvisionTenant(subdomain: string, tenantName?: string) {
  printHeader(`Provisionando dominio email para: ${subdomain}`);

  // 1. Buscar tenant
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain },
  });

  if (!tenant) {
    console.error(`\n❌ No se encontró tenant con subdominio "${subdomain}"`);
    return false;
  }

  if (tenant.resendDomainId) {
    console.log(`\n⚠️  El tenant ya tiene un dominio Resend registrado (ID: ${tenant.resendDomainId})`);
    console.log(`   Estado actual: ${tenant.emailDomainStatus}`);
    
    const { confirm } = await askForConfirmation('¿Quieres re-provisionar (eliminar y recrear)?');
    if (!confirm) {
      console.log('  Omitido.');
      return true;
    }
    
    // Eliminar dominio anterior de Resend
    try {
      await deleteDomain(tenant.resendDomainId);
      console.log('  Dominio anterior eliminado de Resend.');
    } catch (e: any) {
      console.warn(`  No se pudo eliminar el dominio anterior: ${e.message}`);
    }
  }

  const emailDomain = buildTenantEmailDomain(subdomain);
  const displayName = tenantName || tenant.nombre || subdomain;

  try {
    // 2. Registrar dominio en Resend
    printStatus('Registrando en Resend', emailDomain, '🔄');
    const resendDomain = await registerDomain(emailDomain);
    printStatus('ID en Resend', resendDomain.id, '✅');
    printStatus('Estado', resendDomain.status, '📊');
    printStatus('Registros DNS requeridos', `${resendDomain.records.length}`, '📝');

    // Mostrar registros DNS
    for (const rec of resendDomain.records) {
      console.log(`     ${rec.record.padEnd(6)} ${rec.name.padEnd(50)} ${rec.value}`);
    }

    // 3. Intentar configurar DNS en Cloudflare
    let dnsConfigured = false;
    try {
      printStatus('Configurando DNS en Cloudflare', '...', '🔄');
      const zoneId = await getRootZoneId();
      const dnsResult = await configureEmailDnsRecords(
        zoneId,
        subdomain,
        resendDomain.records
      );

      if (dnsResult.configured > 0) {
        dnsConfigured = dnsResult.failed === 0;
        printStatus('Registros DNS creados', `${dnsResult.configured}`, '✅');
        if (dnsResult.failed > 0) {
          printStatus('Fallaron', `${dnsResult.failed}`, '⚠️');
          for (const err of dnsResult.errors) {
            console.log(`       ${err}`);
          }
        }

        if (dnsConfigured) {
          // 4. Verificar dominio en Resend
          printStatus('Verificando dominio en Resend', '...', '🔄');
          const verifiedDomain = await verifyDomain(resendDomain.id);
          printStatus('Estado final', verifiedDomain.status, '📊');

          // 5. Actualizar tenant
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              resendDomainId: resendDomain.id,
              emailDomainStatus: verifiedDomain.status,
              emailDomainConfiguredAt: new Date(),
            },
          });

          if (verifiedDomain.status === 'verified') {
            console.log(`\n  ✅ Dominio ${emailDomain} verificado y listo!`);
            console.log(`  Los emails de ${displayName} se enviarán desde:`);
            console.log(`     noreply@${emailDomain}`);
          } else {
            console.log(`\n  ⚠️  Dominio registrado pero estado: ${verifiedDomain.status}`);
            console.log(`  Puede tomar unos minutos hasta que Resend lo verifique.`);
            console.log(`  Vuelve a verificar con:`);
            console.log(`     npx tsx scripts/retro-provision-email-domain.ts --verify ${subdomain}`);
          }
        } else {
          // DNS parcial
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              resendDomainId: resendDomain.id,
              emailDomainStatus: 'pending_dns',
            },
          });
          console.log(`\n  ⚠️  DNS configurado parcialmente. Revisa Cloudflare.`);
        }
      }
    } catch (dnsError: any) {
      // Cloudflare no disponible o error de red
      console.log(`\n  ⚠️  No se pudo configurar DNS automáticamente: ${dnsError.message}`);
      console.log('  Debes configurar los registros DNS manualmente en Cloudflare.\n');
      
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          resendDomainId: resendDomain.id,
          emailDomainStatus: 'pending_dns',
        },
      });
      
      console.log('  📋 Registros DNS a configurar manualmente en Cloudflare:');
      console.log('     Zona: volkern.app\n');
      for (const rec of resendDomain.records) {
        const recordName = rec.name.endsWith('.volkern.app')
          ? rec.name.slice(0, -'.volkern.app'.length) || '@'
          : rec.name;
        console.log(`     ${rec.record.padEnd(6)} ${recordName.padEnd(45)} ${rec.value}`);
        if (rec.priority) {
          console.log(`           Prioridad: ${rec.priority}`);
        }
        console.log('');
      }
    }

    return true;
  } catch (error: any) {
    console.error(`\n❌ Error provisionando dominio: ${error.message}`);
    return false;
  }
}

async function verifyOnly(subdomain: string) {
  printHeader(`Verificando dominio para: ${subdomain}`);

  const tenant = await prisma.tenant.findFirst({
    where: { subdomain },
  });

  if (!tenant) {
    console.error(`\n❌ No se encontró tenant con subdominio "${subdomain}"`);
    return;
  }

  if (!tenant.resendDomainId) {
    console.log(`\n⚠️  El tenant no tiene dominio registrado en Resend.`);
    console.log(`  Provísionalo primero:`);
    console.log(`    npx tsx scripts/retro-provision-email-domain.ts --tenant ${subdomain}`);
    return;
  }

  try {
    const domain = await verifyDomain(tenant.resendDomainId);
    printStatus('ID', domain.id);
    printStatus('Dominio', domain.name);
    printStatus('Estado', domain.status, '📊');

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        emailDomainStatus: domain.status,
        emailDomainConfiguredAt: domain.status === 'verified' ? new Date() : undefined,
      },
    });

    if (domain.status === 'verified') {
      console.log(`\n  ✅ Dominio verificado!`);
    } else {
      console.log(`\n  ⏳ Estado: ${domain.status}. Los registros DNS pueden tardar en propagarse.`);
    }
  } catch (error: any) {
    console.error(`\n❌ Error verificando dominio: ${error.message}`);
  }
}

async function provisionAll() {
  printHeader('Provisionando todos los tenants con subdominio');

  const tenants = await prisma.tenant.findMany({
    where: {
      subdomain: { not: null },
      OR: [
        { emailDomainStatus: 'not_started' },
        { emailDomainStatus: null },
        { emailDomainStatus: 'failed' },
      ],
    },
    select: {
      id: true,
      nombre: true,
      subdomain: true,
      emailDomainStatus: true,
    },
    orderBy: { fechaCreacion: 'desc' },
  });

  if (tenants.length === 0) {
    console.log('\n✅ Todos los tenants con subdominio ya tienen email configurado.');
    return;
  }

  console.log(`\n📋 Tenants a provisionar: ${tenants.length}\n`);
  
  let successCount = 0;
  let failCount = 0;

  for (const tenant of tenants) {
    console.log(`\n[${successCount + failCount + 1}/${tenants.length}] ${tenant.nombre} (${tenant.subdomain})`);
    
    // Pequeña pausa entre tenants para no rate-limit APIs
    if (successCount + failCount > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }

    const ok = await retroProvisionTenant(tenant.subdomain!, tenant.nombre || undefined);
    if (ok) successCount++;
    else failCount++;
  }

  printLine('═');
  console.log(`\n  ✅ Exitosos: ${successCount}`);
  console.log(`  ❌ Fallidos: ${failCount}`);
  console.log('');
}

// ─── CLI simple ──────────────────────────────────────────────

function askForConfirmation(question: string): Promise<{ confirm: boolean }> {
  // En entorno interactivo, pregunta al usuario
  return Promise.resolve({ confirm: true }); // Por defecto sí
}

async function main() {
  const args = process.argv.slice(2);
  
  const tenantIndex = args.indexOf('--tenant');
  const tenantArg = tenantIndex >= 0 ? args[tenantIndex + 1] : null;
  
  const allFlag = args.includes('--all');
  const verifyIndex = args.indexOf('--verify');
  const verifyArg = verifyIndex >= 0 ? args[verifyIndex + 1] : null;

  try {
    if (verifyArg) {
      await verifyOnly(verifyArg);
    } else if (tenantArg) {
      await retroProvisionTenant(tenantArg);
    } else if (allFlag) {
      await provisionAll();
    } else {
      await listTenantsWithoutEmailDomain();
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
