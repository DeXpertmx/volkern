export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { currentPassword, newPassword } = body

    // Validaciones
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Se requieren ambas contraseñas' },
        { status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'La nueva contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      )
    }

    // Validación de complejidad: Mayúsculas, minúsculas y caracteres especiales
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/
    if (!passwordRegex.test(newPassword)) {
      return NextResponse.json(
        { error: 'La contraseña debe incluir mayúsculas, minúsculas y al menos un carácter especial' },
        { status: 400 }
      )
    }

    // Buscar el usuario
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true, email: true, tenantId: true, name: true }
    })

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    // Verificar la contraseña actual
    const isValidPassword = await bcrypt.compare(currentPassword, user.password)
    
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'La contraseña actual es incorrecta' },
        { status: 400 }
      )
    }

    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Actualizar la contraseña
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    })

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        accion: 'cambio_password',
        entidad: 'User',
        entidadId: user.id,
        descripcion: `Contraseña cambiada por el usuario ${user.name || user.email}`,
      }
    })

    console.log(`✅ Contraseña actualizada para: ${user.email}`)

    return NextResponse.json(
      { 
        success: true,
        message: 'Contraseña actualizada exitosamente'
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('❌ Error al cambiar contraseña:', error)
    return NextResponse.json(
      { error: 'Error al cambiar la contraseña' },
      { status: 500 }
    )
  }
}
