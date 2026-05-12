export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { listSkills } from '@/lib/skills';

/**
 * AGENT SKILLS DISCOVERY ENDPOINT
 * 
 * Cuando Gemma/Gemini accede a la URL base del usuario,
 * devuelve el documento de descubrimiento con las URLs de los manifests.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { userId } = params;
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host');
  const baseUrl = `${protocol}://${host}/api/skills/user/${userId}`;

  const availableSkills = listSkills();

  return NextResponse.json({
    status: "active",
    name: "Volkern Agent Skills Gateway",
    version: "1.0.0",
    userId,
    endpoints: {
      manifest: `${baseUrl}/manifest.json`,
      ai_plugin: `${baseUrl}/ai-plugin.json`,
      openapi: `${baseUrl}/openapi.yaml`,
      execute: `${baseUrl}/execute`
    },
    available_skills: availableSkills.map(s => s.name),
    total_skills: availableSkills.length,
    auth: {
      type: "bearer",
      description: "Incluye tu API Key de Volkern en el header Authorization: Bearer vk_live_xxx"
    }
  });
}
