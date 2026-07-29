'use client'

import { useEffect, useState } from 'react'
import { Megaphone, Plus, AlertCircle, Calendar, Send, RefreshCw } from 'lucide-react'

type Estado = 'BORRADOR' | 'PROGRAMADA' | 'PUBLICADA' | 'ERROR' | 'PAUSADA'
type Plataforma = 'META' | 'GOOGLE'

interface PublicacionAds {
  id: string
  nombre: string
  plataforma: Plataforma
  estado: Estado
  copy: string | null
  isBoost: boolean
  scheduledFor: string | null
  publishedAt: string | null
  externalAdId: string | null
  errorMessage: string | null
  creative: {
    mediaUrl: string
    mediaType: string
    headline: string | null
  } | null
  socialPost: {
    id: string
    content: string
    publishedAt: string | null
  } | null
  metrics: { impressions: number; clicks: number; spend: number } | null
  createdAt: string
}

const STATE_COLOR: Record<Estado, string> = {
  BORRADOR: '#9ca3af',
  PROGRAMADA: '#3b82f6',
  PUBLICADA: '#10b981',
  ERROR: '#ef4444',
  PAUSADA: '#f59e0b',
}

export function PublicacionesAdsDashboard() {
  const [items, setItems] = useState<PublicacionAds[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [platforms, setPlatforms] = useState<Array<{ id: string; platform: string; accountName: string | null }>>([])

  async function loadList() {
    try {
      const r = await fetch('/api/ads/publicaciones', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const body = await r.json()
      setItems(Array.isArray(body.data) ? (body.data as PublicacionAds[]) : [])
      setTotal(typeof body.meta?.total === 'number' ? body.meta.total : (body.data?.length ?? 0))
      setLoading(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    }
  }

  async function loadPlatforms() {
    try {
      const r = await fetch('/api/ads/platforms', { cache: 'no-store' })
      if (!r.ok) return
      const body = await r.json()
      // acepta {data} o array puro
      const list = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : []
      setPlatforms(list.filter((p: any) => p.status === 'CONNECTED'))
    } catch {
      setPlatforms([])
    }
  }

  useEffect(() => {
    loadList()
    loadPlatforms()
  }, [])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const firstConnected = platforms[0]
      if (!firstConnected) {
        throw new Error('Necesitas conectar al menos una plataforma de anuncios (META o GOOGLE) para crear una publicación.')
      }
      const res = await fetch('/api/ads/publicaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Nueva publicación ADS',
          plataforma: firstConnected.platform,
          platformId: firstConnected.id,
          isBoost: false,
        }),
      })
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}))
        throw new Error(errorBody.error || `HTTP ${res.status}`)
      }
      await loadList()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  async function handlePublish(id: string) {
    setError(null)
    try {
      const r = await fetch(`/api/ads/publicaciones/${id}/publish`, { method: 'POST' })
      if (!r.ok) {
        const errorBody = await r.json().catch(() => ({}))
        throw new Error(errorBody.error || `HTTP ${r.status}`)
      }
      await loadList()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <Megaphone size={18} /> Cargando publicaciones ADS…
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
            Publicaciones ADS
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            {total} publicación{total === 1 ? '' : 'es'} · plataformas conectadas:{' '}
            {platforms.length === 0 ? (
              <span style={{ color: '#dc2626' }}>ninguna — conecta Meta o Google en ADS Intelligence</span>
            ) : (
              platforms.map((p) => `${p.platform} (${p.accountName ?? p.id.slice(0, 8)})`).join(', ')
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => loadList()}
            style={{
              padding: '8px 12px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} /> Recargar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || platforms.length === 0}
            style={{
              padding: '8px 14px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              opacity: creating ? 0.6 : 1,
              cursor: creating || platforms.length === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Plus size={14} /> {creating ? 'Creando…' : 'Crear publicación ADS'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            color: '#dc2626',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {items.length === 0 ? (
        <div
          style={{
            padding: '64px 32px',
            textAlign: 'center',
            color: '#6b7280',
            background: '#f9fafb',
            borderRadius: 12,
            border: '1px dashed #d1d5db',
          }}
        >
          <Megaphone size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.5 }} />
          <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Aún no hay Publicaciones ADS
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              maxWidth: 520,
              margin: '0 auto 24px',
            }}
          >
            Crea, programa y publica anuncios individuales en Meta (Facebook, Instagram) y Google Ads.
            Cada publicación incluye creatividad, copy y calendario de difusión independiente de la campaña.
            También puedes boostar un SocialPost orgánico como ad pagado.
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || platforms.length === 0}
            style={{
              padding: '10px 16px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              opacity: creating || platforms.length === 0 ? 0.6 : 1,
              cursor: creating || platforms.length === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={16} /> {creating ? 'Creando…' : 'Crear primera Publicación ADS'}
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>Nombre</th>
                <th style={{ padding: 10 }}>Plataforma</th>
                <th style={{ padding: 10 }}>Modo</th>
                <th style={{ padding: 10 }}>Estado</th>
                <th style={{ padding: 10 }}>Programada</th>
                <th style={{ padding: 10 }}>Métricas</th>
                <th style={{ padding: 10 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((pub) => (
                <tr key={pub.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 10, fontWeight: 500, maxWidth: 280 }}>{pub.nombre}</td>
                  <td style={{ padding: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>
                      {pub.plataforma}
                    </span>
                  </td>
                  <td style={{ padding: 10, fontSize: 11, color: '#6b7280' }}>
                    {pub.isBoost ? '⚡ Boost' : pub.creative ? '🎨 Creative' : 'Vacia'}
                  </td>
                  <td style={{ padding: 10 }}>
                    <span
                      title={pub.errorMessage ?? undefined}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: STATE_COLOR[pub.estado] + '22',
                        color: STATE_COLOR[pub.estado],
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {pub.estado}
                    </span>
                  </td>
                  <td style={{ padding: 10, color: '#6b7280' }}>
                    {pub.scheduledFor ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} />
                        {new Date(pub.scheduledFor).toLocaleString('es-ES')}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: 10, color: '#6b7280' }}>
                    {pub.metrics
                      ? `${pub.metrics.impressions} imp · ${pub.metrics.clicks} clk · $${(pub.metrics.spend ?? 0).toFixed(2)}`
                      : '—'}
                  </td>
                  <td style={{ padding: 10 }}>
                    {(pub.estado === 'BORRADOR' || pub.estado === 'ERROR') && (
                      <button
                        type="button"
                        onClick={() => handlePublish(pub.id)}
                        style={{
                          padding: '4px 8px',
                          background: '#10b981',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                        title="Publicar en Meta/Google"
                      >
                        <Send size={11} /> Publicar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
