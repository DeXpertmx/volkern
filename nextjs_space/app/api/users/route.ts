export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getTenantDb, dbContext } from '@/lib/db';
import { createSystemContext } from '@/lib/skills/context';
import { withTenantAuth } from '@/lib/api-key-auth';
import { hasPermission, logAuditAction } from '@/lib/permissions';
import { validateLimit } from '@/lib/limits';
import { incrementUsage } from '@/lib/subscription';
import { ROL_HOSPITALITY_POR_NOMBRE } from '@/lib/hospitality/roles';
import { enviarEmailInvitacion } from '@/lib/emails/invitacion';
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
    if (!hasPermission(currentUser as any, 'equipo', 'ver')) {
      console.log(`Permiso denegado para usuario ${currentUser.email} en modulo equipo`);
      return NextResponse.json({ error: 'Sin permiso para ver el equipo' }, { status: 403 });
    }

    // El Equipo son los usuarios del tenant (User.tenantId). La ficha de empleado
    // (RRHH) es un enriquecimiento opcional: los tenants sin RRHH siguen teniendo
    // equipo completo con los datos del propio usuario.
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
        employee: {
          select: {
            id: true,
            employeeId: true,
            department: true,
            jobTitle: true,
            fullName: true,
            email: true,
            mobilePhone: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const staff = users.map((user) => ({
      id: user.id, // ID del usuario
      name: user.employee?.fullName || user.name || user.email,
      email: user.employee?.email || user.email,
      role: user.role ? {
        id: user.role.id,
        nombre: user.role.nombre,
      } : { id: 'no-user', nombre: 'Sin acceso' },
      employee: user.employee ? {
        id: user.employee.id,
        employeeId: user.employee.employeeId,
        department: user.employee.department,
        jobTitle: user.employee.jobTitle,
      } : null,
      estado: user.estado || (user.employee?.isActive ? 'activo' : 'inactivo'),
      telefono: user.employee?.mobilePhone || user.telefono,
      timezone: user.timezone,
      image: user.image,
      createdAt: user.createdAt,
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

    // Validar límite de usuarios (ahora consulta la DB Global)
    const limitCheck = await validateLimit(tenantId, 'users');
    if (!limitCheck.allowed) {
      return NextResponse.json(limitCheck.error, { status: limitCheck.error.status });
    }

    const body = await req.json();
    const { name, email, roleId, telefono, timezone, department, isDepartmentAdmin, contactId } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Nombre y email son requeridos' },
        { status: 400 }
      );
    }

    // Dar acceso a un huésped no es invitar al equipo, y por eso no pide la
    // misma llave: pide la que reparte los roles de Hospitality (`equipo.roles`),
    // que es la del Anfitrión. Sin esta distinción, un Anfitrión —que administra
    // el alojamiento pero no la plantilla— no podría dar de alta a su huésped, y
    // el rol Huésped seguiría siendo una promesa que nadie puede cumplir.
    const esAccesoHuesped = !!contactId;

    if (!esAccesoHuesped && !hasPermission(currentUser as any, 'equipo', 'invitar')) {
      return NextResponse.json({ error: 'Sin permiso para invitar usuarios' }, { status: 403 });
    }

    // `contactId` convierte la cuenta en el acceso de un huésped: el usuario pasa
    // a ver únicamente las reservas de ese contacto.
    let contactoVinculado: string | undefined;

    // Lógica de Auto-Rol por Departamento
    let effectiveRoleId = roleId;

    if (contactId) {
      if (!hasPermission(currentUser as any, 'equipo', 'roles')) {
        return NextResponse.json(
          {
            error: 'Solo quien administra los roles de Hospitality puede crear un acceso de huésped',
            permisoRequerido: 'equipo.roles',
          },
          { status: 403 }
        );
      }

      const contacto = await prisma.contact.findFirst({
        where: { id: String(contactId), tenantId },
        select: { id: true },
      });
      if (!contacto) {
        return NextResponse.json({ error: 'El contacto no existe en esta cuenta' }, { status: 404 });
      }
      contactoVinculado = contacto.id;

      // Un acceso de huésped es una cuenta con el rol Huésped, y ninguna otra.
      // `equipo.roles` es la llave de Hospitality: sin esta comprobación, quien
      // la tuviera podría usar esta puerta para fabricar un administrador de la
      // cuenta entera pasando un `contactId`.
      const rolHuesped = await prisma.role.findFirst({
        where: { tenantId, nombre: ROL_HOSPITALITY_POR_NOMBRE['Huésped'].nombre },
        select: { id: true },
      });
      if (!rolHuesped) {
        return NextResponse.json(
          {
            error:
              'Todavía no existe el rol Huésped en esta cuenta: aplica el catálogo de roles de Hospitality primero',
          },
          { status: 409 }
        );
      }
      if (effectiveRoleId && effectiveRoleId !== rolHuesped.id) {
        return NextResponse.json(
          { error: 'Un acceso de huésped solo puede tener el rol Huésped' },
          { status: 400 }
        );
      }
      effectiveRoleId = rolHuesped.id;
    } else if (!effectiveRoleId && department) {
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

    // El rol asignado DEBE ser del tenant activo. Sin esta verificación, una
    // sesión con contexto de plataforma (HQ) dejaba asignar su rol
    // «Superadmin» a un miembro del equipo del tenant (cross-tenant).
    // Un rol con tenantId null solo existe dentro de una BD física aislada
    // (donde la tenencia la garantiza la propia BD), así que se acepta.
    const rolAsignar = await prisma.role.findUnique({ where: { id: effectiveRoleId } });
    if (!rolAsignar || (rolAsignar.tenantId !== null && rolAsignar.tenantId !== tenantId)) {
      return NextResponse.json(
        { error: 'El rol seleccionado no pertenece a esta cuenta' },
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
        // Vacío para un miembro del equipo; el contacto, para un acceso de huésped.
        contactId: contactoVinculado,
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
    });    // Track usage after successful user creation
    try {
      await incrementUsage(tenantId, 'users', 1);
    } catch (usageError) {
      console.error('[POST /users] Error tracking usage:', usageError);
    }

    // Enviar el email de invitación. El token solo tiene valor si llega al
    // invitado: sin este envío el alta moría en la BD y el invitado nunca
    // recibía nada (defecto reportado desde el tenant JUAN ANTONIO).
    // El alta no falla si el correo no puede enviarse: queda el token para
    // reenviar desde el panel de Equipo.
    let emailEnviado = false;
    let emailError: string | undefined;
    try {
      const resultado = await enviarEmailInvitacion({
        email: newUser.email,
        nombre: newUser.name || '',
        token: inviteToken,
        tempPassword,
        tenantNombre: auth.tenant?.nombre || 'tu cuenta',
        invitadorNombre: currentUser.name || currentUser.email || 'El administrador',
      });
      emailEnviado = !!resultado?.success;
      if (!emailEnviado) emailError = 'No se pudo enviar el email';
    } catch (emailErr: any) {
      console.error('[POST /users] Error enviando invitación:', emailErr);
      emailError = emailErr?.message || 'Error al enviar el email';
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
      emailEnviado,
      emailError,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear usuario:', error);
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 });
  }
}, ['team:write'])
