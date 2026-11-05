export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/users/me - Obtener información del usuario actual
 * Refactorizado con con withTenantAuth para soportar suplantación (Impersonate)
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const currentUser = auth.user!;
    const activeTenant = auth.tenant!;

    // Buscamos el detalle completo del usuario en la DB Global
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        telefono: true,
        bookingSlug: true,
        bookingTitle: true,
        bookingBio: true,
        bookingEnabled: true,
        role: {
          select: {
            id: true,
            nombre: true,
            permisos: true
          }
        },
        tenant: {
          select: {
            id: true,
            nombre: true,
            slug: true,
            subdomain: true,
            accountType: true
          }
        },
        metadata: true,
        timezone: true
      }
    }) as any;

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Bypass para campos nuevos (v3)
    const rawData: any[] = await prisma.$queryRawUnsafe(
      `SELECT "isTwoFactorEnabled" FROM "User" WHERE id = $1`,
      user.id
    );
    const firstRow = rawData[0] || {};
    const isTwoFactorEnabled = firstRow.isTwoFactorEnabled === true || firstRow.istwofactorenabled === true;

    // SI el usuario está suplantando a un tenant (Superadmin), 
    // sobreescribimos la información del tenant en la respuesta para que la UI se actualice.
    const responseUser = {
      ...user,
      isTwoFactorEnabled,
      timezone: user.timezone || (currentUser as any).timezone, // Utilizar el valor fresco de DB
      tenant: {
        id: activeTenant.id,
        nombre: activeTenant.nombre,
        slug: activeTenant.slug,
        subdomain: activeTenant.subdomain,
        accountType: activeTenant.accountType
      },
      // Marcar si es una sesión suplantada para lógica especial en UI si fuera necesaria
      isImpersonating: activeTenant.id !== user.tenant?.id
    };

    return NextResponse.json(responseUser);

  } catch (error: any) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Error al obtener información del usuario' },
      { status: 500 }
    );
  }
}, ['users:read']);

/**
 * PATCH /api/users/me - Actualizar perfil
 */
export const PATCH = withTenantAuth(async (req, auth) => {
  try {
    const currentUser = auth.user!;
    const body = await req.json();
    const { name, telefono, bookingSlug, bookingTitle, bookingBio, bookingEnabled, metadata, timezone } = body;

    // Si se está cambiando el slug, verificar que sea único DENTRO del tenant
    // (scoping por tenant: otro tenant puede usar el mismo slug sin conflicto)
    if (bookingSlug) {
      const existingUser = await prisma.user.findFirst({
        where: {
          bookingSlug,
          tenantId: currentUser.tenantId,
          NOT: { id: currentUser.id }
        }
      });

      if (existingUser) {
        return NextResponse.json({ error: 'Este slug ya está en uso' }, { status: 400 });
      }
    }

    // Logica de auto-provisioning de email inbox en Chatwoot
    if (metadata?.emailConfig?.user && metadata?.emailConfig?.pass && metadata?.emailConfig?.imapHost && metadata?.emailConfig?.smtpHost) {
      try {
        const userWithTenant = await prisma.user.findUnique({
          where: { id: currentUser.id },
          include: { tenant: true }
        });

        if (userWithTenant?.tenant && !(userWithTenant.metadata as any)?.chatwootEmailInboxId) {
          console.log('[EmailProvisioning] Detectada configuración de email, creando inbox en Chatwoot...');
          
          // Buscar integración de comuniciones para el tenant
          const integration = await prisma.integration.findFirst({
            where: { tenantId:        userWithTenant.tenantId as string, tipo: 'chatwoot', activo: true }
          });

          if (integration && (integration.configuracion as any)?.accountToken) {
            const { chatwootApi } = await import('@/lib/nexus/chatwoot-api');
            const accountId = (userWithTenant.tenant as any).chatwootAccountId;
            const accountToken = (integration.configuracion as any).accountToken;

            if (accountId) {
              const inbox = await chatwootApi.createEmailInbox(
                accountId,
                userWithTenant.name || userWithTenant.email,
                metadata.emailConfig.user,
                {
                  imap: {
                    address: metadata.emailConfig.imapHost,
                    port: parseInt(metadata.emailConfig.imapPort) || 993,
                    user: metadata.emailConfig.user,
                    pass: metadata.emailConfig.pass,
                    ssl: true
                  },
                  smtp: {
                    address: metadata.emailConfig.smtpHost,
                    port: parseInt(metadata.emailConfig.smtpPort) || 465,
                    user: metadata.emailConfig.user,
                    pass: metadata.emailConfig.pass,
                    protocol: 'smtp'
                  }
                },
                accountToken
              );

              console.log('[EmailProvisioning] Inbox creado exitosamente:', inbox.id);
              // Inyectar el ID de inbox en el metadata para persistirlo
              metadata.chatwootEmailInboxId = inbox.id;
            }
          }
        }
      } catch (error) {
        console.error('[EmailProvisioning] Error en auto-provisioning:', error);
        // No bloqueamos el guardado del perfil si falla Chatwoot, pero lo logueamos
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        name,
        telefono,
        bookingSlug,
        bookingTitle,
        bookingBio,
        bookingEnabled: typeof bookingEnabled === 'boolean' ? bookingEnabled : undefined,
        metadata: metadata ? metadata : undefined,
        image: body.image,
        timezone: timezone !== undefined ? timezone : undefined
      }
    });

    return NextResponse.json({ success: true, user: { ...updatedUser, timezone } });

  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Error al actualizar información del usuario' },
      { status: 500 }
    );
  }
}, ['users:write']);
