import { describe, expect, it } from 'vitest'
import { AGENT_SKILLS, AGENT_SKILLS_SCHEMA, skillDigest } from '@/lib/seo/agent-skills'

function withoutEnv(cb: () => Promise<void>) {
  const prev = process.env.NEXTAUTH_URL
  delete process.env.NEXTAUTH_URL
  return cb().finally(() => {
    if (prev === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = prev
  })
}

describe('/.well-known/agent-skills/index.json (Discovery v0.2.0)', () => {
  it('sirve el índice con $schema correcto y skills array', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/agent-skills/index.json/route')
      const res = await GET(new Request('https://volkern.app/.well-known/agent-skills/index.json'))
      expect(res.status).toBe(200)
      expect((res.headers.get('content-type') || '')).toContain('application/json')
      const body = await res.json()
      expect(body.$schema).toBe(AGENT_SKILLS_SCHEMA)
      expect(Array.isArray(body.skills)).toBe(true)
      expect(body.skills.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('cada skill tiene name, type, description, url y digest', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/agent-skills/index.json/route')
      const body = await (await GET(new Request('https://volkern.app/.well-known/agent-skills/index.json'))).json()
      for (const s of body.skills) {
        expect(typeof s.name).toBe('string')
        // lowercase alphanumeric + hyphens, sin guiones al inicio/fin/consecutivos
        expect(s.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        expect(s.type).toBe('skill-md')
        expect(typeof s.description).toBe('string')
        expect(s.description.length).toBeGreaterThan(0)
        expect(s.url).toContain('https://volkern.app/.well-known/agent-skills/')
        expect(s.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
      }
    })
  })

  it('el digest coincide con el contenido real del SKILL.md', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/agent-skills/index.json/route')
      const body = await (await GET(new Request('https://volkern.app/.well-known/agent-skills/index.json'))).json()
      for (const s of body.skills) {
        const skill = AGENT_SKILLS.find(a => a.name === s.name)
        expect(skill).toBeTruthy()
        expect(s.digest).toBe(skillDigest(skill!.skillMd))
      }
    })
  })

  it('cada SKILL.md se sirve con el mismo contenido del digest', async () => {
    await withoutEnv(async () => {
      const mod = await import('@/app/.well-known/agent-skills/[skill]/SKILL.md/route')
      for (const skill of AGENT_SKILLS) {
        const res = await mod.GET(new Request(`https://volkern.app/.well-known/agent-skills/${skill.name}/SKILL.md`), {
          params: { skill: skill.name },
        })
        expect(res.status).toBe(200)
        expect((res.headers.get('content-type') || '')).toContain('text/markdown')
        const text = await res.text()
        expect(text).toBe(skill.skillMd)
        expect(skillDigest(text)).toBe(skillDigest(skill.skillMd))
        // El SKILL.md incluye frontmatter con name y description
        expect(text.startsWith('---\n')).toBe(true)
        expect(text).toContain(`name: ${skill.name}`)
      }
    })
  })

  it('volkern-hospitality: publicado y expone las 5 herramientas del PMS en su SKILL.md', async () => {
    const skill = AGENT_SKILLS.find(a => a.name === 'volkern-hospitality')
    expect(skill, 'volkern-hospitality debe estar en el índice de discovery').toBeTruthy()
    for (const nombre of ['estado_del_dia', 'llegadas_salidas_hoy', 'buscar_reservas', 'rentabilidad_reserva', 'estado_booking_engine']) {
      expect(skill!.skillMd).toContain(nombre)
    }
  })

  it('devuelve 404 para skills inexistentes', async () => {
    await withoutEnv(async () => {
      const mod = await import('@/app/.well-known/agent-skills/[skill]/SKILL.md/route')
      const res = await mod.GET(new Request('https://volkern.app/.well-known/agent-skills/no-existe/SKILL.md'), {
        params: { skill: 'no-existe' },
      })
      expect(res.status).toBe(404)
    })
  })
})
