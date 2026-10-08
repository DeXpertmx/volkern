/**
 * SOLO LECTURA: compara contraseñas candidatas contra el hash del superadmin.
 *
 * Los candidatos llegan por argumentos o por la variable `ADMIN_CANDIDATES`
 * (separados por comas). No hay lista incrustada: una lista de contraseñas
 * dentro del repositorio es una lista de contraseñas filtrada.
 *
 *   npx tsx scripts/try-admin-passwords.ts 'una' 'otra'
 *   ADMIN_CANDIDATES='una,otra' npx tsx scripts/try-admin-passwords.ts
 */
import { prisma } from '../lib/db'
import bcrypt from 'bcryptjs'

const CANDIDATES = [
  ...process.argv.slice(2),
  ...(process.env.ADMIN_CANDIDATES ?? '').split(','),
]
  .map((candidato) => candidato.trim())
  .filter(Boolean)

if (CANDIDATES.length === 0) {
  console.error('❌ Pasa al menos un candidato por argumento o en ADMIN_CANDIDATES (separados por comas).')
  process.exit(1)
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'admin@volkern.app' } })
  if (!user?.password) { console.log('Superadmin no encontrado o sin password'); process.exit(0) }
  console.log('Probando candidatos contra hash del superadmin...')
  for (const [indice, pwd] of CANDIDATES.entries()) {
    const ok = await bcrypt.compare(pwd, user.password)
    // Se informa del número de candidato, no del valor: un acierto impreso
    // en la terminal acaba en los logs del servidor.
    if (ok) { console.log(`✅ COINCIDENCIA en el candidato #${indice + 1}`); await prisma.$disconnect(); process.exit(0) }
  }
  console.log('❌ Ninguno de los candidatos coincide.')
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
