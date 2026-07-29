'use client'

import { useEffect, useState } from 'react'
import { Megaphone, Plus, AlertCircle, Calendar } from 'lucide-react'

type Estado = 'BORRADOR' | 'PROGRAMADA' | 'PUBLICADA' | 'ERROR' | 'PAUSADA'

interface PublicacionAds {
  id: string
  nombre: string
  copy: string
  plataforma: 'meta' | 'google'
  estado: Estado
  mediaUrl: string | null
  scheduledFor: string | null
  publishedAt: string | null
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
  const [items, setItems] = useState<PublicacionAds[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/ads/publicaciones', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return Promise.reject(new Error(`HTTP ${r.status}`))
        return r.json()
      })
      .then((data) => {
        setItems(Array.isArray(data) ? (data as PublicacionAds[]) : [])
        setLoading(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/ads/publicaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Nueva publicación ADS',
          copy: 'Edita este copy…',
          plataforma: 'meta',
          estado: 'BORRADOR',
        }),
      })
      if (!res.ok && res.status !== 501) {
        throw new Error(`HTTP ${res.status}`)
      }
      // 501 not implemented is the current expected outcome (Prisma model pending).
      alert(
        res.status === 501
          ? 'Backend pendiente: añade el modelo Prisma adPublication para habilitar creación.'
          : 'Publicación ADS creada.',
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          padding: 32,
          color: '#6b7280',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
        }}
      >
        <Megaphone size={18} /> Cargando publicaciones ADS…
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: 32,
          color: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
        }}
      >
        <AlertCircle size={18} /> Error al cargar: {error}
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
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
        <Megaphone
          size={48}
          style={{ margin: '0 auto 16px', display: 'block', opacity: 0.5 }}
        />
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#111827',
            marginBottom: 8,
          }}
        >
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
          Crea, programa y publica anuncios individuales en Meta (Facebook,
          Instagram) y Google Ads. Cada publicación incluye creatividad,
          copy y un calendario de difusión independiente de la campaña.
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          style={{
            padding: '10px 16px',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            opacity: creating ? 0.6 : 1,
            cursor: creating ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
          title="Disponible cuando se añada el modelo AdPublication a Prisma"
        >
          <Plus size={16} /> {creating ? 'Creando…' : 'Crear primera Publicación ADS'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
            <th style={{ padding: 12 }}>Nombre</th>
            <th style={{ padding: 12 }}>Plataforma</th>
            <th style={{ padding: 12 }}>Estado</th>
            <th style={{ padding: 12 }}>Programada</th>
            <th style={{ padding: 12 }}>Métricas</th>
          </tr>
        </thead>
        <tbody>
          {items.map((pub) => (
            <tr key={pub.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: 12, fontWeight: 500 }}>{pub.nombre}</td>
              <td style={{ padding: 12, textTransform: 'capitalize' }}>
                {pub.plataforma}
              </td>
              <td style={{ padding: 12 }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: STATE_COLOR[pub.estado] + '22',
                    color: STATE_COLOR[pub.estado],
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {pub.estado}
                </span>
              </td>
              <td style={{ padding: 12, color: '#6b7280' }}>
                {pub.scheduledFor ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} />
                    {new Date(pub.scheduledFor).toLocaleString('es-ES')}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td style={{ padding: 12, color: '#6b7280' }}>
                {pub.metrics
                  ? `${pub.metrics.impressions} imp · ${pub.metrics.clicks} clk · $${pub.metrics.spend.toFixed(2)}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
