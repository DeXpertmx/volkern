export const dynamic = 'force-dynamic';

/**
 * API Endpoint para Skills
 * 
 * Arquitectura:
 * POST /api/skills - Ejecutar un skill
 * GET /api/skills - Listar skills disponibles
 * 
 * Uso:
 * POST /api/skills
 * {
 *   "skill": "create_contact",
 *   "payload": { ... }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { skills, executeSkill, listSkills, SkillName } from '@/lib/skills';
import { authenticateRequest } from '@/lib/api-key-auth';

// GET - Listar skills disponibles
export async function GET() {
  try {
    // Autenticación dual: sesión o API Key
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const availableSkills = listSkills();

    return NextResponse.json({
      skills: availableSkills,
      total: availableSkills.length,
      version: '1.0.0',
      docs: 'https://docs.volkern.com/skills',
    });
  } catch (error) {
    console.error('[Skills API] Error listing skills:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// POST - Ejecutar un skill
export async function POST(request: NextRequest) {
  try {
    // Autenticación dual: sesión o API Key
    const auth = await authenticateRequest(request, ['skills:execute', 'skills:write']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { skill, payload } = body;

    // Validar skill name
    if (!skill) {
      return NextResponse.json(
        { error: 'skill es requerido' },
        { status: 400 }
      );
    }

    // Verificar que el skill existe
    if (!(skill in skills)) {
      return NextResponse.json(
        {
          error: `Skill "${skill}" no encontrado`,
          availableSkills: Object.keys(skills),
        },
        { status: 400 }
      );
    }

    // Enriquecer payload con tenantId y metadata
    const enrichedPayload = {
      ...payload,
      tenantId: auth.tenant.id,
      userId: auth.user?.id,
      source: auth.authMethod === 'apikey' ? 'api' : 'app',
    };

    console.log(`[Skills API] Executing skill: ${skill}`, {
      tenantId: auth.tenant.id,
      userId: auth.user?.id,
    });

    // Ejecutar skill
    const result = await executeSkill(skill as SkillName, enrichedPayload);

    return NextResponse.json({
      success: true,
      skill,
      result,
    });
  } catch (error) {
    console.error('[Skills API] Error executing skill:', error);
    
    // Errores de validación
    if (error instanceof Error) {
      if (error.message.includes('es requerido') || error.message.includes('no encontrado') || error.message.includes('ya existe')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Error ejecutando skill' },
      { status: 500 }
    );
  }
}
