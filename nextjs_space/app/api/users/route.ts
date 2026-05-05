export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getTenantDb, dbContext } from '@/lib/db';
import { createSystemContext } from '@/lib/skills/context';
import { withTenantAuth } from '@/lib/api-key-auth';
import { hasPermission, logAuditAction } from '@/lib/permissions';
import { validateLimit } from '@/lib/limits';
import { incrementUsage } from '@/lib/subscription';
import bcrypt from 'bcryptjs';

// GET /api/users - Listar usuarios del tenant (Identidad Global - Control Plane)
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    let currentUser = auth.user!;

    // Asegurar que el rol esté cargado para la validación de permisos
    if (!currentUser.role) {
      const dbUser = await prisma.user.findUnique({
        where: { id: currentUser.id },
        include: { role: true }
      });
      if (dbUser) currentUser = dbUser as any;
    }

    // Verificar permiso
    if (!hasPermission(currentUser, 'equipo', 'ver')) {
      console.log(`Permiso denegado para usuario ${currentUser.email} en modulo equipo`);
      return NextResponse.json({ error: 'Sin permiso para ver el equipo' }, { status: 403 });
    }

    // Obtenemos todos los empleados (Plantilla) asociados a este tenant.
    const employees = await prisma.employee.findMany({
      where: {
        tenantId: tenantId,
      },
      include: {
        user: {
          include: {
            role: {
              select: {
                id: true,
                nombre: true,
                descripcion: true,
              },
            },
          }
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    const staff = employees.map((emp) => ({
      id: emp.user?.id || emp.id, // ID del usuario si tiene, si no del empleado
      name: emp.fullName,
      email: emp.email || emp.user?.email,
      role: emp.user?.role ? {
        id: emp.user.role.id,
        nombre: emp.user.role.nombre,
      } : { id: 'no-user', nombre: 'Sin acceso' },
      employee: {
        id: emp.id,
        employeeId: emp.employeeId,
        department: emp.department,
        jobTitle: emp.jobTitle,
      },
      estado: emp.user?.estado || (emp.isActive ? 'activo' : 'inactivo'),
      telefono: emp.mobilePhone || emp.user?.telefono,
      timezone: emp.user?.timezone,
      image: emp.user?.image,
      createdAt: emp.createdAt,
    }));

    return NextResponse.json({ users: staff });
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
    const { name, email, roleId, telefono, timezone, department, isDepartmentAdmin } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Nombre y email son requeridos' },
        { status: 400 }
      );
    }

    // Lógica de Auto-Rol por Departamento
    let effectiveRoleId = roleId;
    
    if (!effectiveRoleId && department) {
      const roleName = isDepartmentAdmin ? `Director de ${department}` : `Operador de ${department}`;
      
      // Buscar si el rol ya existe para este tenant
      let role = await prisma.role.findFirst({
        where: { 
          nombre: roleName,
          tenantId: tenantId
        }
      });

      // Si no existe, crear el rol con permisos automáticos
      if (!role) {
        const defaultPerms: any = {};
        const deptKey = department.toLowerCase();
        
        // Permisos base
        defaultPerms[deptKey] = {
          ver: true,
          crear: true,
          editar: isDepartmentAdmin,
          eliminar: isDepartmentAdmin,
          exportar: isDepartmentAdmin
        };

        // Si es Admin de departamento, también le damos permisos de dashboard/analytics
        if (isDepartmentAdmin) {
          defaultPerms['analytics'] = { ver: true };
          if (deptKey === 'rrhh') defaultPerms['equipo'] = { ver: true, invitar: true };
        }

        role = await prisma.role.create({
          data: {
            nombre: roleName,
            tenantId: tenantId,
            permisos: defaultPerms,
            descripcion: `Rol generado automáticamente para el departamento de ${department}`
          }
        });
      }
      effectiveRoleId = role.id;
    }

    if (!effectiveRoleId) {
      return NextResponse.json({ error: 'Debes seleccionar un Rol o un Departamento' }, { status: 400 });
    }

    // El proxy redirige 'user' y 'role' a la base de datos global.
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'El email ya está registrado' }, { status: 400 });
    }

    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const inviteToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Crear usuario y su registro de empleado atómico
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId: effectiveRoleId,
        tenantId,
        telefono: telefono || undefined,
        timezone: timezone || 'America/Mexico_City',
        estado: 'invitado',
        invitadoPor: currentUser.id,
        tokenInvitacion: inviteToken,
        fechaInvitacion: new Date(),
        employee: {
          create: {
            fullName: name,
            email: email,
            tenantId: tenantId,
            department: department || 'GENERAL',
            isDepartmentAdmin: isDepartmentAdmin || false,
            role: isDepartmentAdmin ? 'MANAGER' : 'OPERATOR'
          }
        }
      },
      include: {
        role: true,
        employee: true
      },
    });

    // Track usage after successful user creation
    try {
      await incrementUsage(tenantId, 'users', 1);
    } catch (usageError) {
      console.error('[POST /users] Error tracking usage:', usageError);
    }

    // Registrar en audit log
    await logAuditAction(
      currentUser.id,
      tenantId,
      'crear',
      'usuario',
      newUser.id,
      `${currentUser.name} invitó a ${newUser.name} al departamento de ${department || 'General'}`
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
