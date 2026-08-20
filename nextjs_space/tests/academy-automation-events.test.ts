import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  triggerAutomation: vi.fn(),
}))

vi.mock('@/lib/automation-engine', () => ({
  triggerAutomation: (...args: unknown[]) => mocks.triggerAutomation(...args),
}))

import {
  emitEstudianteInscrito,
  emitLeccionCompletada,
  emitCursoCompletado,
} from '@/lib/academy/automation-events'

const ctx = {
  tenantId: 'tenant-1',
  inscripcionId: 'insc-1',
  estudianteId: 'est-1',
  cursoId: 'curso-1',
  leccionId: 'lec-1',
  estudiante: { id: 'est-1', nombre: 'Ana' },
  curso: { id: 'curso-1', titulo: 'Marketing' },
}

describe('Emisores de triggers de Academia (automation-events)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('estudiante_inscrito se dispara con tenantId + ids + objetos', async () => {
    const ok = await emitEstudianteInscrito(ctx)

    expect(ok).toBe(true)
    expect(mocks.triggerAutomation).toHaveBeenCalledTimes(1)
    expect(mocks.triggerAutomation).toHaveBeenCalledWith('estudiante_inscrito', {
      tenantId: 'tenant-1',
      inscripcionId: 'insc-1',
      estudianteId: 'est-1',
      cursoId: 'curso-1',
      estudiante: ctx.estudiante,
      curso: ctx.curso,
      inscripcion: undefined,
      source: 'academy',
    })
  })

  it('leccion_completada se dispara con leccionId en el contexto', async () => {
    const ok = await emitLeccionCompletada(ctx)

    expect(ok).toBe(true)
    expect(mocks.triggerAutomation).toHaveBeenCalledWith('leccion_completada', expect.objectContaining({
      tenantId: 'tenant-1',
      leccionId: 'lec-1',
      cursoId: 'curso-1',
      source: 'academy',
    }))
  })

  it('estudiante_completa_curso se dispara con inscripcionId', async () => {
    const ok = await emitCursoCompletado(ctx)

    expect(ok).toBe(true)
    expect(mocks.triggerAutomation).toHaveBeenCalledWith('estudiante_completa_curso', expect.objectContaining({
      tenantId: 'tenant-1',
      inscripcionId: 'insc-1',
      cursoId: 'curso-1',
      source: 'academy',
    }))
  })

  it('no dispara si no hay tenantId (curso sin tenant — no molesta a nadie)', async () => {
    const ok = await emitEstudianteInscrito({ ...ctx, tenantId: null })

    expect(ok).toBe(false)
    expect(mocks.triggerAutomation).not.toHaveBeenCalled()
  })
})
