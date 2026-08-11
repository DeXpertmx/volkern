'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Camera, Receipt, Scan, Loader2, ArrowLeft, CheckCircle2, Image as ImageIcon, FileText, AlertTriangle } from 'lucide-react'
import IvaRatesEditor from '@/components/finance/IvaRatesEditor'
import { computeVatAmount, computePercentageAmount, computeInvoiceTotalMismatch } from '@/lib/finance/vat'

interface EmisorInfo {
  nombre: string | null
  nif: string | null
  direccion: string | null
}

interface ReceptorInfo {
  nombre: string | null
  nif: string | null
  direccion: string | null
}

interface LineaFactura {
  descripcion: string | null
  cantidad: number | null
  precio_unitario: number | null
  importe: number | null
}

interface TotalesFactura {
  base_imponible: number | null
  tipo_iva: number | null
  cuota_iva: number | null
  tipo_irpf: number | null
  cuota_irpf: number | null
  total_factura: number | null
}

interface ExtractedData {
  // Nuevos campos estructurados
  numero_factura: string | null
  serie: string | null
  fecha_emision: string | null
  fecha_operacion: string | null
  emisor: EmisorInfo
  receptor: ReceptorInfo
  lineas: LineaFactura[]
  totales: TotalesFactura
  iban: string | null
  category: string

  // Campos legacy
  supplier: string | null
  total: number | null
  date: string | null
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
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [isPdf, setIsPdf] = useState(false)
  const [capturedFileName, setCapturedFileName] = useState<string>('')
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [rawOcrText, setRawOcrText] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showSelect, setShowSelect] = useState(true)
  // Tipos de IVA del proveedor: se ofrecen como opciones para el IVA % y se
  // guardan en el proveedor al registrar el gasto.
  const [supplierVatRates, setSupplierVatRates] = useState<number[]>([])
  // Si el usuario editó los tipos manualmente, el lookup no debe sobreescribirlos
  const [ratesTouched, setRatesTouched] = useState(false)
  // Tramos de IVA (varias bases con distintos tipos) para facturas mixtas
  const [ivaRows, setIvaRows] = useState<{ id: number; base: string; rate: string }[]>([])
  const nextIvaRowId = useRef(0)

  const lookupSupplierVatRates = async (name: string) => {
    if (ratesTouched) return
    if (!name.trim()) { setSupplierVatRates([]); return }
    try {
      const res = await fetch(`/api/erp/suppliers?search=${encodeURIComponent(name)}`)
      const list = await res.json()
      if (Array.isArray(list) && list.length > 0) {
        const exact = list.find((s: any) => (s.name || '').toLowerCase() === name.trim().toLowerCase())
        const s = exact || list[0]
        setSupplierVatRates(Array.isArray(s?.vatRates) ? s.vatRates : [])
      } else {
        setSupplierVatRates([])
      }
    } catch {
      /* sin cambios */
    }
  }

  // Aplica un tipo de IVA y recalcula la cuota si hay base imponible
  const applyVatRate = (rate: string) => {
    setForm(p => {
      const vatAmount = computeVatAmount(p.taxableBase, rate)
      return { ...p, vatRate: rate, vatAmount: vatAmount || p.vatAmount }
    })
  }

  // Aplica el tipo de retención de IRPF y recalcula la cuota si hay base
  const applyIrpfRate = (rate: string) => {
    setForm(p => {
      const irpfAmount = computePercentageAmount(p.taxableBase, rate)
      return { ...p, irpfRate: rate, irpfAmount: irpfAmount || p.irpfAmount }
    })
  }

  // Aplica la base imponible y recalcula cuota de IVA y retención de IRPF
  const applyTaxableBase = (base: string) => {
    setForm(p => {
      const vatAmount = computeVatAmount(base, p.vatRate)
      const irpfAmount = computePercentageAmount(base, p.irpfRate)
      return {
        ...p,
        taxableBase: base,
        vatAmount: vatAmount || p.vatAmount,
        irpfAmount: irpfAmount || p.irpfAmount,
      }
    })
  }

  const [form, setForm] = useState({
    description: '',
    amount: '',
    supplier: '',
    category: 'otros',
    date: new Date().toISOString().split('T')[0],
    receiptUrl: '',
    // Identificación factura
    invoiceNumber: '',
    serie: '',
    // Emisor
    issuerName: '',
    issuerTaxId: '',
    issuerAddress: '',
    // Receptor
    receptorNombre: '',
    receptorNif: '',
    receptorDireccion: '',
    // Líneas de detalle
    lineas: [] as { descripcion: string; cantidad: string; precio: string; importe: string }[],
    // Totales
    taxableBase: '',
    vatRate: '',
    vatAmount: '',
    irpfRate: '',
    irpfAmount: '',
    totalFactura: '',
    operationDate: '',
    iban: '',
  })

  // ─── Tramos de IVA: sincroniza los agregados del formulario ───────────
  const syncTotalsFromRows = (rows: typeof ivaRows) => {
    if (rows.length === 0) return
    const bases = rows.map(r => parseFloat(r.base)).filter(Number.isFinite)
    const vats = rows
      .map(r => computePercentageAmount(r.base, r.rate))
      .map(v => parseFloat(v))
      .filter(Number.isFinite)
    const rates = rows.map(r => r.rate).filter(r => r !== '')
    const uniform = rates.length === rows.length && new Set(rates).size === 1 ? rates[0] : ''
    setForm(p => ({
      ...p,
      taxableBase: bases.length ? bases.reduce((a, b) => a + b, 0).toFixed(2) : p.taxableBase,
      vatAmount: vats.length ? vats.reduce((a, b) => a + b, 0).toFixed(2) : p.vatAmount,
      vatRate: uniform,
    }))
  }

  const addIvaRow = () => {
    // El primer tramo arranca con los valores actuales del desglose único
    const rows = ivaRows.length === 0 && (form.taxableBase || form.vatRate)
      ? [{ id: nextIvaRowId.current++, base: form.taxableBase, rate: form.vatRate }]
      : [...ivaRows, { id: nextIvaRowId.current++, base: '', rate: '' }]
    setIvaRows(rows)
    syncTotalsFromRows(rows)
  }

  const updateIvaRow = (id: number, field: 'base' | 'rate', value: string) => {
    const rows = ivaRows.map(r => (r.id === id ? { ...r, [field]: value } : r))
    setIvaRows(rows)
    syncTotalsFromRows(rows)
  }

  const removeIvaRow = (id: number) => {
    const rows = ivaRows.filter(r => r.id !== id)
    setIvaRows(rows)
    if (rows.length > 0) syncTotalsFromRows(rows)
  }

  const ivaTotals = ivaRows.reduce(
    (acc, r) => {
      const b = parseFloat(r.base)
      const v = computePercentageAmount(r.base, r.rate)
      return {
        base: acc.base + (Number.isFinite(b) ? b : 0),
        vat: acc.vat + (v ? parseFloat(v) : 0),
      }
    },
    { base: 0, vat: 0 }
  )

  // ─── Receptor: pre-rellena con los datos fiscales del tenant (emisor) ──
  const loadTenantReceptor = async () => {
    try {
      const res = await fetch('/api/configuracion/fiscal/emisores?principal=true')
      const data = await res.json()
      const emisor = Array.isArray(data?.emisores) ? data.emisores[0] : null
      if (!emisor) return
      setForm(p => ({
        ...p,
        receptorNombre: p.receptorNombre || emisor.razonSocial || '',
        receptorNif: p.receptorNif || emisor.idFiscal || '',
        receptorDireccion: p.receptorDireccion || [emisor.direccion, emisor.codigoPostal, emisor.ciudad].filter(Boolean).join(', '),
      }))
    } catch {
      /* silencioso: el usuario puede rellenar el receptor a mano */
    }
  }

  // Aviso de conciliación: base + IVA − IRPF debe cuadrar con el total OCR
  const totalsMismatch = computeInvoiceTotalMismatch(form.taxableBase, form.vatAmount, form.irpfAmount, form.totalFactura)

  const handleFileCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    setCapturedFile(file)
    setCapturedFileName(file.name)
    setIsPdf(pdf)
    setCapturedImage(pdf ? null : URL.createObjectURL(file))
    setShowSelect(false)
    setShowForm(false)
    setScanResult(null)
  }, [])

  const prepareFile = async (file: File, maxDim = 1200, quality = 0.6): Promise<{ blob: Blob; mimeType: string; fileName: string }> => {
    const isPdfFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (isPdfFile) {
      // PDF: no comprimir, enviar raw
      return { blob: file, mimeType: 'application/pdf', fileName: file.name }
    }
    // Imagen: comprimir como antes
    const img = await createImageBitmap(file, { resizeWidth: maxDim, resizeHeight: maxDim, resizeQuality: 'medium' })
    const c = document.createElement('canvas')
    c.width = Math.min(img.width, maxDim)
    c.height = Math.min(img.height, maxDim)
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('No canvas context')
    ctx.drawImage(img, 0, 0)
    img.close()
    const blob = await new Promise<Blob>((resolve, reject) => {
      c.toBlob(b => b ? resolve(b) : reject(new Error('No blob')), 'image/jpeg', quality)
    })
    return { blob, mimeType: 'image/jpeg', fileName: 'receipt.jpg' }
  }

  const runScan = useCallback(async () => {
    if (!capturedFile) return
    setScanning(true)
    const pdf = capturedFile.type === 'application/pdf' || capturedFile.name.toLowerCase().endsWith('.pdf')
    setScanMessage(pdf ? 'Leyendo factura PDF...' : 'Preparando imagen...')

    try {
      const { blob, mimeType, fileName } = await prepareFile(capturedFile)
      setScanMessage(pdf ? 'Extrayendo datos del PDF...' : 'Enviando a OCR...')
      const formData = new FormData()
      formData.append('file', blob, fileName)

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
        // Identificación factura
        invoiceNumber: ext.numero_factura || ext.invoiceNumber || '',
        serie: ext.serie || '',
        // Emisor
        issuerName: ext.emisor?.nombre || ext.issuerName || '',
        issuerTaxId: ext.emisor?.nif || ext.issuerTaxId || '',
        issuerAddress: ext.emisor?.direccion || ext.issuerAddress || '',
        // Receptor
        receptorNombre: ext.receptor?.nombre || '',
        receptorNif: ext.receptor?.nif || '',
        receptorDireccion: ext.receptor?.direccion || '',
        // Totales
        taxableBase: ext.totales?.base_imponible?.toString() || ext.taxableBase?.toString() || '',
        vatRate: ext.totales?.tipo_iva?.toString() || ext.vatRate?.toString() || '',
        vatAmount: ext.totales?.cuota_iva?.toString() || ext.vatAmount?.toString() || '',
        irpfRate: ext.totales?.tipo_irpf?.toString() || '',
        irpfAmount: ext.totales?.cuota_irpf?.toString() || '',
        totalFactura: ext.totales?.total_factura?.toString() || ext.total?.toString() || '',
        operationDate: ext.fecha_operacion ? formatDetectedDate(ext.fecha_operacion) : (ext.operationDate ? formatDetectedDate(ext.operationDate) : ''),
        iban: ext.iban || '',
        // Líneas de detalle
        lineas: (ext.lineas || []).map((l: LineaFactura) => ({
          descripcion: l.descripcion || '',
          cantidad: l.cantidad?.toString() || '',
          precio: l.precio_unitario?.toString() || '',
          importe: l.importe?.toString() || '',
        })),
      }))
      setShowForm(true)
      loadTenantReceptor()
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
    loadTenantReceptor()
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
          // Guardar los tipos de IVA definidos en el formulario (si el usuario
          // los editó; si no, no tocamos los del proveedor existente).
          if (ratesTouched) {
            try {
              await fetch(`/api/erp/suppliers/${supplierId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vatRates: supplierVatRates }),
              })
            } catch { /* no bloquea el registro del gasto */ }
          }
        } else {
          const createRes = await fetch('/api/erp/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.supplier,
              category: form.category,
              vatRates: ratesTouched ? supplierVatRates : undefined,
            }),
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
        serie: form.serie || undefined,
        taxableBase: form.taxableBase || undefined,
        vatRate: form.vatRate || undefined,
        vatAmount: form.vatAmount || undefined,
        irpfRate: form.irpfRate || undefined,
        irpfAmount: form.irpfAmount || undefined,
        totalFactura: form.totalFactura || undefined,
        operationDate: form.operationDate || undefined,
        issuerName: form.issuerName || undefined,
        issuerAddress: form.issuerAddress || undefined,
        issuerTaxId: form.issuerTaxId || undefined,
        receptorNombre: form.receptorNombre || undefined,
        receptorNif: form.receptorNif || undefined,
        receptorDireccion: form.receptorDireccion || undefined,
        iban: form.iban || undefined,
        // Líneas de detalle (serializadas para metadata)
        lineas: form.lineas.length > 0 ? form.lineas.map(l => ({
          descripcion: l.descripcion || null,
          cantidad: l.cantidad ? parseFloat(l.cantidad) : null,
          precio_unitario: l.precio ? parseFloat(l.precio) : null,
          importe: l.importe ? parseFloat(l.importe) : null,
        })) : undefined,
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
    setIsPdf(false)
    setCapturedFileName('')
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
      serie: '',
      issuerName: '',
      issuerTaxId: '',
      issuerAddress: '',
      receptorNombre: '',
      receptorNif: '',
      receptorDireccion: '',
      lineas: [],
      taxableBase: '',
      vatRate: '',
      vatAmount: '',
      irpfRate: '',
      irpfAmount: '',
      totalFactura: '',
      operationDate: '',
      iban: '',
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
            <p className="text-sm text-muted-foreground">Toma una foto, sube una imagen o una factura PDF</p>
          </div>
        </div>
      </div>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileCapture} />
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileCapture} />
      <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileCapture} />

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

          <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg" onClick={() => pdfInputRef.current?.click()}>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">Subir Factura PDF</p>
                <p className="text-sm text-muted-foreground">Selecciona un archivo PDF</p>
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

      {(capturedImage || isPdf) && !showForm && (
        <Card>
          <CardContent className="p-4">
            <div className="relative rounded-xl overflow-hidden bg-slate-100">
              {isPdf ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <FileText className="h-24 w-24 text-primary/40" />
                  <p className="text-lg font-semibold text-muted-foreground">{capturedFileName || 'Factura PDF'}</p>
                  <p className="text-sm text-muted-foreground">
                    {(capturedFile ? (capturedFile.size / 1024).toFixed(0) : '?')} KB
                  </p>
                </div>
              ) : (
                <img src={capturedImage!} alt="Captura" className="w-full max-h-[50vh] object-contain" />
              )}
            </div>
            <div className="flex gap-3 mt-4 justify-center flex-wrap">
              <Button variant="outline" onClick={resetAll}>
                {isPdf ? <FileText className="h-4 w-4 mr-2" /> : <Camera className="h-4 w-4 mr-2" />} {isPdf ? 'Nuevo PDF' : 'Nueva Foto'}
              </Button>
              <Button variant="outline" onClick={goToForm}>
                <Receipt className="h-4 w-4 mr-2" /> Sin OCR
              </Button>
              <Button onClick={runScan} disabled={scanning} className="min-w-[180px]">
                {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scan className="h-4 w-4 mr-2" />}
                {scanning ? (scanMessage || 'Escaneando...') : isPdf ? 'Extraer Datos del PDF' : 'Escanear Ticket'}
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
              {(form.receiptUrl && (capturedImage || isPdf)) && (
                <div className="rounded-xl overflow-hidden bg-slate-100 border max-h-[200px] flex items-center justify-center">
                  {isPdf ? (
                    <div className="flex items-center gap-3 px-6 py-8">
                      <FileText className="h-10 w-10 text-primary/40" />
                      <div>
                        <p className="font-medium text-sm">{capturedFileName || 'Factura PDF'}</p>
                        <p className="text-xs text-muted-foreground">Subido como comprobante</p>
                      </div>
                    </div>
                  ) : (
                    <img src={capturedImage || undefined} alt="Comprobante" className="max-w-full max-h-[200px] object-contain" />
                  )}
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
                  <Input
                    value={form.supplier}
                    onChange={e => {
                      setForm(p => ({ ...p, supplier: e.target.value }))
                      setRatesTouched(false)
                    }}
                    onBlur={() => lookupSupplierVatRates(form.supplier)}
                    placeholder="Nombre del proveedor"
                  />
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

              {form.supplier && (
                <div className="space-y-2">
                  <Label>Tipos de IVA del proveedor</Label>
                  <IvaRatesEditor
                    value={supplierVatRates}
                    onChange={v => { setRatesTouched(true); setSupplierVatRates(v) }}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {ratesTouched
                      ? 'Se guardarán en el proveedor al registrar el gasto.'
                      : 'Se cargan automáticamente si el proveedor ya existe en tu base.'}
                  </p>
                </div>
              )}

              {rawOcrText && (
                <details className="border rounded-lg p-3 bg-muted/30">
                  <summary className="font-semibold text-sm cursor-pointer select-none">Texto OCR crudo</summary>
                  <pre className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{rawOcrText}</pre>
                </details>
              )}
              {/* Líneas de detalle extraídas */}
              {form.lineas.length > 0 && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <h4 className="font-semibold text-sm mb-2">Líneas de detalle</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left py-1 pr-2">Descripción</th>
                          <th className="text-right px-2">Cant.</th>
                          <th className="text-right px-2">Precio Ud.</th>
                          <th className="text-right pl-2">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.lineas.map((l, i) => (
                          <tr key={i} className="border-b border-muted-foreground/20">
                            <td className="py-1 pr-2">{l.descripcion}</td>
                            <td className="text-right px-2">{l.cantidad}</td>
                            <td className="text-right px-2">{l.precio ? `${l.precio} €` : '-'}</td>
                            <td className="text-right pl-2">{l.importe ? `${l.importe} €` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <details className="border rounded-lg p-3 bg-muted/30">
                <summary className="font-semibold text-sm cursor-pointer select-none">Datos Fiscales (Verifactu)</summary>
                <div className="space-y-3 mt-3">
                  {/* Nº Factura + Serie */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nº Factura</Label>
                      <Input value={form.invoiceNumber} onChange={e => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} placeholder="F2026-00142" />
                    </div>
                    <div>
                      <Label>Serie</Label>
                      <Input value={form.serie} onChange={e => setForm(p => ({ ...p, serie: e.target.value }))} placeholder="F2026" />
                    </div>
                  </div>

                  {/* Fechas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Fecha Operación</Label>
                      <Input type="date" value={form.operationDate} onChange={e => setForm(p => ({ ...p, operationDate: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Total Factura</Label>
                      <Input type="number" step="0.01" value={form.totalFactura} onChange={e => setForm(p => ({ ...p, totalFactura: e.target.value }))} placeholder="0.00" />
                    </div>
                  </div>

                  {/* Emisor */}
                  <div className="border-b pb-2 mb-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Emisor (Quien vende)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Razón Social</Label>
                      <Input value={form.issuerName} onChange={e => setForm(p => ({ ...p, issuerName: e.target.value }))} placeholder="Nombre o razón social" />
                    </div>
                    <div>
                      <Label>NIF / CIF</Label>
                      <Input value={form.issuerTaxId} onChange={e => setForm(p => ({ ...p, issuerTaxId: e.target.value }))} placeholder="B12345678" />
                    </div>
                  </div>
                  <div>
                    <Label>Domicilio Fiscal</Label>
                    <Input value={form.issuerAddress} onChange={e => setForm(p => ({ ...p, issuerAddress: e.target.value }))} placeholder="C/ Ejemplo 123, 28001 Madrid" />
                  </div>

                  {/* Receptor */}
                  <div className="border-b pb-2 mb-2 mt-4">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Receptor (Cliente)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nombre / Razón Social</Label>
                      <Input value={form.receptorNombre} onChange={e => setForm(p => ({ ...p, receptorNombre: e.target.value }))} placeholder="Nombre del cliente" />
                    </div>
                    <div>
                      <Label>NIF / CIF</Label>
                      <Input value={form.receptorNif} onChange={e => setForm(p => ({ ...p, receptorNif: e.target.value }))} placeholder="12345678Z" />
                    </div>
                  </div>
                  <div>
                    <Label>Domicilio</Label>
                    <Input value={form.receptorDireccion} onChange={e => setForm(p => ({ ...p, receptorDireccion: e.target.value }))} placeholder="Avda. Constitución 12, Sevilla" />
                  </div>

                  {/* Totales e Impuestos */}
                  <div className="border-b pb-2 mb-2 mt-4">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Desglose de Impuestos</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Base Imponible</Label>
                      <Input type="number" step="0.01" value={form.taxableBase} onChange={e => applyTaxableBase(e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <Label>IVA %</Label>
                      {supplierVatRates.length > 0 ? (
                        <div className="flex gap-2">
                          <Select
                            value={form.vatRate && supplierVatRates.map(String).includes(form.vatRate) ? form.vatRate : 'custom'}
                            onValueChange={v => applyVatRate(v === 'custom' ? form.vatRate : v)}
                          >
                            <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                            <SelectContent>
                              {supplierVatRates.map(r => (
                                <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                              ))}
                              <SelectItem value="custom">Otro (manual)</SelectItem>
                            </SelectContent>
                          </Select>
                          {(!form.vatRate || !supplierVatRates.map(String).includes(form.vatRate)) && (
                            <Input type="number" step="0.01" value={form.vatRate} onChange={e => applyVatRate(e.target.value)} placeholder="21" className="w-20" />
                          )}
                        </div>
                      ) : (
                        <Input type="number" step="0.01" value={form.vatRate} onChange={e => applyVatRate(e.target.value)} placeholder="21" />
                      )}
                    </div>
                    <div>
                      <Label>Cuota IVA</Label>
                      <Input type="number" step="0.01" value={form.vatAmount} onChange={e => setForm(p => ({ ...p, vatAmount: e.target.value }))} placeholder="0.00" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>IRPF % (Retención)</Label>
                      <Input type="number" step="0.01" value={form.irpfRate} onChange={e => applyIrpfRate(e.target.value)} placeholder="15" />
                    </div>
                    <div>
                      <Label>Cuota IRPF</Label>
                      <Input type="number" step="0.01" value={form.irpfAmount} onChange={e => setForm(p => ({ ...p, irpfAmount: e.target.value }))} placeholder="-240.00" />
                    </div>
                  </div>

                  {/* Tramos de IVA: varias bases con distintos tipos */}
                  <div className="border-t pt-3 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tramos de IVA (varias bases)</span>
                      <Button type="button" variant="outline" size="sm" onClick={addIvaRow} className="rounded-lg h-7 text-[10px] font-bold uppercase">Añadir tramo</Button>
                    </div>
                    {ivaRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Si la factura tiene varias bases con distintos tipos de IVA (p. ej. 21% y 10%), añade un tramo por cada una.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {ivaRows.map(row => (
                          <div key={row.id} className="grid grid-cols-[1fr_90px_110px_auto] gap-2 items-center">
                            <Input type="number" step="0.01" placeholder="Base imponible" value={row.base} onChange={e => updateIvaRow(row.id, 'base', e.target.value)} className="h-9 rounded-lg" />
                            <Input type="number" step="0.01" placeholder="IVA %" value={row.rate} onChange={e => updateIvaRow(row.id, 'rate', e.target.value)} className="h-9 rounded-lg" />
                            <span className="text-xs font-bold text-slate-600 text-right">€{computePercentageAmount(row.base, row.rate) || '0.00'}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => removeIvaRow(row.id)} aria-label="Quitar tramo">×</Button>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs font-black pt-2 border-t">
                          <span>Base total: <span className="text-foreground">€{ivaTotals.base.toFixed(2)}</span></span>
                          <span>IVA total: <span className="text-foreground">€{ivaTotals.vat.toFixed(2)}</span></span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Los totales se sincronizan con el desglose superior (Base Imponible / Cuota IVA).</p>
                      </div>
                    )}
                  </div>

                  {totalsMismatch && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-tight">Los totales no cuadran</p>
                        <p className="text-xs font-medium">
                          Base + IVA − IRPF = <span className="font-bold">€{totalsMismatch.expected.toFixed(2)}</span>, pero el total de la factura es{' '}
                          <span className="font-bold">€{parseFloat(form.totalFactura).toFixed(2)}</span> (diferencia{' '}
                          <span className="font-bold">€{totalsMismatch.difference.toFixed(2)}</span>). Revisa los importes antes de guardar.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* IBAN */}
                  <div className="border-b pb-2 mb-2 mt-4">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pago</span>
                  </div>
                  <div>
                    <Label>IBAN</Label>
                    <Input value={form.iban} onChange={e => setForm(p => ({ ...p, iban: e.target.value }))} placeholder="ES9100491234561234567890" />
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
