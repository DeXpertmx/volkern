export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getDownloadUrl } from '@/lib/s3';

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
      // Intentar parsear JSON para campos que lo requieren
      if (item.clave === 'horariosAtencion') {
        try {
          acc[item.clave] = JSON.parse(item.valor);
        } catch {
          acc[item.clave] = item.valor;
        }
      } else {
        acc[item.clave] = item.valor;
      }
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
    const data = await request.json();

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

    // Guardar cada configuración en la DB aislada del tenant
    for (const [clave, valor] of Object.entries(data)) {
      if (valor !== undefined && valor !== null) {
        let valorFinal: string;
        
        if (clave === 'logo_corporativo') {
          valorFinal = extractS3Key(String(valor)) || String(valor);
        } 
        else if (clave === 'horariosAtencion' && typeof valor === 'object') {
          valorFinal = JSON.stringify(valor);
        } 
        else {
          valorFinal = String(valor);
        }
        
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
      }
    }

    return NextResponse.json({ success: true, message: 'Configuración guardada' });
  } catch (error) {
    console.error('Error al guardar configuración:', error);
    return NextResponse.json(
      { error: 'Error al guardar configuración' },
      { status: 500 }
    );
  }
}, ['config:write', 'settings:write'])
