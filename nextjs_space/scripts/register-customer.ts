import { prisma } from '../lib/db';
import { CustomerAuthService } from '../lib/auth/customer-auth';

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return console.log('No tenant found');

  const contact = await prisma.contact.findFirst({ where: { tenantId: tenant.id } });
  if (!contact) return console.log('No contact found');

  const email = 'cliente_test@volkern.com';
  const password = 'password123';

  // Check if exists
  const existing = await prisma.erp_customer_users.findUnique({ where: { email } });
  if (existing) {
    console.log('Test user already exists:', email);
    return;
  }

  const user = await CustomerAuthService.register({
    tenantId: tenant.id,
    email: email,
    password: password,
    firstName: 'Cliente',
    lastName: 'Soberano',
    contactId: contact.id
  });

  console.log('Customer User Created:');
  console.log('Email:', user.email);
  console.log('Password:', password);
  console.log('Role:', user.role);
}

main().catch(console.error);
