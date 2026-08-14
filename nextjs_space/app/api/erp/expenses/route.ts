export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';

/**
 * GET /api/erp/expenses - Listar gastos con filtros
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {
      tenantId: auth.tenant!.id
    };

    if (category) where.category = category;
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        supplier: {
          select: { id: true, name: true, taxId: true }
        },
        lead: {
          select: { id: true, nombre: true }
        }
      },
      orderBy: { date: 'desc' },
      take: limit
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenant!.id },
      select: { baseLatitude: true, baseLongitude: true }
    });

    return NextResponse.json({
      expenses,
      tenantConfig: {
        baseLatitude: tenant?.baseLatitude || 40.416775,
        baseLongitude: tenant?.baseLongitude || -3.703790
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ error: 'Error al cargar gastos' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/expenses - Crear un nuevo gasto (usando el skill central)
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    
    // Validaciones básicas
    if (!body.description || !body.amount || !body.supplierId) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    // El usuario de sesión vive en el control plane, pero `Expense.createdBy`
    // tiene una FK contra la copia de usuarios de la base de datos del tenant.
    // En algunas cuentas (especialmente las provisionadas antes del aislamiento
    // por tenant) ambos IDs no coinciden. Resolver aquí un creador existente
    // evita el 500/FK que impedía guardar la captura manual.
    const tenantId = auth.tenant!.id;
    const tenantDb = auth.db as any;
    let createdById = auth.user?.id;
    if (tenantDb?.user && createdById) {
      const creatorInTenant = await tenantDb.user.findFirst({
        where: { id: createdById, tenantId },
        select: { id: true },
      });
      if (!creatorInTenant) {
        const fallbackCreator = await tenantDb.user.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        createdById = fallbackCreator?.id;
      }
    }
    if (!createdById) {
      return NextResponse.json({ error: 'No hay un usuario válido para registrar este gasto.' }, { status: 422 });
    }

    // Bloqueo preventivo de duplicados. Primero usamos el número de factura
    // por proveedor; si no existe, hacemos una comprobación conservadora por
    // proveedor + importe + día. Se puede saltar solo con confirmación expresa
    // desde el formulario (allowDuplicate=true).
    const invoiceNumber = typeof body.invoiceNumber === 'string' ? body.invoiceNumber.trim() : '';
    const candidateDate = body.date ? new Date(body.date) : new Date();
    let duplicate: any = null;

    if (!body.allowDuplicate) {
      if (invoiceNumber) {
        duplicate = await prisma.expense.findFirst({
          where: { tenantId, supplierId: body.supplierId, invoiceNumber },
          select: { id: true, invoiceNumber: true, amount: true, date: true, currency: true, description: true },
          orderBy: { createdAt: 'desc' },
        });
      } else if (!Number.isNaN(candidateDate.getTime())) {
        const start = new Date(candidateDate);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 1);
        const amount = Number(body.totalFactura || body.amount);
        if (Number.isFinite(amount)) {
          duplicate = await prisma.expense.findFirst({
            where: {
              tenantId,
              supplierId: body.supplierId,
              amount,
              date: { gte: start, lt: end },
            },
            select: { id: true, invoiceNumber: true, amount: true, date: true, currency: true, description: true },
            orderBy: { createdAt: 'desc' },
          });
        }
      }
    }

    if (duplicate) {
      return NextResponse.json({
        code: 'POSSIBLE_DUPLICATE',
        error: invoiceNumber
          ? `Ya existe una factura ${invoiceNumber} de este proveedor.`
          : 'Ya existe un gasto del mismo proveedor con el mismo importe y fecha.',
        duplicate: {
          id: duplicate.id,
          invoiceNumber: duplicate.invoiceNumber,
          amount: duplicate.amount,
          date: duplicate.date,
          currency: duplicate.currency,
          description: duplicate.description,
        },
      }, { status: 409 });
    }

    // Si la captura es manual o el OCR dejó vacío el receptor, completar desde
    // el perfil fiscal principal del tenant (la empresa que recibe el gasto).
    const fiscalReceiver = await prisma.configuracionFiscalEmisor.findFirst({
      where: { tenantId, activo: true },
      orderBy: [{ esPrincipal: 'desc' }, { fechaCreacion: 'asc' }],
      select: { razonSocial: true, idFiscal: true, direccion: true, codigoPostal: true, ciudad: true },
    });
    const receptorNombre = body.receptorNombre || fiscalReceiver?.razonSocial;
    const receptorNif = body.receptorNif || fiscalReceiver?.idFiscal;
    const receptorDireccion = body.receptorDireccion || (
      fiscalReceiver
        ? [fiscalReceiver.direccion, fiscalReceiver.codigoPostal, fiscalReceiver.ciudad].filter(Boolean).join(', ')
        : undefined
    );

    const expense = await (skills as any).create_expense({
      tenantId,
      createdById,
      supplierId: body.supplierId,
      leadId: body.leadId,
      description: body.description,
      amount: parseFloat(body.amount),
      currency: body.currency || 'EUR',
      date: body.date ? new Date(body.date) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      paymentMethod: body.paymentMethod,
      category: body.category || 'General',
      receiptUrl: body.receiptUrl,
      status: body.status || 'PAID',
      // Verifactu fields
      invoiceNumber: body.invoiceNumber,
      serie: body.serie,
      taxableBase: body.taxableBase ? parseFloat(body.taxableBase) : undefined,
      vatRate: body.vatRate ? parseFloat(body.vatRate) : undefined,
      vatAmount: body.vatAmount ? parseFloat(body.vatAmount) : undefined,
      irpfRate: body.irpfRate ? parseFloat(body.irpfRate) : undefined,
      irpfAmount: body.irpfAmount ? parseFloat(body.irpfAmount) : undefined,
      ivaRetentionRate: body.ivaRetentionRate ? parseFloat(body.ivaRetentionRate) : undefined,
      ivaRetentionAmount: body.ivaRetentionAmount ? parseFloat(body.ivaRetentionAmount) : undefined,
      surchargeRate: body.surchargeRate ? parseFloat(body.surchargeRate) : undefined,
      surchargeAmount: body.surchargeAmount ? parseFloat(body.surchargeAmount) : undefined,
      taxRegime: body.taxRegime,
      operationType: body.operationType,
      totalFactura: body.totalFactura ? parseFloat(body.totalFactura) : undefined,
      operationDate: body.operationDate ? new Date(body.operationDate) : undefined,
      issuerName: body.issuerName,
      issuerAddress: body.issuerAddress,
      issuerTaxId: body.issuerTaxId,
      receptorNombre,
      receptorNif,
      receptorDireccion,
      iban: body.iban,
      lineas: body.lineas,
      vatBreakdown: Array.isArray(body.vatBreakdown) ? body.vatBreakdown : undefined,
    });

    return NextResponse.json(expense);
  } catch (error: any) {
    console.error('Error creating expense:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('erp_expenses_createdById_fkey')) {
      return NextResponse.json({ error: 'No se encontró un usuario válido para registrar el gasto.' }, { status: 422 });
    }
    return NextResponse.json({ error: 'Error al registrar el gasto', details: process.env.NODE_ENV === 'development' ? message : undefined }, { status: 500 });
  }
}, ['erp:write']);
