'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, ArrowLeft, RefreshCw, Scan, Clock3, CheckCircle2, AlertTriangle } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(response => response.json())

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Pendiente de revisión',
  PROCESSING: 'Procesando',
  REVIEW: 'En revisión',
  PROCESSED: 'Procesado',
  DISCARDED: 'Descartado',
  ERROR: 'Error',
}

function statusClass(status: string): string {
  if (status === 'PROCESSED') return 'bg-emerald-100 text-emerald-700'
  if (status === 'DISCARDED') return 'bg-slate-100 text-slate-600'
  if (status === 'ERROR') return 'bg-red-100 text-red-700'
  if (status === 'PROCESSING') return 'bg-blue-100 text-blue-700'
  return 'bg-amber-100 text-amber-700'
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'PROCESSED') return <CheckCircle2 className="h-4 w-4" />
  if (status === 'ERROR') return <AlertTriangle className="h-4 w-4" />
  if (status === 'PROCESSING') return <RefreshCw className="h-4 w-4 animate-spin" />
  return <Clock3 className="h-4 w-4" />
}

export default function GastosInboxPage() {
  const { data, isLoading, mutate } = useSWR('/api/erp/expenses/inbox', fetcher)
  const documents = data?.documents || []

  const restoreDocument = async (id: string) => {
    const response = await fetch('/api/erp/expenses/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'REVIEW', errorMessage: null }),
    })
    if (response.ok) await mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finanzas/gastos">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-black tracking-tight uppercase">Bandeja de documentos</h1>
            <p className="text-muted-foreground">Facturas y comprobantes pendientes de revisar y contabilizar.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Link href="/dashboard/finanzas/gastos/escanear">
            <Button><Scan className="h-4 w-4 mr-2" /> Escanear documento</Button>
          </Link>
        </div>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" /> Documentos recibidos ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando bandeja…</p>
          ) : documents.length === 0 ? (
            <div className="py-14 text-center space-y-3">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="font-semibold">La bandeja está vacía</p>
              <p className="text-sm text-muted-foreground">Los documentos separados de un PDF aparecerán aquí cuando se incorporen al flujo de revisión.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((document: any) => (
                <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><FileText className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{document.fileName}</p>
                      <p className="text-xs text-muted-foreground">Páginas {document.pageStart}–{document.pageEnd} · {new Date(document.createdAt).toLocaleString('es-ES')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusClass(document.status)}`}>
                      <StatusIcon status={document.status} /> {STATUS_LABELS[document.status] || document.status}
                    </span>
                    {document.status === 'DISCARDED' && (
                      <Button variant="outline" size="sm" onClick={() => restoreDocument(document.id)}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Restaurar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
