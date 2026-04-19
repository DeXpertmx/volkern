import { globalPrisma } from '../lib/db'
import bcrypt from 'bcryptjs'

async function reset() {
  const email = 'bruno.hess@dimensionexpert.com';
  const password = 'VolkernAdmin2026!';
  const hash = bcrypt.hashSync(password, 12);
  
  const updated = await globalPrisma.user.update({
    where: { email },
    data: { password: hash }
  });
  
  console.log('Password updated for:', updated.email);
  console.log('New hash stored:', hash);
}

reset();
