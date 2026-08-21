export const dynamic = 'force-dynamic'
import { AGENT_SKILLS } from '@/lib/seo/agent-skills'

/**
 * /.well-known/agent-skills/{name}/SKILL.md — artefacto de cada skill.
 * El contenido es exactamente el mismo string del que se calcula el digest
 * en el índice, para que la verificación SHA-256 siempre pase.
 */
export async function GET(
  _req: Request,
  { params }: { params: { skill: string } }
) {
  const skill = AGENT_SKILLS.find(s => s.name === params.skill)
  if (!skill) {
    return new Response(JSON.stringify({ error: 'Skill no encontrado' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(skill.skillMd, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
