import { prisma } from '../lib/db';
import { PortalService } from '../lib/sovereignty/portal-service';

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return console.log('No tenant found');

  const contact = await prisma.contact.findFirst({ where: { tenantId: tenant.id } });
  if (!contact) return console.log('No contact found');

  const order = await prisma.erp_sales_orders.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      batchNumber: 'SO-TEST-001',
      status: 'PROCESSING',
      grandTotal: 1500,
      integrityHash: 'f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
    }
  });

  const token = await PortalService.getOrCreatePortalToken(order.id, tenant.id);
  console.log('Sample Order Created: SO-TEST-001');
  console.log('Portal URL: http://localhost:3004/portal/' + token);
}

main().catch(console.error);
