export const dynamic = 'force-dynamic';


import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { PLANS, PLAN_LIMITS, hasReachedLimit } from '@/lib/plans';
import { startOfMonth, endOfMonth } from 'date-fns';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    // Verificar límites de IA por plan
    const planSlug = (tenant.plan as any) || PLANS.STARTER;
    const planConfig = await getPlanConfig(planSlug);
    const limit = planConfig.limites.ai_image_generations ?? 5;

    if (limit !== -1) {
      // Contar generaciones del mes actual
      const now = new Date();
      const usageCount = await prisma.auditLog.count({
        where: {
          tenantId: user.tenantId,
          accion: 'imagen_generada_ia',
          fechaCreacion: {
            gte: startOfMonth(now),
            lte: endOfMonth(now),
          },
        },
      });

      if (usageCount >= limit) {
        return NextResponse.json(
          {
            error: 'Límite de generación de imágenes alcanzado',
            details: `Tu plan (${planConfig.nombre}) permite ${limit} generaciones por mes. Has usado ${usageCount}.`
          },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { prompt, aspectRatio = '1:1' } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'El prompt es requerido y debe ser un texto válido' },
        { status: 400 }
      );
    }

    // Validar aspect ratio
    const validAspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    if (!validAspectRatios.includes(aspectRatio)) {
      return NextResponse.json(
        { error: `Aspect ratio no válido. Opciones: ${validAspectRatios.join(', ')}` },
        { status: 400 }
      );
    }

    console.log(`[Generate Image] Generating image with prompt: "${prompt}" (${aspectRatio})`);

    // Generar la imagen usando la API de Abacus AI
    // IMPORTANTE: La imagen se generará a través del sistema de Abacus AI
    // que maneja las credenciales internamente
    try {
      const generateResponse = await fetch('https://i.ytimg.com/vi/9-j7sm85WUQ/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLBV6xVtPznXNMlkiwK1YV_zjzbjOw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          model: 'flux-1.1-pro',
        }),
      });

      if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        console.error('[Generate Image] API Error:', errorText);
        throw new Error(`Error de API: ${generateResponse.status}`);
      }

      const imageData = await generateResponse.json();

      if (!imageData.imageUrl) {
        throw new Error('No se recibió URL de imagen de la API');
      }

      // Log de auditoría
      await prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          accion: 'imagen_generada_ia',
          entidad: 'Message',
          entidadId: imageData.imageUrl || 'N/A',
          descripcion: `Imagen generada con IA: "${prompt.substring(0, 50)}..."`,
        },
      });

      console.log(`[Generate Image] Image generated successfully`);

      return NextResponse.json({
        success: true,
        imageUrl: imageData.imageUrl,
        prompt,
        aspectRatio,
        message: 'Imagen generada exitosamente',
      });

    } catch (apiError: any) {
      console.error('[Generate Image] Error calling API:', apiError);
      return NextResponse.json(
        {
          error: 'Error al generar la imagen con IA',
          details: apiError.message || 'Error desconocido al llamar a la API',
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error generating image:', error);
    return NextResponse.json(
      {
        error: 'Error al procesar la solicitud',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
