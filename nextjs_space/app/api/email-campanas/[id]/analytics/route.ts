export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

// GET - Obtener métricas avanzadas y analytics de una campaña
export async function GET(
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
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const { id } = params;

    // Obtener campaña con todos los datos
    const campana = await prisma.emailCampaign.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        destinatarios: true,
        resultadoAB: true,
      },
    });

    if (!campana) {
      return NextResponse.json(
        { error: "Campaña no encontrada" },
        { status: 404 }
      );
    }

    // Métricas básicas
    const totalEnviados = campana.destinatarios.filter(
      (d) => d.estado === "enviado"
    ).length;
    const totalAbiertos = campana.destinatarios.filter((d) => d.abierto).length;
    const totalClics = campana.destinatarios.filter((d) => d.clicado).length;
    const totalConversiones = campana.destinatarios.filter(
      (d) => d.convertido
    ).length;
    const totalFallidos = campana.destinatarios.filter(
      (d) => d.estado === "fallido" || d.estado === "rebotado"
    ).length;

    // Tasas
    const tasaEntrega =
      campana.totalDestinatarios > 0
        ? ((totalEnviados / campana.totalDestinatarios) * 100).toFixed(2)
        : "0.00";
    const tasaApertura =
      totalEnviados > 0
        ? ((totalAbiertos / totalEnviados) * 100).toFixed(2)
        : "0.00";
    const tasaClic =
      totalEnviados > 0 ? ((totalClics / totalEnviados) * 100).toFixed(2) : "0.00";
    const tasaConversion =
      totalEnviados > 0
        ? ((totalConversiones / totalEnviados) * 100).toFixed(2)
        : "0.00";
    const tasaRebote =
      campana.totalDestinatarios > 0
        ? ((totalFallidos / campana.totalDestinatarios) * 100).toFixed(2)
        : "0.00";

    // Timeline de aperturas (últimos 7 días)
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);

    const aperturasTimeline = await prisma.campaignRecipient.groupBy({
      by: ["fechaApertura"],
      where: {
        campanaId: id,
        abierto: true,
        fechaApertura: {
          gte: hace7Dias,
        },
      },
      _count: true,
    });

    // Top horas de apertura
    const destinatariosConApertura = campana.destinatarios.filter(
      (d) => d.abierto && d.fechaApertura
    );
    const aperturasPorHora: { [key: string]: number } = {};
    destinatariosConApertura.forEach((d) => {
      if (d.fechaApertura) {
        const hora = new Date(d.fechaApertura).getHours();
        const horaStr = `${hora}:00`;
        aperturasPorHora[horaStr] = (aperturasPorHora[horaStr] || 0) + 1;
      }
    });

    // Dispositivos (simulado - en producción vendría de metadataJSON)
    const dispositivosMock = {
      desktop: Math.floor(totalAbiertos * 0.6),
      mobile: Math.floor(totalAbiertos * 0.35),
      tablet: Math.floor(totalAbiertos * 0.05),
    };

    // Clientes de email (simulado)
    const clientesMock = {
      Gmail: Math.floor(totalAbiertos * 0.5),
      Outlook: Math.floor(totalAbiertos * 0.25),
      Apple: Math.floor(totalAbiertos * 0.15),
      Otros: Math.floor(totalAbiertos * 0.1),
    };

    // ROI y conversiones
    const valorTotal = campana.destinatarios.reduce(
      (sum, d) => sum + (d.valorConversion || 0),
      0
    );
    const roi = campana.roiCalculado?.toFixed(2) || "0.00";

    return NextResponse.json({
      // Información básica
      campana: {
        id: campana.id,
        nombre: campana.nombre,
        estado: campana.estado,
        fechaEnvio: campana.fechaEnvio,
        esABTest: campana.esABTest,
      },

      // Métricas básicas
      metricas: {
        totalDestinatarios: campana.totalDestinatarios,
        totalEnviados,
        totalAbiertos,
        totalClics,
        totalConversiones,
        totalFallidos,
      },

      // Tasas
      tasas: {
        entrega: parseFloat(tasaEntrega),
        apertura: parseFloat(tasaApertura),
        clic: parseFloat(tasaClic),
        conversion: parseFloat(tasaConversion),
        rebote: parseFloat(tasaRebote),
      },

      // Timeline
      timeline: {
        aperturas: aperturasTimeline.map((a) => ({
          fecha: a.fechaApertura,
          cantidad: a._count,
        })),
        aperturasPorHora: Object.entries(aperturasPorHora).map(
          ([hora, cantidad]) => ({
            hora,
            cantidad,
          })
        ),
      },

      // Segmentación
      segmentacion: {
        dispositivos: dispositivosMock,
        clientesEmail: clientesMock,
      },

      // ROI y conversiones
      rendimiento: {
        totalConversiones,
        valorTotal,
        valorPromedio: campana.valorConversion?.toFixed(2) || "0.00",
        costoTotal: campana.costoTotal?.toFixed(2) || "0.00",
        roi: parseFloat(roi),
      },

      // Resultados A/B si aplica
      abTest: campana.esABTest ? campana.resultadoAB : null,
    });
  } catch (error) {
    console.error("Error al obtener analytics:", error);
    return NextResponse.json(
      { error: "Error al obtener analytics" },
      { status: 500 }
    );
  }
}
