import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { deshacerLote } from '@/lib/import/deshacer'

/**
 * Deshace el último lote de importación.
 *
 * Solo el último y solo una vez: el servidor decide, no la interfaz. Un lote
 * con imports posteriores se rechaza con 409 y el motivo, porque borrarlo
 * dejaría datos huérfanos.
 */
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const logId = cuerpo?.logId

    if (typeof logId !== 'string' || !logId.trim()) {
      return NextResponse.json({ error: 'logId requerido' }, { status: 400 })
    }

    const resultado = await deshacerLote(auth.tenant!.id, logId.trim(), auth.user?.id)
    if (!resultado.ok) {
      const status = resultado.motivo === 'no_encontrado' ? 404 : 409
      return NextResponse.json({ error: resultado.detalle, motivo: resultado.motivo }, { status })
    }

    return NextResponse.json(resultado)
  } catch (error) {
    console.error('[Import undo] Error:', error)
    return NextResponse.json({ error: 'No se pudo deshacer la importación' }, { status: 500 })
  }
}, ['import:write'])
