export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getDownloadUrl } from '@/lib/s3';
import { AuditService } from '@/lib/audit-service';
import { clearBrandingCache, getEffectiveBranding } from '@/lib/branding';

// Intenta parsear un valor guardado como JSON; si no, lo devuelve crudo
function tryParse(valor: string): any {
  try {
    return JSON.parse(valor);
  } catch {
    return valor;
  }
}

// Claves sensibles que NUNCA deben quedar en claro en el historial
const CLAVES_SENSIBLES = /password|secret|token|apikey|api_key/i;

// Prepara un valor para el historial enmascarando secretos
function valorParaHistorial(clave: string, valor: any): any {
  if (CLAVES_SENSIBLES.test(clave)) return '[REDACTED]';
  return valor;
}

// GET /api/configuracion - Obtener configuración del tenant
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const config = await prisma.configuracion.findMany({
      where: { tenantId: tenantId },
    });
    
    // Convertir array a objeto
    const configObj = config.reduce((acc: any, item) => {
      acc[item.clave] = tryParse(item.valor);
      return acc;
    }, {});

    // Helper para verificar si es una S3 key
    const isS3Key = (valor: string) => {
      return valor && !valor.startsWith('http') && !valor.startsWith('/') && valor.includes('configuracion/');
    };

    // Si logo_corporativo es una S3 key, convertir a URL firmada
    if (configObj.logo_corporativo && isS3Key(configObj.logo_corporativo)) {
      configObj.logo_corporativo = await getDownloadUrl(configObj.logo_corporativo, 604800); // 7 días
    }

    // Agregar el tenantId a la respuesta para usar en códigos de embed
    configObj._tenantId = tenantId;
    // Slug público de la cuenta: es el único segmento que resuelve /p/<slug>.
    // El id no sirve como URL (dejaba enlaces 404 en el panel), así que el slug
    // viaja con la configuración en vez de deducirse en el cliente.
    configObj._tenantSlug = auth.tenant!.slug;
    // Marca efectiva (con cascada oficina → matriz) para las vistas previas del
    // panel: el selector de plantilla se pinta con el color y el logo reales.
    const branding = await getEffectiveBranding(tenantId);
    configObj._tenantBranding = {
      primaryColor: branding.primaryColor,
      logoUrl: branding.logoUrl,
      companyName: branding.companyName,
    };

    return NextResponse.json(configObj);
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}, ['config:read', 'settings:read'])

// POST /api/configuracion - Guardar configuración del tenant
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    let body = await request.json();

    // Si el body viene envuelto en { section, data } (o solo { data }), extraer solo data
    const wrapped = body.data && typeof body.data === 'object' && !Array.isArray(body.data);
    if (wrapped && (body.section || Object.keys(body).length === 1)) {
      body = body.data;
    }

    // Helper para extraer S3 key de URL firmada si es necesario
    const extractS3Key = (valor: string | undefined) => {
      if (!valor) return valor;
      
      // Si es una URL firmada de S3, extraer la key
      if (valor.includes('s3.amazonaws.com') || valor.includes('cloudfront.net')) {
        try {
          const urlObj = new URL(valor);
          const path = urlObj.pathname;
          // La key es el path sin el primer /
          return path.startsWith('/') ? path.substring(1) : path;
        } catch (e) {
          return valor;
        }
      }
      
      return valor;
    };

    // Filtrar claves internas (prefijo _) y el wrapper legacy 'data'
    const entradas = Object.entries(body).filter(
      ([clave, valor]) =>
        !clave.startsWith('_') &&
        clave !== 'data' &&
        valor !== undefined &&
        valor !== null
    );

    // Obtener valores actuales (para el historial de cambios) de las claves a guardar
    const clavesAGuardar = entradas.map(([clave]) => clave);
    const actuales = clavesAGuardar.length
      ? await prisma.configuracion.findMany({
          where: { tenantId, clave: { in: clavesAGuardar } },
          select: { clave: true, valor: true },
        })
      : [];
    const valorActual = new Map(actuales.map(a => [a.clave, a.valor]));

    // Guardar cada configuración en la DB aislada del tenant
    for (const [clave, valor] of entradas) {
      let valorFinal: string;

      if (clave === 'logo_corporativo') {
        valorFinal = extractS3Key(String(valor)) || String(valor);
      }
      else if (typeof valor === 'object' && valor !== null) {
        valorFinal = JSON.stringify(valor);
      }
      else {
        valorFinal = String(valor);
      }

      const antes = valorActual.get(clave);
      await prisma.configuracion.upsert({
        where: {
          tenantId_clave: {
            tenantId: tenantId,
            clave,
          }
        },
        update: { valor: valorFinal },
        create: {
          tenantId: tenantId,
          clave,
          valor: valorFinal
        },
      });

      // Registrar el cambio en el historial (solo si realmente cambió).
      // La auditoría NUNCA debe poder fallar el guardado: si el log falla,
      // se ignora silenciosamente (la config ya quedó persistida).
      if (antes !== valorFinal) {
        try {
          await AuditService.log({
            tenantId,
            userId: auth.user?.id,
            action: 'actualizar_configuracion',
            entity: 'configuracion',
            entityId: clave,
            description: `Configuración '${clave}' actualizada`,
            changesBefore: antes !== undefined ? { [clave]: valorParaHistorial(clave, tryParse(antes)) } : null,
            changesAfter: { [clave]: valorParaHistorial(clave, tryParse(valorFinal)) },
          });
        } catch {
          // No romper el guardado por un fallo de auditoría
        }
      }
    }

    // El logo corporativo / nombre comercial alimentan la marca efectiva
    // (documentos públicos, favicons, páginas de marca): invalidar la caché.
    clearBrandingCache();

    return NextResponse.json({ success: true, message: 'Configuración guardada' });
  } catch (error) {
    console.error('Error al guardar configuración:', error);
    return NextResponse.json(
      { error: 'Error al guardar configuración' },
      { status: 500 }
    );
  }
}, ['config:write', 'settings:write'])
