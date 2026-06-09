/**
 * Provision Chatwoot for existing tenant "dexpert"
 * Run: npx tsx scripts/provision-chatwoot-dexpert.ts
 */
import { prisma } from '../lib/db';
import { chatwootApi } from '../lib/nexus/chatwoot-api';
import { encrypt } from '../lib/core/crypto';
import crypto from 'crypto';

const TENANT_SUBDOMAIN = 'dexpert';
const WEBHOOK_BASE = process.env.NEXTAUTH_URL || 'https://dexpert.volkern.app';

async function main() {
  console.log('🚀 Provisioning Chatwoot for tenant:', TENANT_SUBDOMAIN);

  // 1. Find tenant
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: TENANT_SUBDOMAIN },
    select: { id: true, nombre: true, slug: true },
  });

  if (!tenant) {
    console.error('❌ Tenant not found:', TENANT_SUBDOMAIN);
    process.exit(1);
  }
  console.log('✅ Tenant:', tenant.nombre, `(${tenant.id})`);

  // 2. Check if already provisioned
  const existing = await prisma.messagingHubConfig.findUnique({
    where: { tenantId: tenant.id },
  });
  if (existing) {
    console.log('⚠️  Already provisioned. Chatwoot account:', existing.chatwootAccountId);
    console.log('   Webhook URL:', existing.webhookUrl);
    console.log('   To re-provision, delete the MessagingHubConfig first.');
    process.exit(0);
  }

  // 3. Create Chatwoot account
  console.log('📦 Creating Chatwoot account...');
  const account = await chatwootApi.createAccount(tenant.nombre, 'es');
  console.log('✅ Chatwoot account created:', account.id);

  // 4. Create admin user in Chatwoot account
  console.log('👤 Creating admin user in Chatwoot...');
  const adminEmail = `bruno.hess@dimensionexpert.com`;
  try {
    await chatwootApi.createAccountUser(account.id, adminEmail, tenant.nombre, 'administrator');
    console.log('✅ Admin user added to Chatwoot account');
  } catch (err: any) {
    console.warn('⚠️  Could not add admin user (may already exist):', err.message);
  }

  // 5. Get bot user access token for the account
  console.log('🔑 Getting bot user access token...');
  const accessToken = await chatwootApi.ensureBotUserInAccount(account.id);
  console.log('✅ Bot user token obtained');

  // 6. Create MessagingHubConfig
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  const webhookUrl = `${WEBHOOK_BASE}/api/webhooks/nexus-sync`;

  console.log('💾 Creating MessagingHubConfig...');
  await prisma.messagingHubConfig.create({
    data: {
      tenantId: tenant.id,
      isActive: true,
      hubBaseUrl: process.env.CHATWOOT_BASE_URL || 'https://volkern.dimension.expert',
      hubApiToken: encrypt(accessToken || process.env.CHATWOOT_SUPER_ADMIN_TOKEN || ''),
      hubAccountId: String(account.id),
      chatwootAccountId: account.id,
      webhookSecret,
      webhookUrl,
      autoProvisioned: false,
      provisionedAt: new Date(),
    },
  });
  console.log('✅ MessagingHubConfig created');

  // 7. Configure webhook in Chatwoot
  console.log('🔗 Configuring webhook in Chatwoot...');
  try {
    await chatwootApi.configureWebhook(account.id, webhookUrl, accessToken);
    console.log('✅ Webhook configured:', webhookUrl);
  } catch (err: any) {
    console.warn('⚠️  Webhook config warning:', err.message);
  }

  // 8. Activate chatbot
  console.log('🤖 Activating chatbot...');
  await prisma.chatbotConfig.upsert({
    where: { tenantId: tenant.id },
    update: {
      activo: true,
      nombreAsistente: `${tenant.nombre} Asistente`,
      contextoNegocio: `Somos ${tenant.nombre}, una empresa de consultoría tecnológica. Ayudamos a empresas a digitalizarse con soluciones de IA, automatización y CRM.`,
      personalidad: 'Eres profesional, cordial y eficiente. Respondes en español con un tono amable pero directo. Usas formato de WhatsApp con *negritas* y emojis con moderación.',
    },
    create: {
      tenantId: tenant.id,
      activo: true,
      nombreAsistente: `${tenant.nombre} Asistente`,
      contextoNegocio: `Somos ${tenant.nombre}, una empresa de consultoría tecnológica.`,
      personalidad: 'Eres profesional, cordial y eficiente.',
    },
  });
  console.log('✅ Chatbot activated');

  // 9. Summary
  console.log('\n📋 ========== PROVISIONING COMPLETE ==========');
  console.log(`   Tenant:        ${tenant.nombre} (${tenant.id})`);
  console.log(`   Chatwoot:      ${process.env.CHATWOOT_BASE_URL || 'https://volkern.dimension.expert'}`);
  console.log(`   Account ID:    ${account.id}`);
  console.log(`   Webhook URL:   ${webhookUrl}`);
  console.log(`   Chatbot:       ACTIVO ✅`);
  console.log('');
  console.log('📱 NEXT STEPS:');
  console.log('   1. Ve a tu dashboard: https://dexpert.volkern.app/dashboard/integraciones');
  console.log('   2. Configura WhatsApp Business con tus credenciales de Meta');
  console.log('   3. O configura WhatsApp via Evolution API');
  console.log('   4. Envía un mensaje de prueba al número conectado');
  console.log('================================================');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
