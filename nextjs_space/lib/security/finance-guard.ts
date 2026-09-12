import { NextResponse } from 'next/server';
import { verifyFinancialIntegrity, reportSecurityIncident } from './integrity-service';
import { prisma } from '@/lib/db';

/**
 * Escudo Financiero (Finance Guard)
 * Middleware de protección para rutas /api/erp/finance/*
 */

/**
 * Roles con acceso a los datos financieros consolidados.
 *
 * Los nombres son los que la plataforma usa de verdad (`Role.nombre`: Superadmin,
 * Admin, Sales Agent). El guard nació comparando contra 'OWNER' y 'FINANCE_ADMIN'
 * -nombres que ningún rol de la base tiene-, así que o dejaba fuera a todo el
 * mundo o, como el rol llega como objeto y no como cadena, reventaba con un 500
 * antes de decidir. Se conservan los dos nombres originales para no romper a
 * quien los use.
 */
export const ROLES_CON_ACCESO_FINANCIERO = ['SUPERADMIN', 'ADMIN', 'OWNER', 'FINANCE_ADMIN'];

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
  // 1. Validación de Rol Jerárquico
  if (!ROLES_CON_ACCESO_FINANCIERO.includes(nombreDeRol(user.role).toUpperCase())) {
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
