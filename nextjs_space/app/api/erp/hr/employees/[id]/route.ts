export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { withTenantAuth } from '@/lib/api-key-auth';
import { hasPermission } from '@/lib/permissions';
import { validateBody } from '@/lib/validation';
import { EmployeeUpdateSchema } from '@/lib/validation/schemas';

export const GET = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Captura de ID a prueba de fallos
    const url = new URL(req.url);
    const employeeId = params?.id || url.pathname.split('/').pop();

    if (!employeeId || employeeId === 'employees') {
      return NextResponse.json({ error: 'ID de empleado no válido' }, { status: 400 });
    }

    const employee = await prisma.employee.findFirst({
      where: { 
        id: employeeId,
        tenantId: tenantId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: {
              select: {
                id: true,
                nombre: true
              }
            },
          }
        },
        manager: {
          select: { id: true, fullName: true, jobTitle: true }
        }
      }
    });

    if (!employee) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

    return NextResponse.json(employee);
  } catch (error) {
    console.error('Error in Employee GET:', error);
    return NextResponse.json({ error: 'Error al obtener empleado' }, { status: 500 });
  }
}, ['team:read']);

export const PATCH = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const url = new URL(req.url);
    const employeeId = params?.id || url.pathname.split('/').pop();
    
    if (!employeeId || employeeId === 'employees') {
      return NextResponse.json({ error: 'ID de empleado no válido' }, { status: 400 });
    }

    const raw = await req.json();
    const data = validateBody(EmployeeUpdateSchema.passthrough(), raw);
    if (data instanceof NextResponse) return data;

    console.log(`[EMPLOYEE_PATCH] Updating employee ${employeeId} for tenant ${tenantId}`);

    // Sanitizar datos relacionales e inmutables para evitar errores de Prisma
    const { 
      user, manager, subordinates, 
      EmployeeBenefit, attendances, erp_digital_access, 
      erp_digital_signatures, erp_employee_assets, erp_employee_schedules,
      erp_expense_claims, payrollRecords, erp_vacation_requests,
      id, tenantId: _tId, createdAt, updatedAt, 
      userId, encryptionKeyId,
      bankDetails, governmentId,
      ...updateData 
    } = data;

    // Convertir fechas si existen y son válidas (as any needed: passthrough schema yields {} types)
    if ((updateData as any).birthDate) (updateData as any).birthDate = new Date((updateData as any).birthDate);
    if ((updateData as any).visaExpiry) (updateData as any).visaExpiry = new Date((updateData as any).visaExpiry);
    if ((updateData as any).hiringDate) (updateData as any).hiringDate = new Date((updateData as any).hiringDate);

    // Limpiar campos que puedan ser strings vacíos pero que Prisma espera como Date o Null
    if ((updateData as any).birthDate && isNaN(((updateData as any).birthDate as Date).getTime())) delete (updateData as any).birthDate;
    if ((updateData as any).visaExpiry && isNaN(((updateData as any).visaExpiry as Date).getTime())) delete (updateData as any).visaExpiry;
    if ((updateData as any).hiringDate && isNaN(((updateData as any).hiringDate as Date).getTime())) delete (updateData as any).hiringDate;

    // Normalizar managerId
    if ((updateData as any).managerId === "" || (updateData as any).managerId === "none") {
      (updateData as any).managerId = null;
    }

    // Asegurar tipos de datos para campos numéricos y evitar NaNs
    if ((updateData as any).childrenCount !== undefined) (updateData as any).childrenCount = parseInt((updateData as any).childrenCount as string);
    if ((updateData as any).distanceToWork !== undefined) (updateData as any).distanceToWork = parseFloat((updateData as any).distanceToWork as string);
    if ((updateData as any).salary !== undefined) (updateData as any).salary = (updateData as any).salary ? new Prisma.Decimal((updateData as any).salary) : null;
    if ((updateData as any).vacationQuota !== undefined) (updateData as any).vacationQuota = parseInt((updateData as any).vacationQuota as string);
    if ((updateData as any).vacationUsed !== undefined) (updateData as any).vacationUsed = parseInt((updateData as any).vacationUsed as string);
    if ((updateData as any).irpfrate !== undefined) (updateData as any).irpfrate = (updateData as any).irpfrate ? new Prisma.Decimal((updateData as any).irpfrate) : null;
    if ((updateData as any).ssrate !== undefined) (updateData as any).ssrate = (updateData as any).ssrate ? new Prisma.Decimal((updateData as any).ssrate) : null;

    // Eliminar NaNs y valores problemáticos
    const ud = updateData as any;
    Object.keys(ud).forEach(key => {
      if (ud[key] === undefined || (typeof ud[key] === 'number' && isNaN(ud[key]))) {
        delete ud[key];
      }
    });

    // Si managerId es null o vacío, lo manejamos con precaución
    if (ud.managerId === "" || ud.managerId === "none" || ud.managerId === null) {
      delete ud.managerId;
      ud.manager = { disconnect: true };
    }
    // Debug: Verificar estado del Vault antes de ejecutar la escritura
    const { dbContext: _ctx } = await import('@/lib/db');
    const store = _ctx.getStore?.();
    console.log(`[EMPLOYEE_PATCH] Vault context: tenantId=${store?.tenantId}, vaultSeed=${store?.vaultSeed ? 'PRESENT' : 'MISSING'}`);

    const updatedEmployee = await prisma.employee.update({
      where: { 
        id: employeeId,
        tenantId: tenantId
      },
      data: updateData as any
    });

    return NextResponse.json(updatedEmployee);
  } catch (error: any) {
    console.error('Error in Employee PATCH:', error);
    return NextResponse.json({ 
      error: 'Error al actualizar empleado', 
      details: error.message,
      code: error.code 
    }, { status: 500 });
  }
}, ['team:write']);
