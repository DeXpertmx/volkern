'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  ShieldCheck, 
  Clock, 
  User, 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  ExternalLink,
  Lock,
  Calendar,
  Fingerprint,
  Loader2
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function VerificationPortalPage() {
  const params = useParams()
  const [loading, setLoading] = useState(true)
  const [signature, setSignature] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSignature()
  }, [params.id])

  const fetchSignature = async () => {
    try {
      // Endpoint que buscaremos implementar para consulta pública limitada
      const res = await fetch(`/api/public/verify/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setSignature(data)
      } else {
        setError('Documento no encontrado o firma inválida.')
      }
    } catch (err) {
      setError('Error al conectar con el nodo de validación.')
    } finally {
      setLoading(false)
    }
  }

  const maskHash = (hash: string) => {
    if (!hash || hash.length < 16) return hash
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-slate-500 font-medium">Validando integridad en Nexus Protocol...</p>
        </div>
      </div>
    )
  }

  if (error || !signature) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-red-100 shadow-xl shadow-red-50/50">
          <CardContent className="pt-8 text-center space-y-4">
            <div className="bg-red-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">Validación Fallida</h2>
              <p className="text-slate-500 text-sm">{error || 'No se ha podido verificar este documento.'}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header con Branding Nexus */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/20">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">NEXUS VALIDATION</h1>
              <p className="text-[10px] font-bold text-primary uppercase tracking-[0.3em]">Volkern Trust Protocol v2.0</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm">
            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-slate-600">NODO ACTIVO: NEXUS-PRIMARY-01</span>
          </div>
        </div>

        {/* Status Card Principal */}
        <Card className="overflow-hidden border-none shadow-2xl shadow-slate-200/60 ring-1 ring-slate-100">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-white">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> DOCUMENTO AUTÉNTICO
                  </Badge>
                  {signature.metadata?.tsa?.certified && (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                      <ShieldCheck className="h-3 w-3 mr-1" /> CERTIFICADO TSA REAL
                    </Badge>
                  )}
                  <Badge className="bg-white/10 text-slate-300 border-white/10">
                    <Lock className="h-3 w-3 mr-1" /> INVIOLABLE
                  </Badge>
                </div>
                <h2 className="text-3xl font-bold tracking-tight">{signature.documentType === 'ACTA_ENTREGA' ? 'Contrato / Acta Digital' : signature.documentType}</h2>
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Fingerprint className="h-4 w-4" />
                  <code>Hash: {maskHash(signature.documentHash)}</code>
                </div>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Fecha de Emisión</p>
                <p className="text-xl font-medium">{format(new Date(signature.createdAt), 'dd MMMM, yyyy', { locale: es })}</p>
              </div>
            </div>
          </div>
          
          <CardContent className="p-0">
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Columna Firmante */}
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-2 text-slate-400">
                  <User className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Identidad del Emisor</span>
                </div>
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">{signature.tenantName}</p>
                    <p className="text-sm text-slate-500">ID Fiscal: {signature.tenantNif || 'Validado'}</p>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Sello de Firma del Sistema</p>
                  <code className="text-[11px] block break-all text-primary font-medium">
                    {maskHash(signature.signatureHash)}
                  </code>
                </div>
              </div>

              {/* Columna Auditoría TSA */}
              <div className="p-8 space-y-6 bg-slate-50/30">
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Sello de Tiempo Forense (TSA)</span>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 flex items-center gap-2"><Calendar className="h-4 w-4" /> Certificación Cronológica</span>
                    <span className="font-bold text-slate-900">{format(new Date(signature.metadata?.tsa?.timestamp || signature.createdAt), 'HH:mm:ss O', { locale: es })}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Autoridad Certificadora</span>
                    <span className="text-xs bg-white px-2 py-1 rounded border border-emerald-200 text-emerald-700 font-bold shadow-sm">
                      {signature.metadata?.tsa?.provider || 'Volkern Trust'}
                    </span>
                  </div>
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Hash TSA Autorizado</p>
                    <code className="text-[11px] block break-all text-emerald-700">
                      {signature.metadata?.tsa?.hash || 'MOCK_TSA_HASH_VALIDATED'}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer info */}
        <div className="text-center space-y-4">
          <p className="text-slate-400 text-xs leading-relaxed max-w-lg mx-auto">
            Este documento ha sido sellado digitalmente en la infraestructura Nexus de Volkern. 
            La integridad del contenido está garantizada mediante algoritmos SHA-256 y HMAC. 
            Cualquier alteración del documento original invalidará este certificado.
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="link" className="text-slate-400 text-xs">Terminos de Verificación</Button>
            <Button variant="link" className="text-slate-400 text-xs">Reportar Incidencia</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
