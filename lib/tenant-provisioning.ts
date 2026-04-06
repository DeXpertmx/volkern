import { exec } from 'child_process';
import { promisify } from 'util';
import { globalPrisma } from './db';
import path from 'path';

const execPromise = promisify(exec);

export interface ProvisioningResult {
  success: boolean;
  message: string;
  dbUrl?: string;
  error?: any;
}

/**
 * Provee físicamente una base de datos para un tenant.
 * Crea la base de datos en PostgreSQL y ejecuta las migraciones de Prisma.
 * @param tenantId - ID del tenant a provisionar
 * @returns Resultado de la operación
 */
export async function provisionTenantDatabase(tenantId: string): Promise<ProvisioningResult> {
  try {
    const tenant = await globalPrisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      return { success: false, message: 'Tenant no encontrado' };
    }

    if (!tenant.dbUrl) {
      return { success: false, message: 'El tenant no tiene una dbUrl configurada' };
    }

    // 1. Extraer nombre de la base de datos de la URL
    // Ejemplo: postgresql://user:pass@localhost:5432/dbname
    const dbNameMatch = tenant.dbUrl.match(/\/([^/?]+)(\?.*)?$/);
    if (!dbNameMatch) {
      return { success: false, message: 'Formato de dbUrl inválido' };
    }
    const dbName = dbNameMatch[1];

    console.log(`[Provisioning] Creando base de datos: ${dbName}`);

    // 2. Crear la base de datos físicamente (usando la URL administrativa por defecto)
    // Se asume que el usuario de la DB tiene permisos de CREATEDB
    const adminDbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
    
    // Comando para crear la DB si no existe (PostgreSQL)
    const createDbCmd = `psql "${adminDbUrl}" -c "CREATE DATABASE \\"${dbName}\\";" || true`;
    await execPromise(createDbCmd);

    // 3. Ejecutar migraciones de Prisma sobre la nueva base de datos
    console.log(`[Provisioning] Ejecutando migraciones Prisma para ${tenantId}...`);
    
    const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
    const prismaCmd = `DATABASE_URL="${tenant.dbUrl}" npx prisma db push --schema="${schemaPath}" --accept-data-loss`;
    
    const { stdout, stderr } = await execPromise(prismaCmd);
    
    if (stderr && stderr.includes('Error')) {
      console.error(`[Provisioning] Error en Prisma: ${stderr}`);
      return { success: false, message: 'Error al sincronizar esquema Prisma', error: stderr };
    }

    return { 
      success: true, 
      message: `Base de datos ${dbName} provisionada y sincronizada correctamente`,
      dbUrl: tenant.dbUrl 
    };

  } catch (error: any) {
    console.error(`[Provisioning] Error fatal provisionando tenant ${tenantId}:`, error);
    return { 
      success: false, 
      message: error.message || 'Error desconocido durante el provisionamiento',
      error 
    };
  }
}
