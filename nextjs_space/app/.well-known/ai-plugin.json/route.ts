export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url';

/**
 * /.well-known/ai-plugin.json
 * 
 * Estándar de descubrimiento para IAs externas (Gemma, Gemini, ChatGPT, etc.)
 * Permite que la IA auto-descubra las capacidades del agente al visitar la URL raíz.
 */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req);

  return NextResponse.json({
    schema_version: "v1",
    name_for_human: "Volkern CRM/ERP",
    name_for_model: "volkern_mcp_connector",
    description_for_human: "Gestiona leads, tareas, inventario y finanzas de Volkern desde tu asistente de IA.",
    description_for_model: "Skill para interactuar con Volkern ERP/CRM. Soporta gestión completa de contactos, tareas, finanzas e inventario mediante funciones atómicas. Para ejecutar herramientas, usa el endpoint /api/skills/user/{userId}/execute con un Bearer token.",
    auth: {
      type: "service_http",
      authorization_type: "bearer",
      verification_tokens: {
        volkern: "agent-skill-verified"
      }
    },
    api: {
      type: "openapi",
      url: `${baseUrl}/api/skills/user/{userId}/openapi.yaml`,
      has_user_authentication: false
    },
    logo_url: `${baseUrl}/volkern-icon.png`,
    contact_email: "soporte@volkern.com",
    legal_info_url: `${baseUrl}/terms`
  });
}
