export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { uploadPublicFile } from '@/lib/s3'
import { getPlanConfig } from '@/lib/plans'
import { withTenantAuth } from '@/lib/api-key-auth'

/**
 * GET - Obtener configuración de whitelabel
 * Refactorizado para usar withTenantAuth y soportar suplantación.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // 1. Obtener configuración global como base
    let globalConfig = await prisma.whitelabelConfig.findFirst({
      orderBy: { fechaCreacion: 'desc' }
    })

    if (!globalConfig) {
      globalConfig = await prisma.whitelabelConfig.create({
        data: {
          nombreEmpresa: 'Volkern CRM',
          logoUrl: '/volkern-logo.png',
          iconoUrl: '/volkern-icon.png',
          colorPrimario: '#3b82f6',
          colorSecundario: '#8b5cf6',
          colorAcento: '#10b981',
          emailRemitente: 'contacto@volkern.com',
          nombreRemitente: 'Volkern CRM',
          eslogan: 'Tu CRM todo en uno',
          descripcion: 'Plataforma de CRM y automatización para emprendedores digitales',
        }
      })
    }

    // 2. Verificar si el tenant tiene Marca Blanca activa
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { 
        tenantFeatures: {
          where: { feature: 'white_label' }
        }
      }
    });

    const planConfig = await getPlanConfig(tenant?.plan || 'starter');
    const isWhiteLabelActive = tenant?.tenantFeatures?.[0]?.habilitado || planConfig.branding?.whitelabel;

    let config = globalConfig;

    // 3. Si tiene Marca Blanca, intentar obtener su configuración personalizada
    if (isWhiteLabelActive && tenant?.tenantFeatures?.[0]?.configuracion) {
      const customConfig = tenant.tenantFeatures[0].configuracion as any;
      config = {
        ...globalConfig,
        ...customConfig,
        id: `tenant-${tenantId}`,
      } as any;
    } else {
      // Si no tiene marca blanca, al menos forzar el nombre del tenant como nombre de empresa
      // para que el DashboardHeader muestre el nombre correcto durante la suplantación
      config = {
        ...globalConfig,
        nombreEmpresa: tenant?.nombre || globalConfig.nombreEmpresa,
        id: `tenant-${tenantId}`,
      } as any;
    }

    // Convertir S3 keys a URLs públicas
    const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
    const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || ''
    
    const isS3Key = (url: string | null) => {
      return url && !url.startsWith('http') && !url.startsWith('/');
    }

    const getPublicUrl = (s3Key: string) => {
      return `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`
    }

    const configResponse = {
      ...config,
      logoUrl: config.logoUrl && isS3Key(config.logoUrl) 
        ? getPublicUrl(config.logoUrl)
        : config.logoUrl,
      iconoUrl: config.iconoUrl && isS3Key(config.iconoUrl)
        ? getPublicUrl(config.iconoUrl)
        : config.iconoUrl,
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
