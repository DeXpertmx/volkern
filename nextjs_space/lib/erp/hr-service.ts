import { prisma } from '@/lib/db';
import { VaultService } from '@/lib/security/vault';

export class HRService {
  /**
   * Crear un nuevo empleado con cifrado obligatorio
   */
  static async createEmployee(data: {
    tenantId: string;
    fullName: string;
    email?: string;
    role: string;
    department: string;
    salary: number; // Monto en claro, se cifra aquí
    contractUrl?: string;
  }) {
    const salaryEncrypted = VaultService.encrypt(data.salary.toString());
    const contractUrlEncrypted = data.contractUrl ? VaultService.encrypt(data.contractUrl) : null;

    return await prisma.employee.create({
      data: {
        tenantId: data.tenantId,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        department: data.department,
        salaryEncrypted,
        contractUrlEncrypted,
        encryptionKeyId: 'v2-master' // Identificador de la versión de llave activa
      }
    });
  }

  /**
   * Actualizar datos de empleado
   */
  static async updateEmployee(id: string, tenantId: string, data: Partial<{
    fullName: string;
    role: string;
    department: string;
    salary: number;
    contractUrl: string;
    isActive: boolean;
  }>) {
    const updateData: any = { ...data };

    if (data.salary !== undefined) {
      updateData.salaryEncrypted = VaultService.encrypt(data.salary.toString());
      delete updateData.salary;
    }

    if (data.contractUrl !== undefined) {
      updateData.contractUrlEncrypted = VaultService.encrypt(data.contractUrl);
      delete updateData.contractUrl;
    }

    return await prisma.employee.update({
      where: { id, tenantId },
      data: updateData
    });
  }

  /**
   * Obtener datos de empleado (descifrado bajo demanda auditado)
   */
  static async getEmployeeData(id: string, tenantId: string) {
    const employee = await prisma.employee.findUnique({
      where: { id, tenantId }
    });

    if (!employee) return null;

    return {
      ...employee,
      salary: employee.salaryEncrypted ? parseFloat(VaultService.decrypt(employee.salaryEncrypted)) : 0,
      contractUrl: employee.contractUrlEncrypted ? VaultService.decrypt(employee.contractUrlEncrypted) : null
    };
  }
}
