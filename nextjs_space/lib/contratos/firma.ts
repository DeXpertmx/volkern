import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/ses-email';
import {
  generateAcceptanceCode,
  generateChallengeToken,
  hashAcceptanceSecret,
  matchesAcceptanceSecret,
  maskEmail,
} from '@/lib/cotizaciones/acceptance-verification';
import { addContratoTimelineEvent } from '@/lib/contratos/timeline';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export interface FirmaCodeResult {
  challengeId: string;
  challengeToken: string;
  destinationMasked: string;
  expiresAt: string;
}

/**
 * Envía el código de verificación al email del firmante y crea el reto.
 * Nunca inventa emails: usa el del contrato o el del firmante en la SignatureRequest.
 */
export async function sendFirmaCode(params: {
  contratoId: string;
  tenantId: string;
  email?: string | null;
}): Promise<FirmaCodeResult> {
  const { contratoId, tenantId } = params;

  const contrato = await prisma.contrato.findFirst({
    where: { id: contratoId, tenantId },
    include: { signatureRequests: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!contrato) throw new Error('Contrato no encontrado');

  if (contrato.firmadoPorCliente) throw new Error('El contrato ya fue firmado');

  // Email real: el indicado por el usuario, el del contrato, o el de un firmante
  let email = params.email?.trim() || null;
  if (!email) email = contrato.clienteEmail || null;
  if (!email && contrato.signatureRequests[0]?.signers) {
    const signers = contrato.signatureRequests[0].signers as { email?: string }[];
    email = signers.find((s) => s?.email)?.email || null;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('No hay un email válido para enviar el código');
  }

  const cooldownSince = new Date(Date.now() - RESEND_COOLDOWN_MS);
  const recent = await prisma.contratoFirmaChallenge.findFirst({
    where: { contratoId, createdAt: { gte: cooldownSince } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    throw Object.assign(new Error('Espera un minuto antes de solicitar otro código'), { status: 429, retryAfterSeconds: 60 });
  }

  const code = generateAcceptanceCode();
  const challengeToken = generateChallengeToken();
  const challenge = await prisma.contratoFirmaChallenge.create({
    data: {
      contratoId,
      tenantId,
      email,
      codeHash: hashAcceptanceSecret(code),
      challengeTokenHash: hashAcceptanceSecret(challengeToken),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });

  const message = `Código Volkern para firmar el contrato ${contrato.numero}: ${code}. Caduca en 10 minutos. Si no solicitaste esta firma, ignora este mensaje.`;
  const delivery = await sendEmail({
    to: email,
    subject: `Código para firmar el contrato ${contrato.numero}`,
    text: message,
    html: `<p>${message}</p>`,
    tenantId,
  });

  if (!delivery.success) {
    await prisma.contratoFirmaChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
    throw Object.assign(new Error('No se pudo enviar el código. Comprueba el email registrado.'), { status: 502 });
  }

  return {
    challengeId: challenge.id,
    challengeToken,
    destinationMasked: maskEmail(email),
    expiresAt: challenge.expiresAt.toISOString(),
  };
}

export interface FirmaResult {
  estado: string;
  numero: string;
  nombreFirma: string;
}

/**
 * Verifica el código y firma el contrato: marca el contrato, actualiza la
 * SignatureRequest, registra timeline + auditoría y cierra el deal si aplica.
 */
export async function signContratoConCodigo(params: {
  contratoId: string;
  tenantId: string;
  challengeId: string;
  challengeToken: string;
  code: string;
  nombreFirma: string;
  ip: string;
}): Promise<FirmaResult> {
  const { contratoId, tenantId, challengeId, challengeToken, code, nombreFirma, ip } = params;

  if (!/^\d{6}$/.test(String(code || ''))) {
    throw Object.assign(new Error('Código de verificación incompleto'), { status: 400 });
  }
  if (!nombreFirma?.trim()) {
    throw Object.assign(new Error('Nombre de firma requerido'), { status: 400 });
  }

  const challenge = await prisma.contratoFirmaChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.contratoId !== contratoId || challenge.tenantId !== tenantId) {
    throw Object.assign(new Error('Código inválido o caducado'), { status: 400 });
  }
  if (challenge.verifiedAt || challenge.attempts >= challenge.maxAttempts || challenge.expiresAt < new Date()) {
    throw Object.assign(new Error('Código inválido o caducado'), { status: 400 });
  }

  await prisma.contratoFirmaChallenge.update({
    where: { id: challenge.id },
    data: { attempts: { increment: 1 } },
  });

  if (
    !matchesAcceptanceSecret(String(code), challenge.codeHash) ||
    !matchesAcceptanceSecret(String(challengeToken), challenge.challengeTokenHash)
  ) {
    const remainingAttempts = Math.max(0, challenge.maxAttempts - challenge.attempts - 1);
    throw Object.assign(
      new Error(remainingAttempts > 0 ? 'Código inválido' : 'Código bloqueado por demasiados intentos'),
      { status: 400, remainingAttempts },
    );
  }

  const contrato = await prisma.contrato.findFirst({ where: { id: contratoId, tenantId } });
  if (!contrato) throw Object.assign(new Error('Contrato no encontrado'), { status: 404 });
  if (contrato.firmadoPorCliente) throw Object.assign(new Error('El contrato ya fue firmado'), { status: 400 });
  if (!['enviado', 'firmado'].includes(contrato.estado)) {
    throw Object.assign(new Error('El contrato no está disponible para firma'), { status: 400 });
  }

  const nuevoEstado = contrato.firmadoPorEmpresa ? 'vigente' : 'firmado';

  const updated = await prisma.contrato.update({
    where: { id: contrato.id },
    data: {
      firmadoPorCliente: true,
      nombreFirmaCliente: nombreFirma.trim(),
      fechaFirmaCliente: new Date(),
      ipFirmaCliente: ip,
      estado: nuevoEstado,
    },
  });

  // Marcar al firmante en la SignatureRequest activa y recomputar estado
  try {
    const active = await prisma.signatureRequest.findFirst({
      where: { contratoId: contrato.id, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (active) {
      const signers = (active.signers as any[]) || [];
      const email = challenge.email;
      const updatedSigners = signers.map((s) =>
        s?.email === email ? { ...s, signedAt: new Date().toISOString(), signedBy: nombreFirma.trim() } : s,
      );
      const allSigned = updatedSigners.length > 0 && updatedSigners.every((s) => Boolean(s?.signedAt));
      await prisma.signatureRequest.update({
        where: { id: active.id },
        data: {
          signers: updatedSigners as any,
          status: allSigned ? 'signed' : active.status === 'signed' ? 'signed' : 'sent',
          ...(allSigned ? { completedAt: new Date() } : {}),
        },
      });
    }
  } catch (sigErr: any) {
    console.warn('[FirmaPortal] No se pudo actualizar la SignatureRequest:', sigErr.message);
  }

  await addContratoTimelineEvent({
    contratoId: contrato.id,
    actorType: 'SYSTEM',
    action: 'document_signed',
    note: `Firma digital recibida de ${challenge.email} (Portal Volkern)`,
    metadata: { canal: 'portal', email: challenge.email, nombreFirma: nombreFirma.trim(), ip },
  });

  // Auditoría
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: null,
        accion: 'firmar',
        entidad: 'contrato',
        entidadId: contrato.id,
        descripcion: `Cliente firmó el contrato ${contrato.numero} desde el portal (código verificado) desde IP: ${ip}`,
      },
    });
  } catch {
    // No romper el flujo si la auditoría falla
  }

  // Cerrar el deal si aplica
  try {
    if (contrato.dealId) {
      const stage = await prisma.pipelineStage.findFirst({
        where: { tenantId, nombre: { contains: 'Cerrado', mode: 'insensitive' } },
      });
      if (stage) {
        await prisma.deal.update({ where: { id: contrato.dealId }, data: { etapa: stage.nombre } });
        await prisma.dealActivity.create({
          data: {
            dealId: contrato.dealId,
            tenantId,
            tipo: 'nota',
            titulo: 'Contrato firmado',
            descripcion: `El cliente ${nombreFirma.trim()} firmó el contrato ${contrato.numero} desde el portal`,
          },
        });
      }
    }
  } catch (dealErr: any) {
    console.warn('[FirmaPortal] No se pudo cerrar el deal:', dealErr.message);
  }

  // Notificar a los agentes del tenant
  try {
    const targetUsers = await prisma.user.findMany({
      where: { tenantId, estado: 'activo' },
      select: { id: true },
      take: 20,
    });
    if (targetUsers.length > 0) {
      await prisma.inAppNotification.createMany({
        data: targetUsers.map((u) => ({
          tenantId,
          userId: u.id,
          title: '✍️ Contrato firmado',
          body: `${contrato.numero} · ${contrato.titulo || 'Contrato'} fue firmado por ${challenge.email} desde el portal.`,
          type: 'contract_signed',
          actionUrl: `/dashboard/contratos/${contrato.id}`,
          data: { contratoId: contrato.id, canal: 'portal' },
        })),
      });
    }
  } catch (notifErr: any) {
    console.warn('[FirmaPortal] No se pudo notificar a los agentes:', notifErr.message);
  }

  await prisma.contratoFirmaChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: new Date() },
  });

  return { estado: nuevoEstado, numero: contrato.numero, nombreFirma: nombreFirma.trim() };
}
