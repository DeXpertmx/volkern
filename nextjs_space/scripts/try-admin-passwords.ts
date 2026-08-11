/** SOLO LECTURA: prueba contraseñas documentadas contra el hash del superadmin */
import { prisma } from '../lib/db'
import bcrypt from 'bcryptjs'

const CANDIDATES = [
  'Admin123!', 'volkern123456', 'Volkern2024!', 'DimensionExpert2024!',
  'BrunoHess2026!', 'Volkern123!', 'admin123', 'Admin123', 'volkern',
  'VolkernAdmin2024!', 'Volkern2025!', 'VolkernAdmin2025!',
]

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'admin@volkern.app' } })
  if (!user?.password) { console.log('Superadmin no encontrado o sin password'); process.exit(0) }
  console.log('Probando candidatos contra hash del superadmin...')
  for (const pwd of CANDIDATES) {
    const ok = await bcrypt.compare(pwd, user.password)
    if (ok) { console.log('✅ COINCIDENCIA:', pwd); await prisma.$disconnect(); process.exit(0) }
  }
  console.log('❌ Ninguna contraseña documentada coincide.')
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
