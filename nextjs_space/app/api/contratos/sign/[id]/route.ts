export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSystemContext } from '@/lib/skills/context';
import { withTenantAuth } from '@/lib/api-key-auth';
import { SignatureService } from '@/lib/security/signature-service';
import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import { checkFeatureLimit } from '@/lib/subscription';

/**
 * POST /api/contratos/sign/[id]
 * Ejecuta el protocolo de sellado digital del contrato (Firma de Empresa)
 */
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const contractId = params.id;
    const body = await request.json();
    const { operatorNote } = body;

    // Verificar límite de contratos firmados
    const signLimitCheck = await checkFeatureLimit(tenantId, 'contratos_sign', 1)
    if (!signLimitCheck.allowed) {
      return NextResponse.json(
        { error: `Has alcanzado el límite de ${signLimitCheck.limit} contratos firmados en tu plan actual.` },
        { status: 403 }
      )
    }

    // 1. Obtener contrato y datos del tenant (vaultSeed)
    const [contrato, tenant] = await Promise.all([
      prisma.contrato.findUnique({
        where: { id: contractId, tenantId },
        include: { items: true, contacts: true } as any
      }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { vaultSeed: true, nombre: true }
      })
    ]);

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    if (!tenant?.vaultSeed) {
      return NextResponse.json({ error: 'Configuración de seguridad (Vault) no inicializada para este tenant' }, { status: 500 });
    }

    if (contrato.estado === 'vigente') {
      return NextResponse.json({ error: 'El contrato ya ha sido firmado y sellado' }, { status: 400 });
    }

    // 2. Protocolo de Integridad (Trust Protocol)
    // El hash incluye el snapshot fiscal para garantizar la inmutabilidad
    const integrityPayload = JSON.stringify({
      contractId: contrato.id,
      numero: contrato.numero,
      total: contrato.total,
      snapshotNif: contrato.snapshotNif,
      snapshotNombre: contrato.snapshotNombre,
      items: (contrato as any).items.map((i: any) => ({ sku: i.sku, total: i.total })),
      operatorNote: operatorNote || '',
      timestamp: new Date().toISOString()
    });

    const documentHash = SignatureService.hashDocument(integrityPayload);
    const signatureHash = SignatureService.generateSignature(documentHash, tenant.vaultSeed);

    // 3. Registro Forense de la Firma
    const signature = await SignatureService.registerSignature({
      tenantId,
      documentType: 'CONTRACT',
      documentHash,
      signatureHash,
      signerId: userId,
      metadata: {
        operatorNote,
        contractNumber: contrato.numero,
        clientName: contrato.snapshotNombre,
        clientNif: contrato.snapshotNif,
        auditTrail: 'VOLKERN_SIGN_v1'
      }
    });

    // 4. Actualización del Contrato y Automatismos de Ventas
    const updatedContrato = await prisma.contrato.update({
      where: { id: contractId },
      data: {
        estado: 'vigente',
        firmadoPorEmpresa: true,
        firmadoPorUserId: userId,
        fechaFirmaEmpresa: new Date(),
        nombreFirmaEmpresa: auth.user!.name || 'Administrador',
        // Inmortalizar el hash en el contrato
        templateData: {
          ...(contrato.templateData as any || {}),
          digitalSeal: {
            signatureId: signature.id,
            hash: signatureHash,
            timestamp: new Date().toISOString()
          }
        }
      }
    });

    // --- AUTOMATISMO CRM: Cierre de Deal ---
    if (contrato.dealId) {
      await prisma.deal.update({
        where: { id: contrato.dealId },
        data: {
          estado: 'ganado', // CLOSED_WON
          fechaCierre: new Date(),
          valor: contrato.total // Sincronizar valor final firmado
        }
      });

      // Registrar hito en el timeline del deal
      await prisma.interaction.create({
        data: {
          tenantId,
          dealId: contrato.dealId,
          contactId: contrato.contactId,
          tipo: 'evento',
          subtipo: 'contrato_firmado',
          titulo: 'Venta Cerrada: Contrato Firmado',
          descripcion: `El contrato ${contrato.numero} ha sido sellado digitalmente. El deal se marca como GANADO automáticamente.`,
          userId
        } as any
      });
    }

    // 5. Notificación Watchdog (Sales Channel)
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    notifyByTelegram(
      `✅ *¡VENTA CERRADA!*\n\n` +
      `📄 *Contrato:* \`${contrato.numero}\`\n` +
      `👤 *Cliente:* ${contrato.snapshotNombre}\n` +
      `💰 *Importe:* ${contrato.total.toLocaleString()} ${contrato.moneda}\n` +
      `🤝 *Deal:* ${contrato.dealId ? 'Actualizado a GANADO' : 'N/A'}\n` +
      `🔐 *Sello Digital:* \`${signatureHash.substring(0, 16)}...\`\n\n` +
      `_La integridad del acuerdo ha sido garantizada mediante el Trust Protocol._`,
      createSystemContext(tenantId)
    ).catch(() => {});

    // Emitir evento para otros servicios (ej: inventario, facturación)
    eventBus.emit(EVENTS.RESOURCE_UPDATED, {
      type: 'contract_signed',
      id: contrato.id,
      tenantId,
      metadata: { total: contrato.total, dealId: contrato.dealId }
    });

    return NextResponse.json({
      success: true,
      contrato: updatedContrato,
      signatureId: signature.id
    });

  } catch (error) {
    console.error('Error al firmar contrato:', error);
    return NextResponse.json({ error: 'Error interno en el protocolo de firma' }, { status: 500 });
  }
}, ['contratos:write']);
