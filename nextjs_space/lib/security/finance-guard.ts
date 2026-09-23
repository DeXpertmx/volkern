import { NextResponse } from 'next/server';
import { verifyFinancialIntegrity, reportSecurityIncident } from './integrity-service';
import { prisma } from '@/lib/db';
import { hasPermisoDeRol } from '@/lib/permissions-core';

/**
 * Escudo Financiero (Finance Guard)
 * Middleware de protección para rutas /api/erp/finance/*
 */

/**
 * Quién ve el cockpit financiero consolidado de la cuenta.
 *
 * Lo decide el permiso `configuracion.gestionar` —el de administrar la cuenta—
 * y no el nombre del rol. Antes era una lista de nombres ('SUPERADMIN',
 * 'ADMIN', 'OWNER', 'FINANCE_ADMIN'): el propietario de la cuenta perdía el
 * acceso en cuanto su rol se llamaba distinto, y cualquier rol bautizado
 * «Admin» lo ganaba sin que nadie se lo hubiera concedido. El resumen
 * ejecutivo de la cuenta es parte de administrarla, así que comparte llave con
 * el resto de la configuración; cuando exista un permiso financiero propio,
 * esta es la única línea que cambia.
 */
function puedeVerFinanzasConsolidadas(rol: RolRecibido): boolean {
  return hasPermisoDeRol(rol as never, 'configuracion', 'gestionar');
}

/** Rol en cualquiera de las formas en que llega: cadena, objeto `Role` o nada. */
export type RolRecibido =
  | string
  | { nombre?: string | null; name?: string | null }
  | null
  | undefined;

/**
 * Nombre del rol, venga como cadena o como la relación `Role` de la base.
 *
 * `auth.user.role` es el objeto `{ id, nombre, permisos }` tanto con sesión como
 * con clave de API, no una cadena: el guard pedía `user.role.toUpperCase()` y
 * lanzaba 'toUpperCase is not a function' en cada petición.
 */
export function nombreDeRol(rol: RolRecibido): string {
  if (!rol) return '';
  if (typeof rol === 'string') return rol.trim();
  return String(rol.nombre || rol.name || '').trim();
}

export async function validateFinancialSecurity(tenantId: string, user: { id: string, role: RolRecibido, email: string }) {
  // 1. Autorización por permiso, no por el nombre del rol
  if (!puedeVerFinanzasConsolidadas(user.role)) {
     await reportSecurityIncident({
        tenantId,
        type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        severity: 'HIGH',
        details: `Usuario ${user.email} con rol ${nombreDeRol(user.role) || '(sin rol)'} intentó acceder a datos financieros restringidos.`
     });
     return { 
       authorized: false, 
       error: "Protocolo de Seguridad: Acceso denegado por nivel de autorización insuficiente.", 
       status: 403 
     };
  }

  // 2. Validación de Integridad (Verificar cadena de hashes)
  const isIntegrityIntact = await verifyFinancialIntegrity(tenantId);
  
  if (!isIntegrityIntact) {
    // REGISTRO DE INCIDENTE CRÍTICO
    await reportSecurityIncident({
      tenantId,
      type: 'FINANCIAL_INTEGRITY_FAILURE',
      severity: 'CRITICAL',
      details: 'Audit log hash mismatch detected. The financial chain has been compromised.'
    });

    // NOTIFICACIÓN MULTICANAL (Mock - Integrar con OneSignal/Resend en producción)
    console.error(`🚨 ALERTA DE SEGURIDAD (Tenant ${tenantId}): Se ha detectado manipulación de datos financieros.`);
    
    // MODO FORTALEZA: Bloqueo Parcial
    return {
      authorized: false,
      error: "⚠️ SECURITY PROTOCOL ACTIVE: El acceso al Cockpit ha sido restringido debido a una discrepancia en la integridad de los registros.",
      status: 403,
      alertOwner: true
    };
  }

  return { authorized: true };
}
