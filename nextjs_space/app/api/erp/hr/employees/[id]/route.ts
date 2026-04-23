import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { withTenantAuth } from '@/lib/api-key-auth';
import { hasPermission } from '@/lib/permissions';

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

    const data = await req.json();
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

    // Convertir fechas si existen y son válidas
    if (updateData.birthDate) updateData.birthDate = new Date(updateData.birthDate);
    if (updateData.visaExpiry) updateData.visaExpiry = new Date(updateData.visaExpiry);
    if (updateData.hiringDate) updateData.hiringDate = new Date(updateData.hiringDate);

    // Limpiar campos que puedan ser strings vacíos pero que Prisma espera como Date o Null
    if (updateData.birthDate && isNaN(updateData.birthDate.getTime())) delete updateData.birthDate;
    if (updateData.visaExpiry && isNaN(updateData.visaExpiry.getTime())) delete updateData.visaExpiry;
    if (updateData.hiringDate && isNaN(updateData.hiringDate.getTime())) delete updateData.hiringDate;

    // Normalizar managerId
    if (updateData.managerId === "" || updateData.managerId === "none") {
      updateData.managerId = null;
    }

    // Asegurar tipos de datos para campos numéricos y evitar NaNs
    if (updateData.childrenCount !== undefined) updateData.childrenCount = parseInt(updateData.childrenCount);
    if (updateData.distanceToWork !== undefined) updateData.distanceToWork = parseFloat(updateData.distanceToWork);
    if (updateData.salary !== undefined) updateData.salary = updateData.salary ? new Prisma.Decimal(updateData.salary) : null;
    if (updateData.vacationQuota !== undefined) updateData.vacationQuota = parseInt(updateData.vacationQuota);
    if (updateData.vacationUsed !== undefined) updateData.vacationUsed = parseInt(updateData.vacationUsed);
    if (updateData.irpfrate !== undefined) updateData.irpfrate = updateData.irpfrate ? new Prisma.Decimal(updateData.irpfrate) : null;
    if (updateData.ssrate !== undefined) updateData.ssrate = updateData.ssrate ? new Prisma.Decimal(updateData.ssrate) : null;

    // Eliminar NaNs y valores problemáticos
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined || (typeof updateData[key] === 'number' && isNaN(updateData[key]))) {
        delete updateData[key];
      }
    });

    // Si managerId es null o vacío, lo manejamos con precaución
    if (updateData.managerId === "" || updateData.managerId === "none" || updateData.managerId === null) {
      delete updateData.managerId;
      // Si queremos desconectar explícitamente el manager
      (updateData as any).manager = { disconnect: true };
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
      data: updateData
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
