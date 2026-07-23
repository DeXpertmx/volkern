'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Camera, Receipt, Scan, Loader2, ArrowLeft, CheckCircle2, Image as ImageIcon } from 'lucide-react'

type PageStep = 'select' | 'camera' | 'preview' | 'form'

interface ExtractedData {
  supplier: string | null
  total: number | null
  date: string | null
  category: string
  nif: string | null
}

interface ScanResult {
  receiptUrl: string
  extracted: ExtractedData
}

const CATEGORIES = [
  { value: 'alimentacion', label: 'Alimentación' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'suministros', label: 'Suministros' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'tecnologia', label: 'Tecnología' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'profesional', label: 'Profesional' },
  { value: 'otros', label: 'Otros' },
]

export default function EscanearGastoPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [step, setStep] = useState<PageStep>('select')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (step !== 'camera') return
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        if (!cancelled) {
          toast.error('No se pudo acceder a la cámara. Usa la subida de imagen en su lugar.')
          setStep('select')
        }
      }
    })()
    return () => { cancelled = true }
  }, [step])

  const [form, setForm] = useState({
    description: '',
    amount: '',
    supplier: '',
    category: 'otros',
    date: new Date().toISOString().split('T')[0],
    receiptUrl: '',
  })

  const startCamera = useCallback(() => {
    setStep('camera')
    setCapturedImage(null)
    setScanResult(null)
  }, [])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedImage(dataUrl)
    setStep('preview')

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCapturedImage(ev.target?.result as string)
      setStep('preview')
      setScanResult(null)
    }
    reader.readAsDataURL(file)
  }, [])

  const compressImage = async (dataUrl: string, maxDim = 1920, quality = 0.7): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim }
          else { width = Math.round(width * maxDim / height); height = maxDim }
        }
        const c = document.createElement('canvas')
        c.width = width; c.height = height
        const ctx = c.getContext('2d')
        if (!ctx) { reject(new Error('No canvas context')); return }
        ctx.drawImage(img, 0, 0, width, height)
        c.toBlob(b => b ? resolve(b) : reject(new Error('No blob')), 'image/jpeg', quality)
      }
      img.onerror = reject
      img.src = dataUrl
    })
  }

  const runScan = useCallback(async () => {
    if (!capturedImage) return
    setScanning(true)
    setScanMessage('Preparando imagen...')

    try {
      const blob = await compressImage(capturedImage)
      setScanMessage('Ejecutando OCR...')
      const formData = new FormData()
      formData.append('file', blob, 'receipt.jpg')

      const res = await fetch('/api/erp/expenses/scan', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Error al escanear')
        setScanning(false)
        return
      }

      setScanMessage('Analizando datos extraídos...')
      setScanResult(data)
      const ext = data.extracted
      setForm(prev => ({
        ...prev,
        description: ext.supplier ? `Gasto en ${ext.supplier}` : '',
        amount: ext.total ? ext.total.toString() : '',
        supplier: ext.supplier || '',
        category: ext.category || 'otros',
        date: ext.date ? formatDetectedDate(ext.date) : prev.date,
        receiptUrl: data.receiptUrl,
      }))
      setStep('form')
    } catch {
      toast.error('Error de conexión al escanear')
    } finally {
      setScanning(false)
      setScanMessage('')
    }
  }, [capturedImage])

  const goToForm = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setStep('form')
  }

  const retake = () => {
    setCapturedImage(null)
    setScanResult(null)
    setScanMessage('')
    if (step === 'preview') {
      startCamera()
    } else {
      setStep('select')
    }
  }

  const formatDetectedDate = (dateStr: string): string => {
    const parts = dateStr.split(/[/-]/)
    if (parts.length === 3) {
      let d = parts[0].padStart(2, '0')
      let m = parts[1].padStart(2, '0')
      let y = parts[2]
      if (y.length === 2) y = '20' + y
      return `${y}-${m}-${d}`
    }
    return new Date().toISOString().split('T')[0]
  }

  const saveExpense = async () => {
    if (!form.amount || !form.description) {
      toast.error('Descripción e importe son requeridos')
      return
    }

    setSaving(true)
    try {
      let supplierId: string | null = null

      if (form.supplier) {
        const existingRes = await fetch(`/api/erp/suppliers?search=${encodeURIComponent(form.supplier)}`)
        const existing = await existingRes.json()
        if (Array.isArray(existing) && existing.length > 0) {
          supplierId = existing[0].id
        } else {
          const createRes = await fetch('/api/erp/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.supplier, category: form.category }),
          })
          if (createRes.ok) {
            const created = await createRes.json()
            supplierId = created.id
          }
        }
      }

      if (!supplierId) {
        toast.error('Debes indicar un proveedor válido')
        setSaving(false)
        return
      }

      const body: Record<string, any> = {
        description: form.description,
        amount: parseFloat(form.amount),
        category: form.category,
        supplierId,
        status: 'PAID',
      }
      if (form.receiptUrl) body.receiptUrl = form.receiptUrl

      const res = await fetch('/api/erp/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        toast.success('Gasto registrado correctamente')
        router.push('/dashboard/finanzas/gastos')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al crear gasto')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const discardAndBack = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    router.push('/dashboard/finanzas/gastos')
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={discardAndBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Escanear Gasto</h1>
            <p className="text-sm text-muted-foreground">Toma una foto del ticket o sube una imagen</p>
          </div>
        </div>
      </div>

      {step === 'select' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg" onClick={startCamera}>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">Cámara</p>
                <p className="text-sm text-muted-foreground">Toma una foto del ticket</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg" onClick={() => fileInputRef.current?.click()}>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">Subir Imagen</p>
                <p className="text-sm text-muted-foreground">Selecciona una foto del ticket</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg" onClick={goToForm}>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Receipt className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">Manual</p>
                <p className="text-sm text-muted-foreground">Rellena los datos del gasto</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {step === 'camera' && (
        <Card>
          <CardContent className="p-4">
            <div className="relative rounded-xl overflow-hidden bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] object-cover" />
            </div>
            <div className="flex gap-3 mt-4 justify-center">
              <Button variant="outline" onClick={discardAndBack}>Cancelar</Button>
              <Button onClick={capturePhoto}>
                <Camera className="h-4 w-4 mr-2" /> Capturar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && capturedImage && (
        <Card>
          <CardContent className="p-4">
            <div className="relative rounded-xl overflow-hidden bg-slate-100">
              <img src={capturedImage} alt="Captura" className="w-full max-h-[50vh] object-contain" />
            </div>
            <div className="flex gap-3 mt-4 justify-center">
              <Button variant="outline" onClick={goToForm}>
                <Receipt className="h-4 w-4 mr-2" /> Sin OCR
              </Button>
              <Button variant="outline" onClick={retake}>
                <Camera className="h-4 w-4 mr-2" /> Repetir
              </Button>
              <Button onClick={runScan} disabled={scanning} className="min-w-[180px]">
                {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scan className="h-4 w-4 mr-2" />}
                {scanning ? (scanMessage || 'Escaneando...') : 'Escanear Ticket'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {scanning && scanMessage && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-center gap-3 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-bold text-primary">{scanMessage}</span>
          </CardContent>
        </Card>
      )}

      {(step === 'form' || scanResult) && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {scanResult ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Receipt className="h-5 w-5" />}
                {scanResult ? 'Datos Extraídos' : 'Datos del Gasto'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.receiptUrl && (
                <div className="rounded-xl overflow-hidden bg-slate-100 border max-h-[200px] flex items-center justify-center">
                  <img
                    src={capturedImage || ''}
                    alt="Comprobante"
                    className="max-w-full max-h-[200px] object-contain"
                  />
                </div>
              )}
              <div>
                <Label>Descripción <span className="text-destructive">*</span></Label>
                <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Ej: Compra en supermercado" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Importe <span className="text-destructive">*</span></Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Proveedor</Label>
                  <Input value={form.supplier} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} placeholder="Nombre del proveedor" />
                </div>
                <div>
                  <Label>Categoría</Label>
                  <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={discardAndBack}>Descartar</Button>
                <Button className="flex-1" onClick={saveExpense} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {saving ? 'Guardando...' : 'Guardar Gasto'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
