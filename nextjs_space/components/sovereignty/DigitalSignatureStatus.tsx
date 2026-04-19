'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, ShieldCheck, QrCode, ExternalLink, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { motion, AnimatePresence } from 'framer-motion'

interface SignatureStatusProps {
  signatureId?: string
  documentHash?: string
  onVerifyClick?: () => void
}

/**
 * Widget de Soberanía: Digital Signature Status
 * Proporciona feedback visual premium sobre la integridad y validez legal de un documento.
 */
export function DigitalSignatureStatus({ signatureId, documentHash, onVerifyClick }: SignatureStatusProps) {
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifiedData, setVerifiedData] = useState<any>(null)

  const verifySovereignty = async () => {
    if (!signatureId) return
    setIsVerifying(true)
    try {
      const res = await fetch(`/api/v1/sovereignty/verify/${signatureId}`)
      if (res.ok) {
        setVerifiedData(await res.json())
      }
    } catch (e) {
      console.error('Verification failed', e)
    } finally {
      setIsVerifying(false)
    }
  }

  useEffect(() => {
    if (signatureId) verifySovereignty()
  }, [signatureId])

  return (
    <Card className="border-none shadow-none bg-emerald-500/5 rounded-3xl overflow-hidden border border-emerald-500/10">
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 rounded-2xl">
            {isVerifying ? (
              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Integrity Graph</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            </div>
            <p className="text-[12px] font-bold text-slate-900 leading-tight">
              {signatureId ? 'Sellado Digitalmente' : 'Protección Vault Activa'}
            </p>
            {documentHash && (
              <p className="text-[8px] font-mono text-emerald-600 mt-1 truncate max-w-[120px]">
                {documentHash}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {signatureId && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 w-8 p-0 rounded-xl hover:bg-emerald-500/10 transition-colors"
              onClick={() => window.open(`/api/v1/sovereignty/verify/${signatureId}`, '_blank')}
            >
              <ExternalLink className="w-4 h-4 text-emerald-600" />
            </Button>
          )}
          <div className="p-2 bg-white shadow-sm border border-emerald-100 rounded-xl cursor-help group relative">
            <QrCode className="w-4 h-4 text-slate-800" />
            <div className="absolute bottom-full right-0 mb-2 w-48 p-3 bg-slate-900 text-white text-[10px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              Escanea este sello en el documento PDF para verificar la soberanía legal en tiempo real.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Button({ children, ...props }: any) {
  return <button {...props}>{children}</button>
}
