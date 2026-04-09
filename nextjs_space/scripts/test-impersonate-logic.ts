import { prisma } from '../lib/db';
import { cookies } from 'next/headers';

async function testAuth() {
  const email = 'bruno@volkern.com'; // Adjust to a real superadmin email
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true, tenant: true }
  });

  console.log('User found:', user?.email);
  console.log('Role:', user?.role?.nombre);
  
  if (user?.role?.nombre === 'Superadmin') {
      console.log('User is Superadmin. Checking cookies...');
      // Note: cookies() only works in request context, this script might fail here
      try {
          const c = cookies();
          console.log('Cookies available');
      } catch (e) {
          console.log('Cookies() not available in CLI');
      }
  }
}

testAuth();
