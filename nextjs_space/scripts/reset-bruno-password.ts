// ⚠️⚠️⚠️ NO EJECUTAR CONTRA PRODUCCIÓN SIN CONFIRMACIÓN EXPRESA — CONVENCIÓN OBSOLETA (2026-09-03)
// --------------------------------------------------------------------------------------------
// Este reset se aplicó en producción el 2026-09-03, pero el propietario
// (bruno.hess@dimensionexpert.com) cambió después su contraseña a una propia. Re-ejecutarlo contra
// el VPS la sobrescribiría y lo dejaría fuera. Solo uso local/dev.
//
// ⚠️ NUNCA commitear contraseñas. La nueva contraseña temporal se lee de la
// variable de entorno BRUNO_TEMP_PASSWORD (fallback dev: si no existe y NODE_ENV
// no es production, se aborta igualmente para no inventar credenciales).
// --------------------------------------------------------------------------------------------

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

// Cargar variables de entorno
dotenv.config()

const prisma = new PrismaClient()

async function resetBrunoPassword() {
  try {
    console.log('🔄 Buscando usuario bruno.hess@dimensionexpert.com...')

    const user = await prisma.user.findUnique({
      where: { email: 'bruno.hess@dimensionexpert.com' },
      include: { tenant: true },
    })

    if (!user) {
      console.log('❌ Usuario no encontrado')
      return
    }

    console.log('✅ Usuario encontrado:')
    console.log(`   - ID: ${user.id}`)
    console.log(`   - Nombre: ${user.name}`)
    console.log(`   - Email: ${user.email}`)
    console.log(`   - Tenant: ${user.tenant?.nombre || 'N/A'}`)

    // Nueva contraseña temporal — desde entorno, nunca hardcodeada
    const newPassword = process.env.BRUNO_TEMP_PASSWORD
    if (!newPassword) {
      throw new Error('BRUNO_TEMP_PASSWORD no está definida en el entorno. Define la variable antes de ejecutar.')
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Actualizar contraseña
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    })

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        accion: 'password_reset_admin',
        entidad: 'User',
        entidadId: user.id,
        descripcion: 'Contraseña reseteada por administrador (script)',
      },
    })

    console.log('\n✅ Contraseña actualizada exitosamente!')
    console.log('\n📧 Credenciales de acceso:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`   Email:    bruno.hess@dimensionexpert.com`)
    console.log(`   Password: ${newPassword}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n⚠️  Por favor, cambia esta contraseña después del primer login.')
  } catch (error) {
    console.error('❌ Error al resetear contraseña:', error)
  } finally {
    await prisma.$disconnect()
  }
}

resetBrunoPassword()
