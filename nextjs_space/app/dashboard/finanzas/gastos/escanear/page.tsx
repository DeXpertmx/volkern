'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Camera, Receipt, Scan, Loader2, ArrowLeft, CheckCircle2, Image as ImageIcon } from 'lucide-react'

interface ExtractedData {
  supplier: string | null
  total: number | null
  date: string | null
  category: string
  nif: string | null
  invoiceNumber: string | null
  taxableBase: number | null
  vatRate: number | null
  vatAmount: number | null
  operationDate: string | null
  issuerName: string | null
  issuerAddress: string | null
  issuerTaxId: string | null
  rawText: string
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
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [rawOcrText, setRawOcrText] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showSelect, setShowSelect] = useState(true)

  const [form, setForm] = useState({
    description: '',
    amount: '',
    supplier: '',
    category: 'otros',
    date: new Date().toISOString().split('T')[0],
    receiptUrl: '',
    invoiceNumber: '',
    taxableBase: '',
    vatRate: '',
    vatAmount: '',
    operationDate: '',
    issuerName: '',
    issuerAddress: '',
    issuerTaxId: '',
  })

  const handleImageCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCapturedFile(file)
    setCapturedImage(URL.createObjectURL(file))
    setShowSelect(false)
    setShowForm(false)
    setScanResult(null)
  }, [])

  const compressImage = async (file: File, maxDim = 1200, quality = 0.6): Promise<Blob> => {
    const img = await createImageBitmap(file, { resizeWidth: maxDim, resizeHeight: maxDim, resizeQuality: 'medium' })
    const c = document.createElement('canvas')
    c.width = Math.min(img.width, maxDim)
    c.height = Math.min(img.height, maxDim)
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('No canvas context')
    ctx.drawImage(img, 0, 0)
    img.close()
    return new Promise((resolve, reject) => {
      c.toBlob(b => b ? resolve(b) : reject(new Error('No blob')), 'image/jpeg', quality)
    })
  }

  const runScan = useCallback(async () => {
    if (!capturedFile) return
    setScanning(true)
    setScanMessage('Preparando imagen...')

    try {
      const blob = await compressImage(capturedFile)
      setScanMessage('Enviando a OCR...')
      const formData = new FormData()
      formData.append('file', blob, 'receipt.jpg')

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 40000)

      const res = await fetch('/api/erp/expenses/scan', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Error al escanear')
        setScanning(false)
        return
      }

      // Mostrar diagnóstico si OCR falló (sin API keys o error de extracción)
      if (!data.success && data.diagnostic) {
        toast.warning(data.diagnostic)
      }

      setScanMessage('Analizando datos...')
      setScanResult(data)
      setRawOcrText(data.rawText || '')
      const ext: ExtractedData = data.extracted
      setForm(prev => ({
        ...prev,
        description: ext.supplier ? `Gasto en ${ext.supplier}` : '',
        amount: ext.total ? ext.total.toString() : '',
        supplier: ext.supplier || '',
        category: ext.category || 'otros',
        date: ext.date ? formatDetectedDate(ext.date) : prev.date,
        receiptUrl: data.receiptUrl,
        invoiceNumber: ext.invoiceNumber || '',
        taxableBase: ext.taxableBase ? ext.taxableBase.toString() : '',
        vatRate: ext.vatRate ? ext.vatRate.toString() : '',
        vatAmount: ext.vatAmount ? ext.vatAmount.toString() : '',
        operationDate: ext.operationDate ? formatDetectedDate(ext.operationDate) : '',
        issuerName: ext.issuerName || '',
        issuerAddress: ext.issuerAddress || '',
        issuerTaxId: ext.issuerTaxId || '',
      }))
      setShowForm(true)
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.error('El OCR está tardando demasiado. Usa "Sin OCR" para ir al formulario.')
      } else {
        toast.error('Error de conexión al escanear')
      }
    } finally {
      setScanning(false)
      setScanMessage('')
    }
  }, [capturedFile])

  const goToForm = () => {
    setShowForm(true)
    setShowSelect(false)
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
        invoiceNumber: form.invoiceNumber || undefined,
        taxableBase: form.taxableBase || undefined,
        vatRate: form.vatRate || undefined,
        vatAmount: form.vatAmount || undefined,
        operationDate: form.operationDate || undefined,
        issuerName: form.issuerName || undefined,
        issuerAddress: form.issuerAddress || undefined,
        issuerTaxId: form.issuerTaxId || undefined,
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
    router.push('/dashboard/finanzas/gastos')
  }

  const resetAll = () => {
    if (capturedImage?.startsWith('blob:')) URL.revokeObjectURL(capturedImage)
    setCapturedImage(null)
    setCapturedFile(null)
    setScanResult(null)
    setRawOcrText('')
    setShowForm(false)
    setShowSelect(true)
    setForm({
      description: '',
      amount: '',
      supplier: '',
      category: 'otros',
      date: new Date().toISOString().split('T')[0],
      receiptUrl: '',
      invoiceNumber: '',
      taxableBase: '',
      vatRate: '',
      vatAmount: '',
      operationDate: '',
      issuerName: '',
      issuerAddress: '',
      issuerTaxId: '',
    })
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

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageCapture} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageCapture} />

      {showSelect && !capturedImage && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg" onClick={() => cameraInputRef.current?.click()}>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">Cámara</p>
                <p className="text-sm text-muted-foreground">Abre la cámara del dispositivo</p>
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

      {capturedImage && !showForm && (
        <Card>
          <CardContent className="p-4">
            <div className="relative rounded-xl overflow-hidden bg-slate-100">
              <img src={capturedImage} alt="Captura" className="w-full max-h-[50vh] object-contain" />
            </div>
            <div className="flex gap-3 mt-4 justify-center flex-wrap">
              <Button variant="outline" onClick={resetAll}>
                <Camera className="h-4 w-4 mr-2" /> Nueva Foto
              </Button>
              <Button variant="outline" onClick={goToForm}>
                <Receipt className="h-4 w-4 mr-2" /> Sin OCR
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

      {showForm && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {scanResult?.ocrTimedOut ? <><span className="text-amber-500">⚠</span> OCR no disponible</> : scanResult ? <><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Datos Extraídos</> : <><Receipt className="h-5 w-5" /> Datos del Gasto</>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.receiptUrl && capturedImage && (
                <div className="rounded-xl overflow-hidden bg-slate-100 border max-h-[200px] flex items-center justify-center">
                  <img src={capturedImage} alt="Comprobante" className="max-w-full max-h-[200px] object-contain" />
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

              {rawOcrText && (
                <details className="border rounded-lg p-3 bg-muted/30">
                  <summary className="font-semibold text-sm cursor-pointer select-none">Texto OCR crudo</summary>
                  <pre className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{rawOcrText}</pre>
                </details>
              )}
              <details className="border rounded-lg p-3 bg-muted/30">
                <summary className="font-semibold text-sm cursor-pointer select-none">Datos Verifactu (opcional)</summary>
                <div className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nº Factura</Label>
                      <Input value={form.invoiceNumber} onChange={e => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} placeholder="2024-001" />
                    </div>
                    <div>
                      <Label>Fecha Operación</Label>
                      <Input type="date" value={form.operationDate} onChange={e => setForm(p => ({ ...p, operationDate: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Base Imponible</Label>
                      <Input type="number" step="0.01" value={form.taxableBase} onChange={e => setForm(p => ({ ...p, taxableBase: e.target.value }))} placeholder="0.00" />
                    </div>
                    <div>
                      <Label>IVA %</Label>
                      <Input type="number" step="0.01" value={form.vatRate} onChange={e => setForm(p => ({ ...p, vatRate: e.target.value }))} placeholder="21" />
                    </div>
                    <div>
                      <Label>Cuota IVA</Label>
                      <Input type="number" step="0.01" value={form.vatAmount} onChange={e => setForm(p => ({ ...p, vatAmount: e.target.value }))} placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <Label>Razón Social (Emisor)</Label>
                    <Input value={form.issuerName} onChange={e => setForm(p => ({ ...p, issuerName: e.target.value }))} placeholder="Nombre o razón social" />
                  </div>
                  <div>
                    <Label>NIF Emisor</Label>
                    <Input value={form.issuerTaxId} onChange={e => setForm(p => ({ ...p, issuerTaxId: e.target.value }))} placeholder="B12345678" />
                  </div>
                  <div>
                    <Label>Domicilio Fiscal (Emisor)</Label>
                    <Input value={form.issuerAddress} onChange={e => setForm(p => ({ ...p, issuerAddress: e.target.value }))} placeholder="C/ Ejemplo 123, 28001 Madrid" />
                  </div>
                </div>
              </details>

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
    </div>
  )
}
