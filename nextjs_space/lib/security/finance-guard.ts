import { NextResponse } from 'next/server';
import { verifyFinancialIntegrity, reportSecurityIncident } from './integrity-service';
import { prisma } from '@/lib/db';

/**
 * Escudo Financiero (Finance Guard)
 * Middleware de protección para rutas /api/erp/finance/*
 */
export async function validateFinancialSecurity(tenantId: string, user: { id: string, role: string, email: string }) {
  // 1. Validación de Rol Jerárquico
  const allowedRoles = ['OWNER', 'FINANCE_ADMIN'];
  if (!allowedRoles.includes(user.role.toUpperCase())) {
     await reportSecurityIncident({
        tenantId,
        type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        severity: 'HIGH',
        details: `Usuario ${user.email} con rol ${user.role} intentó acceder a datos financieros restringidos.`
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
