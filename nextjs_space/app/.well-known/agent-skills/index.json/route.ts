export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'
import { AGENT_SKILLS, AGENT_SKILLS_SCHEMA, skillDigest } from '@/lib/seo/agent-skills'

/**
 * /.well-known/agent-skills/index.json — Agent Skills Discovery v0.2.0.
 *
 * Índice de los skills publicados por Volkern. Cada entrada apunta al
 * SKILL.md servido en /.well-known/agent-skills/{name}/SKILL.md y su digest
 * SHA-256 (calculado del mismo contenido que se sirve, por lo que siempre
 * coinciden).
 */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)

  const index = {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: AGENT_SKILLS.map(s => ({
      name: s.name,
      type: s.type,
      description: s.description,
      url: `${baseUrl}/.well-known/agent-skills/${s.name}/SKILL.md`,
      digest: skillDigest(s.skillMd),
    })),
  }

  return NextResponse.json(index, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
