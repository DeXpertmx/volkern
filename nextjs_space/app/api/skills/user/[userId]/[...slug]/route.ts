export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { skills, listSkills, executeSkill } from '@/lib/skills';


/**
 * AGENT SKILLS GATEWAY
 * 
 * Este endpoint centraliza el acceso de IAs externas (Gemma/Gemini) 
 * a las capacidades operativas de Volkern.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string; slug: string[] } }
) {
  const { userId, slug } = params;
  const path = slug.join('/');
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host');
  const baseUrl = `${protocol}://${host}/api/skills/user/${userId}`;

  // 1. Manifest.json
  if (path === 'manifest.json') {
    return NextResponse.json({
      schema_version: "v1",
      name_for_human: "Volkern Agent Skill",
      name_for_model: "volkern_mcp_connector",
      description_for_human: "Gestiona leads, tareas y consultas de Volkern desde tu asistente local.",
      description_for_model: "Skill para interactuar con Volkern ERP/CRM. Soporta gestión completa de contactos, tareas, finanzas e inventario mediante funciones atómicas.",
      auth: {
        type: "service_http",
        authorization_type: "bearer",
        verification_tokens: {
          volkern: "agent-skill-verified"
        }
      },
      api: {
        type: "openapi",
        url: `${baseUrl}/openapi.yaml`
      },
      logo_url: `${protocol}://${host}/logo-skill.png`,
      contact_email: "soporte@volkern.com"
    });
  }

  // 2. ai-plugin.json
  if (path === 'ai-plugin.json') {
    return NextResponse.json({
      id: "volkern_agent",
      name: "Volkern CRM/ERP Connector",
      domain: host,
      namespace: "volkern",
      status: "active",
      capabilities: listSkills().map(s => s.name)
    });
  }

  // 3. openapi.yaml (Dinámico)
  if (path === 'openapi.yaml') {
    const spec = generateOpenApiSpec(userId, baseUrl);
    return new Response(spec, {
      headers: { 'Content-Type': 'text/yaml' }
    });
  }

  // 4. SKILL.md (Para Plugins de IA como Gemma/Pinokio)
  if (path === 'SKILL.md') {
    const skills = listSkills();
    const md = generateSkillMarkdown(userId, baseUrl, skills);
    return new Response(md, {
      headers: { 'Content-Type': 'text/markdown' }
    });
  }

  // 5. scripts/index.html - Servir archivo estático del skill
  if (path === 'scripts/index.html') {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public', 'skills', 'volkern-skill.html');
    const html = fs.readFileSync(filePath, 'utf8');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  return NextResponse.json({ error: 'Ruta de skill no encontrada' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string; slug: string[] } }
) {
  const { userId, slug } = params;
  const path = slug.join('/');

  if (path !== 'execute') {
    return NextResponse.json({ error: 'Solo se permite ejecutar via /execute' }, { status: 404 });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    return NextResponse.json({ status: 'ok', message: 'Execute endpoint working - auth passed' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Error: ' + error.message }, { status: 500 });
  }
}

/**
 * Generador dinámico de OpenAPI 3.0 para los skills disponibles
 */
function generateOpenApiSpec(userId: string, baseUrl: string) {
  const availableSkills = listSkills();
  
  let yaml = `openapi: 3.0.1
info:
  title: Volkern Agent Skills
  description: API Gateway para la ejecución de herramientas operativas de Volkern CRM/ERP.
  version: v1
servers:
  - url: ${baseUrl}
paths:
  /execute:
    post:
      operationId: executeTool
      summary: Ejecuta una herramienta específica de Volkern
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                tool:
                  type: string
                  enum: [${availableSkills.map(s => s.name).join(', ')}]
                arguments:
                  type: object
                  description: Argumentos específicos para la herramienta seleccionada
      responses:
        '200':
          description: Resultado de la ejecución
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
security:
  - bearerAuth: []
`;

  return yaml;
}

/**
 * Generador de SKILL.md para plugins de IA (AI Edge Gallery / Qwen / Gemma)
 */
function generateSkillMarkdown(userId: string, baseUrl: string, skills: any[]) {
  const skillList = skills.map(s => `- ${s.name}: ${s.description || 'Skill de Volkern CRM/ERP'}`).join('\n');

  return `---
name: volkern-crm
description: Gestiona leads, contactos, tareas, inventario y finanzas de Volkern CRM/ERP.
metadata:
  require-secret: true
  require-secret-description: "Tu API Key de Volkern (vk_live_xxx). Encuéntrala en tu perfil."
  homepage: ${baseUrl}
---

# Volkern CRM

## Instructions

Usa \`run_js\` con script "scripts/index.html" para ejecutar acciones.

**Formato JSON a pasar:**
\`\`\`json
{"action": "create_contact", "args": {"name": "Juan", "email": "juan@email.com"}}
\`\`\`

**Actions disponibles:**
${skillList}

El script hará la llamada API automáticamente a /execute y devolverá el resultado.
`;
}


