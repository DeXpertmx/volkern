export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { PLANS, PLAN_LIMITS } from '@/lib/plans';
import { startOfMonth, endOfMonth } from 'date-fns';

// Modelos de generación de imágenes disponibles en OpenRouter
const IMAGE_MODEL_PRIMARY = 'black-forest-labs/flux-1.1-pro';
const IMAGE_MODEL_FALLBACK = 'black-forest-labs/flux-schnell';

// Mapeo de aspect ratio a resolución aproximada para el prompt
const ASPECT_RATIO_HINTS: Record<string, string> = {
  '1:1': 'square format, 1024x1024',
  '16:9': 'widescreen landscape, 1792x1024',
  '9:16': 'vertical portrait, 1024x1792',
  '4:3': 'landscape, 1152x896',
  '3:4': 'portrait, 896x1152',
};

/**
 * Extrae la imagen de la respuesta de OpenRouter.
 * OpenRouter puede devolver:
 * - Un data URI (base64) en el contenido del mensaje
 * - Una URL en un campo dedicado
 */
function extractImageFromResponse(data: any): string | null {
  // Intento 1: Buscar data URI en el contenido del mensaje
  const content = data.choices?.[0]?.message?.content || '';
  const dataUriMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUriMatch) return dataUriMatch[0];

  // Intento 2: Buscar URL de imagen en el contenido
  const urlMatch = content.match(/https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?/i);
  if (urlMatch) return urlMatch[0];

  // Intento 3: Campos alternativos en la respuesta
  const imageUrl = data.choices?.[0]?.message?.image_url ||
    data.choices?.[0]?.message?.images?.[0]?.url ||
    data.image_url ||
    data.images?.[0]?.url;
  if (imageUrl) return imageUrl;

  // Intento 4: El contenido es un JSON con imageUrl
  try {
    const parsed = JSON.parse(content.replace(/```json\n?|```\n?/g, '').trim());
    if (parsed.imageUrl) return parsed.imageUrl;
    if (parsed.url) return parsed.url;
  } catch {
    // No es JSON
  }

  return null;
}

/**
 * Llama a OpenRouter para generar una imagen.
 * Usa el endpoint de chat completions con modalities: ["image"].
 */
async function generateImageViaOpenRouter(
  prompt: string,
  aspectRatio: string,
  apiKey: string
): Promise<string> {
  const resolution = ASPECT_RATIO_HINTS[aspectRatio] || ASPECT_RATIO_HINTS['1:1'];
  const enhancedPrompt = `${prompt} — ${resolution}`;

  const models = [IMAGE_MODEL_PRIMARY, IMAGE_MODEL_FALLBACK];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      console.log(`[Generate Image] Trying model: ${model}`);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://volkern.app',
          'X-Title': 'Volkern Image Generator',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: enhancedPrompt,
            },
          ],
          modalities: ['image'],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Generate Image] ${model} API Error (${response.status}):`, errorText);
        lastError = new Error(`${model}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const imageUrl = extractImageFromResponse(data);

      if (imageUrl) {
        console.log(`[Generate Image] Success with ${model}`);
        return imageUrl;
      }

      console.warn(`[Generate Image] ${model} returned no extractable image`);
      lastError = new Error(`${model}: no image data in response`);
    } catch (err: any) {
      console.error(`[Generate Image] ${model} exception:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('Todos los modelos de imagen fallaron');
}

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
    const planConfig = PLAN_LIMITS[planSlug as keyof typeof PLAN_LIMITS] || PLAN_LIMITS['trial'];
    const limit = (planConfig as any).ai_image_generations ?? 5;

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
            details: `Tu plan (${planSlug}) permite ${limit} generaciones por mes. Has usado ${usageCount}.`
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

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Servicio de generación de imágenes no configurado' },
        { status: 503 }
      );
    }

    console.log(`[Generate Image] Prompt: "${prompt}" (${aspectRatio})`);

    // Generar la imagen usando OpenRouter
    const imageUrl = await generateImageViaOpenRouter(prompt, aspectRatio, OPENROUTER_API_KEY);

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'imagen_generada_ia',
        entidad: 'Message',
        entidadId: imageUrl.substring(0, 200),
        descripcion: `Imagen generada con IA: "${prompt.substring(0, 50)}..."`,
      },
    });

    console.log(`[Generate Image] Success`);

    return NextResponse.json({
      success: true,
      imageUrl,
      prompt,
      aspectRatio,
      message: 'Imagen generada exitosamente',
    });

  } catch (error) {
    console.error('Error generating image:', error);
    return NextResponse.json(
      {
        error: 'Error al generar la imagen con IA',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
