export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Crea un nuevo diseño en Canva usando la API REST
 * POST /api/canva/create-design
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const metadata = user.metadata as any;
    const canvaAuth = metadata?.canvaAuth;

    console.log('Estado de autenticación Canva:', {
      tieneMetadata: !!metadata,
      tieneCanvaAuth: !!canvaAuth,
      tieneAccessToken: !!(canvaAuth?.accessToken),
      tokenLength: canvaAuth?.accessToken?.length,
    });

    if (!canvaAuth || !canvaAuth.accessToken) {
      return NextResponse.json(
        { error: 'No hay token de Canva. Debes conectar tu cuenta primero.' },
        { status: 401 }
      );
    }

    const { designType = 'SocialMedia', width, height, title } = await req.json();

    // Crear diseño usando la API de Canva
    // Según la documentación de Canva Connect API, debemos usar asset_id en lugar de dimensiones personalizadas
    // Para diseños en blanco, no enviamos asset_id
    const createDesignPayload: any = {
      asset_type: 'design',
      title: title || 'Nuevo diseño de Volkern CRM',
    };

    console.log('📤 Enviando solicitud a Canva API:', {
      payload: createDesignPayload,
      apiUrl: 'https://api.canva.com/rest/v1/designs',
      hasToken: !!canvaAuth.accessToken,
    });

    const canvaResponse = await fetch('https://api.canva.com/rest/v1/designs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${canvaAuth.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createDesignPayload),
    });

    console.log('📥 Respuesta de Canva API:', {
      status: canvaResponse.status,
      statusText: canvaResponse.statusText,
      headers: Object.fromEntries(canvaResponse.headers.entries()),
    });

    if (!canvaResponse.ok) {
      let errorDetails;
      try {
        errorDetails = await canvaResponse.json();
      } catch {
        errorDetails = await canvaResponse.text();
      }
      
      console.error('❌ Error detallado de Canva API:', {
        status: canvaResponse.status,
        error: errorDetails,
      });
      
      // Detectar errores de autenticación o permisos
      if (canvaResponse.status === 401 || canvaResponse.status === 403) {
        // Limpiar el token del usuario automáticamente
        await prisma.user.update({
          where: { id: user.id },
          data: {
            metadata: {
              ...(metadata || {}),
              canvaAuth: null,
            },
          },
        });

        return NextResponse.json(
          { 
            error: 'Permisos insuficientes o token expirado',
            details: errorDetails,
            needsReconnect: true,
            message: 'Tu conexión con Canva necesita ser renovada para obtener los permisos correctos. Por favor, desconecta y vuelve a conectar tu cuenta.',
          },
          { status: 401 }
        );
      }

      // Error 400 puede indicar problemas con scopes
      if (canvaResponse.status === 400) {
        const errorMessage = typeof errorDetails === 'object' 
          ? (errorDetails.error || errorDetails.message || JSON.stringify(errorDetails))
          : errorDetails;

        // Verificar si es un error de scopes
        if (errorMessage.toLowerCase().includes('scope') || 
            errorMessage.toLowerCase().includes('permission')) {
          
          // Limpiar el token automáticamente
          await prisma.user.update({
            where: { id: user.id },
            data: {
              metadata: {
                ...(metadata || {}),
                canvaAuth: null,
              },
            },
          });

          return NextResponse.json(
            { 
              error: 'Permisos insuficientes para crear diseños',
              details: errorDetails,
              needsReconnect: true,
              message: 'Tu cuenta de Canva no tiene los permisos necesarios. Esto puede ocurrir si conectaste tu cuenta antes de nuestra última actualización. Por favor, reconecta tu cuenta para obtener los permisos correctos.',
            },
            { status: 400 }
          );
        }
      }

      return NextResponse.json(
        { 
          error: 'Error al crear diseño en Canva', 
          details: errorDetails,
          status: canvaResponse.status,
        },
        { status: canvaResponse.status }
      );
    }

    const designData = await canvaResponse.json();
    
    console.log('✅ Diseño creado exitosamente:', {
      id: designData.design?.id,
      tieneUrls: !!designData.design?.urls,
      editUrl: designData.design?.urls?.edit_url,
    });

    // Extraer la URL de edición de la respuesta
    const editUrl = designData.design?.urls?.edit_url;
    const designId = designData.design?.id;

    if (!designId) {
      console.error('❌ No se recibió ID de diseño:', designData);
      return NextResponse.json(
        { error: 'No se recibió ID de diseño de Canva', details: designData },
        { status: 500 }
      );
    }

    if (!editUrl) {
      console.warn('⚠️ No se recibió URL de edición, usando URL por defecto');
    }

    // Generar URL de edición (fallback si no viene en la respuesta)
    const finalEditUrl = editUrl || `https://www.canva.com/design/${designId}/edit`;

    return NextResponse.json({
      success: true,
      design: {
        id: designId,
        editUrl: finalEditUrl,
        rawResponse: designData,
      },
    });

  } catch (error: any) {
    console.error('❌ Error crítico al crear diseño en Canva:', {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
