export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

// POST - Registrar conversión de un destinatario
export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true, id: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const { id } = params;
    const { recipientId, valorConversion } = await req.json();

    if (!recipientId) {
      return NextResponse.json(
        { error: "recipientId es requerido" },
        { status: 400 }
      );
    }

    // Verificar que el recipient existe y pertenece a esta campaña
    const recipient = await prisma.campaignRecipient.findFirst({
      where: {
        id: recipientId,
        campanaId: id,
        tenantId: user.tenantId,
      },
    });

    if (!recipient) {
      return NextResponse.json(
        { error: "Destinatario no encontrado" },
        { status: 404 }
      );
    }

    // Actualizar recipient
    const updatedRecipient = await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        convertido: true,
        fechaConversion: new Date(),
        valorConversion: valorConversion || null,
      },
    });

    // Actualizar contadores de la campaña
    const campana = await prisma.emailCampaign.findUnique({
      where: { id },
      include: {
        destinatarios: {
          where: {
            convertido: true,
          },
        },
      },
    });

    if (campana) {
      const totalConversiones = campana.destinatarios.length;
      const valorTotal = campana.destinatarios.reduce(
        (sum, d) => sum + (d.valorConversion || 0),
        0
      );
      const valorConversionPromedio =
        totalConversiones > 0 ? valorTotal / totalConversiones : 0;

      // Calcular ROI si hay costo
      let roiCalculado = null;
      if (campana.costoTotal && campana.costoTotal > 0) {
        roiCalculado = ((valorTotal - campana.costoTotal) / campana.costoTotal) * 100;
      }

      await prisma.emailCampaign.update({
        where: { id },
        data: {
          totalConversiones,
          valorConversion: valorConversionPromedio,
          roiCalculado,
        },
      });
    }

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        accion: "registrar_conversion",
        entidad: "CampaignRecipient",
        entidadId: recipientId,
        descripcion: `Conversión registrada: $${valorConversion || 0}`,
        cambiosDespues: JSON.stringify({
          campanaId: id,
          valorConversion: valorConversion || 0,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      recipient: updatedRecipient,
    });
  } catch (error) {
    console.error("Error al registrar conversión:", error);
    return NextResponse.json(
      { error: "Error al registrar conversión" },
      { status: 500 }
    );
  }
}
