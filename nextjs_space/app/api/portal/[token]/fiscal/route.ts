export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TaxType } from '@prisma/client';

/**
 * GET /api/portal/[token]/fiscal
 * Public access point for customers to view their fiscal situation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    // 1. Buscar el portal access por token
    const access = await prisma.erp_customer_portal_access.findUnique({
      where: { token, isActive: true },
      include: {
        erp_sales_orders: {
          select: { contactId: true, tenantId: true, id: true },
        },
      },
    });

    if (!access?.erp_sales_orders) {
      return NextResponse.json({ error: 'Acceso no válido' }, { status: 404 });
    }

    const { tenantId, contactId } = access.erp_sales_orders;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    // 2. Obtener perfil fiscal del contacto
    const perfilFiscal = contactId
      ? await prisma.perfilFiscalCliente.findUnique({
          where: { contactId },
          select: {
            nif: true,
            razonSocial: true,
            tipoIdFiscal: true,
            regimenFiscal: true,
            country: true,
            defaultIva: true,
            defaultIrpf: true,
            exentoImpuestos: true,
            aplicaRetencion: true,
            emailFacturacion: true,
            address: true,
            city: true,
            province: true,
            iban: true,
          },
        })
      : null;

    // 3. Obtener facturas del contacto
    const invoices = contactId
      ? await prisma.invoice.findMany({
          where: { tenantId, contactId },
          orderBy: { fechaEmision: 'desc' },
          select: {
            id: true,
            numero: true,
            monto: true,
            moneda: true,
            estado: true,
            fechaEmision: true,
            fechaVencimiento: true,
            urlPdf: true,
            fingerprint: true,
            isSealed: true,
            aeatStatus: true,
          },
          take: 20,
        })
      : [];

    // 4. Obtener resumen de IVA del trimestre actual
    const now = new Date();
    const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
    const currentYear = now.getFullYear();
    const months = getMonthsForQuarter(currentQuarter);

    const taxRecords = await prisma.taxRecord.findMany({
      where: {
        tenantId,
        periodYear: currentYear,
        periodMonth: { in: months },
      },
      select: {
        type: true,
        baseAmount: true,
        taxAmount: true,
        isFiled: true,
      },
    });

    // Calcular IVA trimestre actual
    let outputVat = 0;
    let inputVat = 0;
    let vatFiled = false;
    let irpfWithholding = 0;
    let irpfFiled = false;

    for (const r of taxRecords) {
      const amount = Number(r.taxAmount);
      const base = Number(r.baseAmount);

      if (r.type === TaxType.IVA_REPERCUTIDO) {
        outputVat += amount;
        if (r.isFiled) vatFiled = true;
      } else if (r.type === TaxType.IVA_SOPORTADO) {
        inputVat += amount;
        if (r.isFiled) vatFiled = true;
      } else if (r.type === TaxType.IRPF_RETENCION) {
        irpfWithholding += amount;
        if (r.isFiled) irpfFiled = true;
      }
    }

    // 5. Obtener próximos vencimientos (usando FiscalCalendarService si existe)
    let upcomingDeadlines: Array<{ model: string; name: string; periodLabel: string; dueDate: string; daysUntilDue: number }> = [];
    try {
      const { FiscalCalendarService } = await import('@/lib/accounting/fiscal-calendar-service');
      const summary = await FiscalCalendarService.getCalendarSummary(tenantId);
      upcomingDeadlines = summary.upcomingDeadlines
        .filter(d => d.daysUntilDue >= 0 && d.daysUntilDue <= 60)
        .map(d => ({
          model: d.model,
          name: d.name,
          periodLabel: d.periodLabel,
          dueDate: d.dueDate.toISOString(),
          daysUntilDue: d.daysUntilDue,
        }));
    } catch {
      // Si el servicio no existe, continuar sin deadlines
    }

    // 6. Totales consolidados del año
    const yearlyVat = await prisma.taxRecord.aggregate({
      where: {
        tenantId,
        periodYear: currentYear,
        type: { in: [TaxType.IVA_REPERCUTIDO, TaxType.IVA_SOPORTADO] },
      },
      _sum: { taxAmount: true },
    });

    const yearlyIrpf = await prisma.taxRecord.aggregate({
      where: {
        tenantId,
        periodYear: currentYear,
        type: TaxType.IRPF_RETENCION,
      },
      _sum: { taxAmount: true },
    });

    // 7. Actualizar tracking del portal
    await prisma.erp_customer_portal_access.update({
      where: { id: access.id },
      data: { lastAccessAt: new Date() },
    });

    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

    return NextResponse.json({
      success: true,
      tenantId,
      contactId,
      perfilFiscal: perfilFiscal ? {
        nif: perfilFiscal.nif,
        razonSocial: perfilFiscal.razonSocial,
        tipoIdFiscal: perfilFiscal.tipoIdFiscal,
        regimenFiscal: perfilFiscal.regimenFiscal,
        country: perfilFiscal.country,
        defaultIva: Number(perfilFiscal.defaultIva),
        defaultIrpf: Number(perfilFiscal.defaultIrpf),
        exentoImpuestos: perfilFiscal.exentoImpuestos,
        aplicaRetencion: perfilFiscal.aplicaRetencion,
        emailFacturacion: perfilFiscal.emailFacturacion,
        address: perfilFiscal.address,
        city: perfilFiscal.city,
        province: perfilFiscal.province,
      } : null,
      vatSummary: {
        currentQuarter: `T${currentQuarter}`,
        outputVat: formatCurrency(outputVat),
        inputVat: formatCurrency(inputVat),
        result: formatCurrency(outputVat - inputVat),
        isFiled: vatFiled,
      },
      irpfSummary: {
        totalWithholding: formatCurrency(irpfWithholding),
        isFiled: irpfFiled,
      },
      yearlyTotals: {
        vat: formatCurrency(Number(yearlyVat._sum.taxAmount || 0)),
        irpf: formatCurrency(Number(yearlyIrpf._sum.taxAmount || 0)),
      },
      invoices: invoices.map(inv => ({
        id: inv.id,
        numero: inv.numero,
        monto: formatCurrency(inv.monto),
        moneda: inv.moneda,
        estado: inv.estado,
        fechaEmision: inv.fechaEmision.toISOString(),
        fechaVencimiento: inv.fechaVencimiento?.toISOString() || null,
        urlPdf: inv.urlPdf,
        isSealed: inv.isSealed,
        aeatStatus: inv.aeatStatus,
      })),
      upcomingDeadlines,
    });
  } catch (error) {
    console.error('Error in Portal Fiscal API:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

function getMonthsForQuarter(quarter: number): number[] {
  switch (quarter) {
    case 1: return [1, 2, 3];
    case 2: return [4, 5, 6];
    case 3: return [7, 8, 9];
    case 4: return [10, 11, 12];
    default: return [];
  }
}
