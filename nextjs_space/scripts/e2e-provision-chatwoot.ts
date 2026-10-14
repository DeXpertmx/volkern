/**
 * E2E: verifica que el provisioning del signup crea la cuenta de Chatwoot
 * automáticamente con el token configurado.
 *
 * Run: npx tsx scripts/e2e-provision-chatwoot.ts
 *
 * Crea un tenant de prueba (vía el MISMO provisionTenant que usa el signup),
 * verifica la cuenta en la instancia real de Chatwoot, y luego limpia TODO:
 * tenant+user en la DB, cuenta de Chatwoot, y dominio en Resend.
 */
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import { prisma } from '../lib/db';
import { provisionTenant } from '../lib/provisioning/tenant-provisioner';
import { listDomains, deleteDomain } from '../lib/resend-domains';

const BASE_URL = process.env.CHATWOOT_BASE_URL || '';
const TOKEN = process.env.CHATWOOT_SUPER_ADMIN_TOKEN || '';

const TS = Date.now();
const EMPRESA = `Chatwoot E2E ${TS}`;
const SUBDOMAIN = `chatwoot-e2e-${TS}`;
const EMAIL = `chatwoot-e2e-${TS}@volkern.app`;
const PASSWORD = 'E2e-Test-!2026x';

async function chatwootRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'api_access_token': TOKEN,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

async function main() {
  console.log('=== E2E provisioning Chatwoot ===');
  console.log(`Empresa:  ${EMPRESA}`);
  console.log(`Subdom.:  ${SUBDOMAIN}`);
  console.log(`Email:    ${EMAIL}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Token:    ${TOKEN.slice(0, 4)}...${TOKEN.slice(-4)} (${TOKEN.length} chars)`);

  let tenantId: string | undefined;
  let chatwootAccountId: number | undefined;

  try {
    // 1) Ejecutar el mismo provisioning que el signup (sin telegram)
    console.log('\n[1] provisionTenant()...');
    const result = await provisionTenant({
      empresa: EMPRESA,
      subdomain: SUBDOMAIN,
      email: EMAIL,
      password: PASSWORD,
    });
    console.log('Resultado:', JSON.stringify(result, null, 2));

    if (!result.success) {
      console.error('❌ Provisioning falló — el signup seguiría bloqueado.');
      process.exitCode = 1;
      return;
    }

    tenantId = result.tenantId;
    chatwootAccountId = result.chatwootAccountId;

    if (!chatwootAccountId || result.chatwootSkipped) {
      console.error('❌ chatwootAccountId ausente o chatwootSkipped=true — el canal NO se creó.');
      process.exitCode = 1;
      return;
    }
    console.log(`✅ Chatwoot account creada por el provisioner: id=${chatwootAccountId}`);

    // 2) Verificación independiente contra la instancia (fetch directo, show por id)
    console.log(`\n[2] Verificación GET /platform/api/v1/accounts/${chatwootAccountId}...`);
    const resp = await chatwootRequest(`/platform/api/v1/accounts/${chatwootAccountId}`);
    const body = await resp.json().catch(() => ({}));
    if (resp.status !== 200) {
      console.error(`❌ GET account falló: HTTP ${resp.status}`, JSON.stringify(body).slice(0, 300));
      process.exitCode = 1;
      return;
    }
    console.log(`✅ Verificado en la instancia: "${(body as any).name}" (id=${(body as any).id}, locale=${(body as any).locale})`);

    // 3) Verificación del admin user creado (account_users)
    console.log('\n[3] Verificación account_users...');
    const usersResp = await chatwootRequest(`/platform/api/v1/accounts/${chatwootAccountId}/account_users`);
    if (usersResp.status !== 200) {
      console.warn(`⚠️ account_users devolvió HTTP ${usersResp.status} (no bloquea: puede no existir endpoint en esta versión)`);
    } else {
      const users = await usersResp.json() as any[];
      const mine = users.filter((u: any) => (u.user?.email || u.email || '').includes('chatwoot-e2e-'));
      console.log(`✅ Admin user en la cuenta: ${users.length} usuario(s) — admin e2e: ${mine.length > 0 ? 'presente' : 'NO encontrado'}`);
    }

    console.log('\n🎉 E2E OK: el signup crea el tenant Y su cuenta de Chatwoot automáticamente.');
  } finally {
    // ── LIMPIEZA (no dejar nada) ─────────────────────────────────────────
    console.log('\n--- Limpieza ---');

    if (chatwootAccountId) {
      try {
        const del = await chatwootRequest(`/platform/api/v1/accounts/${chatwootAccountId}`, { method: 'DELETE' });
        console.log(`Chatwoot account ${chatwootAccountId} eliminada: HTTP ${del.status}`);
      } catch (e: any) {
        console.warn('No se pudo eliminar la cuenta Chatwoot:', e?.message);
      }
    }

    if (tenantId) {
      try {
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
        console.log(`Tenant ${tenantId} eliminado de la DB (user + tenant).`);
      } catch (e: any) {
        console.warn('No se pudo eliminar el tenant de la DB:', e?.message);
      }
    }

    try {
      const domains = await listDomains();
      const mine = domains.filter((d: any) => d.name.startsWith('chatwoot-e2e-'));
      for (const d of mine) {
        await deleteDomain(d.id);
        console.log(`Dominio Resend eliminado: ${d.name}`);
      }
      if (mine.length === 0) console.log('Sin dominios Resend de prueba que limpiar.');
    } catch (e: any) {
      console.warn('Limpieza Resend falló:', e?.message);
    }

    await prisma.$disconnect();
  }
}

main();
