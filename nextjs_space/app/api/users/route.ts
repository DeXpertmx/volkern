export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getTenantDb, dbContext } from '@/lib/db';
import { createSystemContext } from '@/lib/skills/context';
import { withTenantAuth } from '@/lib/api-key-auth';
import { hasPermission, logAuditAction } from '@/lib/permissions';
import { validateLimit } from '@/lib/limits';
import bcrypt from 'bcryptjs';

// GET /api/users - Listar usuarios del tenant (Identidad Global - Control Plane)
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const currentUser = auth.user!;

    // Verificar permiso (usa el rol ya incluido en auth.user)
    if (!hasPermission(currentUser, 'equipo', 'ver')) {
      return NextResponse.json({ error: 'Sin permiso para ver el equipo' }, { status: 403 });
    }

    // El proxy de prisma redirige 'user' y 'role' a la base de datos global.
    // Obtenemos los usuarios asociados a este tenant.
    const users = await prisma.user.findMany({
      where: {
        tenantId: tenantId,
      },
      include: {
        role: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const usersWithoutPasswords = users.map(({ password, ...user }) => ({
      ...user,
      role: user.role ? {
        id: user.role.id,
        nombre: user.role.nombre,
        descripcion: user.role.descripcion
      } : null
    }));

    return NextResponse.json({ users: usersWithoutPasswords });
  } catch (error: any) {
    console.error('Error al obtener usuarios:', error);
    return NextResponse.json({ error: 'Error al obtener usuarios' }, { status: 500 });
  }
}, ['team:read'])

// POST /api/users - Crear/Invitar nuevo usuario (Control Plane)
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const currentUser = auth.user!;

    // Verificar permiso
    if (!hasPermission(currentUser, 'equipo', 'invitar')) {
      return NextResponse.json({ error: 'Sin permiso para invitar usuarios' }, { status: 403 });
    }

    // Validar límite de usuarios (ahora consulta la DB Global)
    const limitCheck = await validateLimit(tenantId, 'users');
    if (!limitCheck.allowed) {
      return NextResponse.json(limitCheck.error, { status: limitCheck.error.status });
    }

    const body = await req.json();
    const { name, email, roleId, telefono, timezone } = body;

    if (!name || !email || !roleId) {
      return NextResponse.json(
        { error: 'Nombre, email y rol son requeridos' },
        { status: 400 }
      );
    }

    // El proxy redirige 'user' y 'role' a la base de datos global.
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'El email ya está registrado' }, { status: 400 });
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role || (role.tenantId && role.tenantId !== tenantId)) {
      return NextResponse.json({ error: 'Rol inválido para este tenant' }, { status: 400 });
    }

    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const inviteToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Crear usuario en el Control Plane (Global DB)
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId,
        tenantId,
        telefono: telefono || undefined,
        timezone: timezone || 'America/Mexico_City',
        estado: 'invitado',
        invitadoPor: currentUser.id,
        tokenInvitacion: inviteToken,
        fechaInvitacion: new Date(),
      },
      include: {
        role: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
          },
        },
      },
    });

    // Registrar en audit log (se guarda en la DB del Tenant para trazabilidad operativa)
    await logAuditAction(
      currentUser.id,
      tenantId,
      'crear',
      'usuario',
      newUser.id,
      `${currentUser.name} invitó a ${newUser.name} (${newUser.email})`
    );

    // Notificación por Telegram al admin
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    notifyByTelegram(
      `👤 *Nuevo Usuario*\n\n👤 *Nombre:* ${newUser.name}\n📧 *Email:* ${newUser.email}\n🎭 *Rol:* ${newUser.role?.nombre || 'Usuario'}\n👤 *Invitado por:* ${currentUser.name}`,
      createSystemContext(tenantId)
    ).catch(err => console.error('Error en Notificación Telegram:', err))

    const { password, ...userWithoutPassword } = newUser;

    return NextResponse.json({
      user: userWithoutPassword,
      inviteToken,
      tempPassword,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear usuario:', error);
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 });
  }
}, ['team:write'])
