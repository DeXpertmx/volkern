export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { uploadPublicFile } from '@/lib/s3'
import { getPlanConfig } from '@/lib/plans'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getEffectiveBranding } from '@/lib/branding'

/**
 * GET - Obtener configuración de whitelabel
 * Refactorizado para usar withTenantAuth y soportar suplantación.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // 1. Obtener la configuración efectiva basada en la jerarquía (Slot > Agencia > Global)
    const effectiveBranding = await getEffectiveBranding(tenantId);

    // 2. Obtener la configuración global para campos extras (emails, redes sociales)
    let globalConfig = await prisma.whitelabelConfig.findFirst({
      orderBy: { fechaCreacion: 'desc' }
    });

    if (!globalConfig) {
      // Fallback si no existe (raro en producción)
      globalConfig = {
        nombreEmpresa: 'Volkern CRM',
        logoUrl: '/volkern-logo.png',
        iconoUrl: '/volkern-icon.png',
        colorPrimario: '#3b82f6',
        colorSecundario: '#8b5cf6',
        colorAcento: '#10b981',
      } as any;
    }

    // 3. Mezclar configuraciones
    const response = {
      ...globalConfig,
      id: `branding-${tenantId}`,
      nombreEmpresa: effectiveBranding.companyName || globalConfig?.nombreEmpresa,
      logoUrl: effectiveBranding.logoUrl,
      iconoUrl: effectiveBranding.logoUrl, // Usamos logo como icono si no hay específico
      colorPrimario: effectiveBranding.primaryColor,
      showPoweredBy: effectiveBranding.showPoweredBy
    };

    // Convertir S3 keys a URLs públicas
    const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
    const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || ''
    
    const isS3Key = (url: string | null) => {
      return url && !url.startsWith('http') && !url.startsWith('/');
    }

    const getPublicUrl = (s3Key: string) => {
      const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
      if (cdnUrl) {
        const base = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl;
        return `${base}/${s3Key}`;
      }
      
      const endpoint = process.env.AWS_ENDPOINT_URL || '';
      if (endpoint.includes('r2.cloudflarestorage.com')) {
         return `https://CONFIGURA_TU_CDN_EN_VERCEL_PARA_R2.com/${s3Key}`;
      }

      return `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`
    }

    const configResponse = {
      ...response,
      logoUrl: response.logoUrl && isS3Key(response.logoUrl) 
        ? getPublicUrl(response.logoUrl)
        : response.logoUrl,
      iconoUrl: response.iconoUrl && isS3Key(response.iconoUrl)
        ? getPublicUrl(response.iconoUrl)
        : response.iconoUrl,
    }

    return NextResponse.json(configResponse)
  } catch (error) {
    console.error('Error al obtener configuración de whitelabel:', error)
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    )
  }
});

/**
 * PUT - Actualizar configuración de whitelabel
 */
export const PUT = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json()
    const {
      nombreEmpresa,
      logoUrl,
      iconoUrl,
      colorPrimario,
      colorSecundario,
      colorAcento,
      emailRemitente,
      nombreRemitente,
      eslogan,
      descripcion,
      dominio,
    } = body

    const tenantId = auth.tenant!.id;
    const userRole = (auth.user as any)?.role?.nombre;

    // Solo admin de tenant o Superadmin pueden actualizar whitelabel
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { 
        tenantFeatures: {
          where: { feature: 'white_label' }
        }
      }
    });

    const planConfig = await getPlanConfig(tenant?.plan || 'starter');
    const canCustomBranding = tenant?.tenantFeatures?.[0]?.habilitado || planConfig.branding?.whitelabel;

    if (!canCustomBranding && userRole !== 'Superadmin') {
      return NextResponse.json({ error: 'Módulo de Marca Blanca no activo para este plan' }, { status: 403 });
    }

    // Si es Superadmin y está editando la configuración GLOBAL
    if (userRole === 'Superadmin' && body.isGlobalUpdate) {
      const currentConfig = await prisma.whitelabelConfig.findFirst({
        orderBy: { fechaCreacion: 'desc' }
      });

      const data = {
        nombreEmpresa,
        logoUrl,
        iconoUrl,
        colorPrimario,
        colorSecundario,
        colorAcento,
        emailRemitente,
        nombreRemitente,
        eslogan,
        descripcion,
        dominio,
      };

      if (!currentConfig) {
        const newGlobal = await prisma.whitelabelConfig.create({ data });
        return NextResponse.json(newGlobal);
      }

      const updatedGlobal = await prisma.whitelabelConfig.update({
        where: { id: currentConfig.id },
        data
      });
      return NextResponse.json(updatedGlobal);
    }

    // Actualizar configuración del TENANT
    const customConfig = {
      nombreEmpresa,
      logoUrl,
      iconoUrl,
      colorPrimario,
      colorSecundario,
      colorAcento,
      emailRemitente,
      nombreRemitente,
      eslogan,
      descripcion,
      dominio,
      updatedAt: new Date()
    };

    await prisma.tenantFeature.upsert({
      where: {
        tenantId_feature: {
          tenantId,
          feature: 'white_label'
        }
      },
      update: {
        configuracion: customConfig as any,
        habilitado: true
      },
      create: {
        tenantId,
        feature: 'white_label',
        habilitado: true,
        configuracion: customConfig as any,
        razon: 'Personalización de marca blanca'
      }
    });

    return NextResponse.json({ success: true, config: customConfig });
    
  } catch (error) {
    console.error('Error al actualizar configuración de whitelabel:', error)
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    )
  }
});

/**
 * POST - Subir logo/icono (Sigue siendo estándar ya que solo requiere estar autenticado)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const tipo = formData.get('tipo') as string

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = `whitelabel/${tipo}-${Date.now()}-${file.name}`

    const { key, publicUrl } = await uploadPublicFile(buffer, fileName, file.type)

    return NextResponse.json({ 
      url: key,
      publicUrl,
      downloadUrl: publicUrl,
      tipo 
    })
  } catch (error) {
    console.error('Error al subir archivo:', error)
    return NextResponse.json({ error: 'Error al subir archivo' }, { status: 500 })
  }
}
