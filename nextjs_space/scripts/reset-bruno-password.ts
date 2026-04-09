
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

    // Nueva contraseña temporal
    const newPassword = 'DimensionExpert2024!'
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
