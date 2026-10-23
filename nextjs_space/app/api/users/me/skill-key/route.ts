export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { globalPrisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-keys';
import { crmAllows, getCrmEntitlements, upgradeMessage } from '@/lib/crm-entitlements';

/**
 * Genera una nueva API Key específica para Agent Skills.
 *
 * La llave abre las DOS puertas que anuncia el panel de Perfil:
 *   - `agent:skill` → POST /api/skills/user/{userId}/execute (gateway de skills)
 *   - `mcp:execute` / `mcp:read` → POST e GET de /mcp y /api/mcp
 *
 * Sin los scopes MCP la llave se emitía correctamente pero el cliente MCP
 * recibía 401 al llamar a tools/call: el panel prometía protocolo MCP y la
 * credencial no lo permitía. Se conceden juntos porque son la misma conexión.
 */
const SKILL_KEY_SCOPES = ['agent:skill', 'mcp:execute', 'mcp:read'] as const
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Buscar al usuario actual
    const user = await globalPrisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true, name: true }
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario o tenant no encontrado' }, { status: 404 });
    }

    const ent = await getCrmEntitlements(user.tenantId);
    if (!crmAllows(ent, 'api')) {
      return NextResponse.json({ error: upgradeMessage('api', ent) }, { status: 403 });
    }

    // 1. Desactivar llaves previas de Agent Skills para este usuario (opcional, política de una sola llave)
    await globalPrisma.apiKey.updateMany({
      where: {
        userId: user.id,
        scopes: { has: 'agent:skill' },
        activo: true
      },
      data: { activo: false }
    });

    // 2. Generar nueva llave vk_live_
    const { key, keyHash, prefix } = generateApiKey('live');

    // 3. Guardar en la base de datos global
    const dbKey = await globalPrisma.apiKey.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        nombre: `IA Agent Skill (${user.name || 'Personal'})`,
        descripcion: 'Llave generada automáticamente para conexión de agentes IA (Gemma/Gemini) y servidor MCP.',
        keyHash,
        prefix,
        scopes: [...SKILL_KEY_SCOPES],
        activo: true
      }
    });

    // 4. Devolver la llave original (SOLO SE MUESTRA UNA VEZ)
    return NextResponse.json({
      id: dbKey.id,
      key: key, // La key en texto plano vk_live_...
      scopes: dbKey.scopes,
      createdAt: dbKey.createdAt
    });

  } catch (error: any) {
    console.error('[SkillKeyAPI] Error:', error);
    return NextResponse.json({ error: 'Error al generar la llave de conexión' }, { status: 500 });
  }
}
