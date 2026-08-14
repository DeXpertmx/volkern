'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Camera, Receipt, Scan, Loader2, ArrowLeft, CheckCircle2, Image as ImageIcon, FileText, AlertTriangle, Check, ChevronsUpDown, Plus, MousePointerClick, Sparkles, Save, X } from 'lucide-react'
import IvaRatesEditor from '@/components/finance/IvaRatesEditor'
import OcrCorrectionModal from '@/components/finance/OcrCorrectionModal'
import OcrComparisonModal, { type ComparisonItem } from '@/components/finance/OcrComparisonModal'
import { computeVatAmount, computePercentageAmount, computeInvoiceTotalMismatch, fillEmptyTranches, fillLastTranche } from '@/lib/finance/vat'
import { validateFiscalId, getFiscalIdConfigsByCountry, normalizarPais } from '@/lib/fiscal-validation'
import { applyVatRowTemplate, associateVatRowsByPosition, sanitizeSupplierName, vatRowGeometry, type VatRowGeometry } from '@/lib/invoice-parser'
import { applyTemplate, findRegionForValue, getOcrFieldDef, sameFieldValue, validateReference, valuesEquivalent, type OcrOverlay, type OcrTemplateField, type RegionProposal, type VatRowTemplate } from '@/lib/finance/ocr-template'
import { buildExpenseEntryProposal } from '@/lib/finance/expense-entry-proposal'
import { EXPENSE_CATEGORIES } from '@/lib/finance/expense-categories'
import { createPdfFromPageRange, detectPdfDocumentGroups, renderPdfPages, type PdfDocumentGroup } from '@/lib/finance/pdf-render'

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

interface DesgloseIva {
  tipo: number
  base: number
  cuota: number
}

interface TotalesFactura {
  base_imponible: number | null
  tipo_iva: number | null
  cuota_iva: number | null
  tipo_irpf: number | null
  cuota_irpf: number | null
  tipo_recargo: number | null
  cuota_recargo: number | null
  total_factura: number | null
  desglose_iva?: DesgloseIva[]
}

interface ExtractedData {
  // Nuevos campos estructurados
  numero_factura: string | null
  serie: string | null
  fecha_emision: string | null
  fecha_operacion: string | null
  fecha_vencimiento: string | null
  moneda: string | null
  forma_pago: string | null
  regimen_fiscal: string | null
  tipo_operacion: string | null
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

// Extrae streetName/postalCode/city de un domicilio en formato libre
function parseSupplierAddress(addr: string): { streetName?: string; postalCode?: string; city?: string } {
  if (!addr) return {}
  const postal = addr.match(/\b(\d{5})\b/)
  const postalCode = postal ? postal[1] : undefined
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  const streetName = parts[0] || undefined
  let city = parts.length > 1 ? parts[parts.length - 1] : undefined
  if (city) {
    if (postalCode) city = city.replace(postalCode, '')
    city = city.replace(/^[,\s]+|[,\s]+$/g, '').trim() || undefined
  }
  return { streetName, postalCode, city }
}

// Compone el domicilio de un proveedor registrado para el campo Emisor
function buildSupplierAddress(s: any): string {
  const street = [s.streetType, s.streetName, s.streetNumber].filter(Boolean).join(' ')
  const extra = [s.postalCode, s.city, s.province].filter(Boolean).join(', ')
  return [street, extra].filter(Boolean).join(', ')
}

// Países con configuración fiscal (los mismos que usa el validador de perfiles)
const SUPPLIER_COUNTRIES = [
  'España', 'México', 'Estados Unidos', 'Chile', 'Argentina', 'Colombia',
  'Perú', 'Brasil', 'Reino Unido', 'Alemania', 'Francia', 'Italia', 'Portugal',
]

// Detecta el tipo de ID fiscal español por su formato (NIF/CIF/NIE)
function detectTipoIdEspanol(id: string): 'NIF' | 'CIF' | 'NIE' | null {
  const clean = id.trim().toUpperCase()
  if (/^[XYZ]/.test(clean)) return 'NIE'
  if (/^\d/.test(clean)) return 'NIF'
  if (/^[A-Z]/.test(clean)) return 'CIF'
  return null
}

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
  // Cajas de palabras del OCR (TextOverlay) para el visualizador de corrección
  const [scanOverlay, setScanOverlay] = useState<OcrOverlay | null>(null)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  // Comparación lado a lado entre el OCR genérico y la plantilla (confirmar antes de aplicar)
  const [comparisonItems, setComparisonItems] = useState<ComparisonItem[] | null>(null)
  // Plantilla que se auto-aplicó: para actualizar sus referencias al confirmar
  const [appliedTemplateRef, setAppliedTemplateRef] = useState<{ id: string; supplierName: string; nif?: string | null; fields: OcrTemplateField[] } | null>(null)
  // Primera página del PDF renderizada a imagen con pdf.js (para el visualizador)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewPages, setPdfPreviewPages] = useState<string[]>([])
  const [pdfGroups, setPdfGroups] = useState<PdfDocumentGroup[]>([])
  const [selectedPdfGroupId, setSelectedPdfGroupId] = useState<string | null>(null)
  const [pdfInboxDocumentIds, setPdfInboxDocumentIds] = useState<Record<string, string>>({})
  const [pdfBatchLoading, setPdfBatchLoading] = useState(false)
  // Aprendizaje automático: regiones propuestas al corregir campos a mano tras
  // el escaneo (campo de formulario → propuesta detectada sobre la imagen)
  const [ocrProposals, setOcrProposals] = useState<Record<string, RegionProposal>>({})
  const [proposalBusy, setProposalBusy] = useState<Record<string, boolean>>({})
  const [savingProposal, setSavingProposal] = useState<string | null>(null)
  // Propuesta mostrada dentro del visualizador ("Ver en imagen")
  const [ocrProposalForModal, setOcrProposalForModal] = useState<{ field: string; label: string; region: OcrTemplateField; matchedText: string } | null>(null)
  // Datos que extrajo el escaneo (para distinguir la corrección manual) y
  // overlay local cacheados para proponer regiones sin re-detectar
  const scannedExtRef = useRef<ExtractedData | null>(null)
  const localOverlayRef = useRef<OcrOverlay | null>(null)
  const localOverlayLoadedRef = useRef(false)
  const proposalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  const [duplicateCandidate, setDuplicateCandidate] = useState<{ body: Record<string, any>; message: string; duplicate?: { id?: string; invoiceNumber?: string | null; amount?: number; date?: string; currency?: string; description?: string } } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showSelect, setShowSelect] = useState(true)
  // Tipos de IVA del proveedor: se ofrecen como opciones para el IVA % y se
  // guardan en el proveedor al registrar el gasto.
  const [supplierVatRates, setSupplierVatRates] = useState<number[]>([])
  // Si el usuario editó los tipos manualmente, el lookup no debe sobreescribirlos
  const [ratesTouched, setRatesTouched] = useState(false)
  // Tramos de IVA (varias bases con distintos tipos) para facturas mixtas
  const [ivaRows, setIvaRows] = useState<{ id: number; base: string; rate: string }[]>([])
  const ivaRowsRef = useRef(ivaRows)
  ivaRowsRef.current = ivaRows
  const nextIvaRowId = useRef(0)
  // Total base a repartir entre los tramos (los vacíos se autocompletan)
  const [trancheTarget, setTrancheTarget] = useState('')
  // Modo de reparto: 'equal' reparte a partes iguales entre los vacíos;
  // 'last' deja los intermedios vacíos y solo el último absorbe el resto
  const [trancheMode, setTrancheMode] = useState<'equal' | 'last'>('equal')
  // Tramos que el usuario vació a propósito: no se autocompletan
  const [lockedEmptyRows, setLockedEmptyRows] = useState<Set<number>>(new Set())
  // Proveedores registrados: lista para el buscador y proveedor seleccionado
  const [allSuppliers, setAllSuppliers] = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierQuery, setSupplierQuery] = useState('')
  const [registeringSupplier, setRegisteringSupplier] = useState(false)
  // Modal de registro: completa la ficha del nuevo proveedor
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [supplierModal, setSupplierModal] = useState({ name: '', taxId: '', email: '', phone: '', category: 'otros', pais: 'España', vatRates: [] as number[] })
  const [supplierTaxIdError, setSupplierTaxIdError] = useState('')

  // Carga la lista de proveedores registrados al abrir el formulario
  useEffect(() => {
    if (!showForm) return
    fetch('/api/erp/suppliers')
      .then(r => r.json())
      .then(list => { if (Array.isArray(list)) setAllSuppliers(list) })
      .catch(() => { /* el buscador sigue funcionando con lo que haya */ })
  }, [showForm])

  // Entrada directa al formulario manual (?manual=1), p. ej. desde
  // "Registrar Gasto" del listado
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('manual') === '1') goToForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Aplica un tipo de IVA y recalcula la cuota si hay base imponible
  const applyVatRate = (rate: string) => {
    setForm(p => {
      // Con tramos activos el IVA % del desglose es solo informativo (los
      // tramos mandan); la cuota se recalcula desde las filas al sincronizar.
      if (ivaRows.length > 0) return { ...p, vatRate: rate }
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

  // Aplica el recargo de equivalencia y lo recalcula sobre la base total.
  // En facturas con varios tipos de IVA el usuario puede corregir la cuota
  // manualmente si el proveedor usa tipos de recargo distintos por tramo.
  const applySurchargeRate = (rate: string) => {
    setForm(p => ({
      ...p,
      surchargeRate: rate,
      surchargeAmount: computePercentageAmount(p.taxableBase, rate) || p.surchargeAmount,
    }))
  }

  // Aplica la base imponible y recalcula cuota de IVA y retención de IRPF
  const applyTaxableBase = (base: string) => {
    // Con tramos activos, la base imponible es el total a repartir: los
    // tramos vacíos se rellenan para cuadrarla y el desglose se recalcula.
    if (ivaRows.length > 0) {
      setTrancheTarget(base)
      const rows = applyDistribution(ivaRows, base)
      setIvaRows(rows)
      syncTotalsFromRows(rows)
      return
    }
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
    dueDate: '',
    currency: 'EUR',
    paymentMethod: '',
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
    surchargeRate: '',
    surchargeAmount: '',
    taxRegime: '',
    operationType: '',
    totalFactura: '',
    operationDate: '',
    iban: '',
  })

  // Ref con el form siempre actual (para usarlo en flujos async tras el OCR)
  const formRef = useRef(form)
  formRef.current = form

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

  // ─── Tramos de IVA: reparto automático del total ─────────────────────
  // Rellena los tramos vacíos (no bloqueados) para que la suma de bases
  // cuadre con el total a repartir. Devuelve las filas resultantes.
  const applyDistribution = (rows: typeof ivaRows, target?: string, mode?: 'equal' | 'last') => {
    const t = target ?? trancheTarget
    const parsed = parseFloat(t)
    if (!Number.isFinite(parsed) || parsed <= 0) return rows
    const fillable = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !(parseFloat(r.base) > 0) && !lockedEmptyRows.has(r.id))
      .map(({ i }) => i)
    const m = mode ?? trancheMode
    const distributed = m === 'last'
      ? fillLastTranche(rows, parsed, fillable)
      : fillEmptyTranches(rows, parsed, fillable)
    return distributed ? rows.map((r, i) => ({ ...r, base: distributed[i] })) : rows
  }

  // Cambia el modo de reparto y reaplica la distribución con el nuevo modo
  const changeTrancheMode = (mode: 'equal' | 'last') => {
    setTrancheMode(mode)
    const rows = applyDistribution(ivaRows, trancheTarget, mode)
    setIvaRows(rows)
    syncTotalsFromRows(rows)
  }

  const addIvaRow = () => {
    // El primer tramo arranca con los valores actuales del desglose único
    const rows = ivaRows.length === 0 && (form.taxableBase || form.vatRate)
      ? [{ id: nextIvaRowId.current++, base: form.taxableBase, rate: form.vatRate }]
      : [...ivaRows, { id: nextIvaRowId.current++, base: '', rate: '' }]
    // El total a repartir arranca con la base imponible o el total del OCR
    const target = trancheTarget || form.taxableBase || form.totalFactura
    if (target) setTrancheTarget(target)
    const withDist = applyDistribution(rows, target)
    setIvaRows(withDist)
    syncTotalsFromRows(withDist)
  }

  const updateIvaRow = (id: number, field: 'base' | 'rate', value: string) => {
    const prev = ivaRows.find(r => r.id === id)?.[field] || ''
    let rows = ivaRows.map(r => (r.id === id ? { ...r, [field]: value } : r))
    if (field === 'base') {
      // Si el usuario vacía un tramo a propósito, no lo autocompletamos
      const isEmpty = !(parseFloat(value) > 0)
      setLockedEmptyRows(prev => {
        const next = new Set(prev)
        if (isEmpty) next.add(id)
        else next.delete(id)
        return next
      })
      rows = applyDistribution(rows)
    }
    setIvaRows(rows)
    syncTotalsFromRows(rows)
    // Corrección manual de un tramo: proponer la región para la plantilla
    maybeProposeTrancheRegion(id, field, prev, value)
  }

  const removeIvaRow = (id: number) => {
    const rows = ivaRows.filter(r => r.id !== id)
    setLockedEmptyRows(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    const withDist = applyDistribution(rows)
    setIvaRows(withDist)
    if (withDist.length > 0) syncTotalsFromRows(withDist)
  }

  // ─── Proveedor: selección, autofill del emisor y registro ────────────
  // Crea tramos de IVA automáticamente según los tipos de IVA del proveedor.
  // `override=true` (auto-match tras el OCR) reemplaza los tramos detectados
  // por los tipos registrados del proveedor: son la fuente fiable de sus IVAs.
  const autoCreateTramos = (rates: number[] | undefined | null, override = false) => {
    if (!Array.isArray(rates) || rates.length === 0) return
    if (!override && ivaRowsRef.current.length > 0) return // no pisa tramos ya detectados o introducidos
    const rows = rates.map(r => ({ id: nextIvaRowId.current++, base: '', rate: String(r) }))
    const target = trancheTarget || formRef.current.taxableBase || ''
    if (target) setTrancheTarget(target)
    const withDist = applyDistribution(rows, target)
    setIvaRows(withDist)
    setLockedEmptyRows(new Set())
    syncTotalsFromRows(withDist)
  }

  // Selección de un proveedor registrado: rellena emisor y crea los tramos
  // Carga el desglose que devolvió la IA/OCR en los tramos editables del
  // formulario. Conserva los tres (o más) tipos y sus bases individuales.
  const applyDetectedVatBreakdown = (breakdown: unknown) => {
    if (!Array.isArray(breakdown)) return false
    const valid = breakdown
      .map((row: any) => ({
        tipo: Number(row?.tipo ?? row?.tipo_iva ?? row?.rate),
        base: Number(row?.base ?? row?.base_imponible),
        cuota: Number(row?.cuota ?? row?.cuota_iva ?? row?.amount),
      }))
      .filter(row => Number.isFinite(row.tipo) && Number.isFinite(row.base) && row.base >= 0 && Number.isFinite(row.cuota))
    // Aunque el modelo devuelva una sola fila, la materializamos como tramo
    // para que el usuario vea el IVA aplicado y pueda añadir más tramos.
    if (valid.length === 0) return false

    const rows = valid.map(row => ({
      id: nextIvaRowId.current++,
      base: row.base.toFixed(2),
      rate: row.tipo.toString(),
    }))
    const totalBase = valid.reduce((sum, row) => sum + row.base, 0)
    const totalVat = valid.reduce((sum, row) => sum + row.cuota, 0)
    const rates = valid.map(row => row.tipo.toString())
    const uniform = new Set(rates).size === 1 ? rates[0] : ''
    setIvaRows(rows)
    setTrancheTarget(totalBase.toFixed(2))
    setLockedEmptyRows(new Set())
    setForm(p => ({
      ...p,
      taxableBase: totalBase.toFixed(2),
      vatAmount: totalVat.toFixed(2),
      vatRate: uniform,
    }))
    return true
  }

  // Proveedores de visión sin coordenadas (OpenRouter/Gemini/DeepSeek) no
  // devuelven cajas de palabras y a veces no leen los tramos de IVA. Detecta
  // las palabras localmente y reconstruye el desglose por la posición de las
  // filas de impuestos en la imagen. Corre en segundo plano y no pisa tramos
  // que el usuario ya haya empezado a editar.
  const improveBreakdownFromImage = async (ext: ExtractedData) => {
    try {
      const boxes = await detectLocalBoxes()
      if (!boxes) return
      const improved = associateVatRowsByPosition(boxes, ext.totales?.desglose_iva || [], ext.totales)
      if (improved.length === 0) return
      if (ivaRowsRef.current.length > 0) return // el usuario ya editó tramos a mano
      applyDetectedVatBreakdown(improved)
    } catch { /* silencioso: los tramos se pueden completar a mano */ }
  }

  // Empareja los tramos confirmados en el formulario con las filas geométricas
  // del overlay (por tipo y base, con fallback por orden) para guardar la
  // posición de cada columna en la plantilla del proveedor.
  const matchTramosToGeometry = (rows: { base: string; rate: string }[], geometry: VatRowGeometry[]): VatRowTemplate[] => {
    const used = new Set<number>()
    const out: VatRowTemplate[] = []
    const eq = (a: number, b: number) => Math.abs(a - b) < 0.02
    for (const row of rows) {
      const rate = Number(row.rate)
      const base = Number(row.base)
      if (!Number.isFinite(rate) || !Number.isFinite(base)) continue
      const exact = geometry.findIndex((g, i) => !used.has(i) && eq(g.tipo, rate) && eq(g.base, base))
      const idx = exact >= 0 ? exact : geometry.findIndex((g, i) => !used.has(i) && eq(g.tipo, rate))
      if (idx < 0) continue
      used.add(idx)
      const g = geometry[idx]
      const cuotaNum = Number(computePercentageAmount(row.base, row.rate))
      out.push({
        rate: g.rateRegion,
        base: g.baseRegion,
        cuota: g.cuotaRegion,
        reference: { tipo: rate, base, cuota: Number.isFinite(cuotaNum) ? cuotaNum : g.cuota },
        page: g.page,
      })
    }
    return out
  }

  // Al confirmar el gasto con tramos materializados, aprende la posición de
  // sus filas de IVA en la plantilla del proveedor: el siguiente escaneo las
  // extraerá por geometría sin re-detectar ni re-asociar. Silencioso y en
  // segundo plano (no bloquea el guardado).
  const saveVatRowTemplate = async () => {
    const rows = ivaRowsRef.current
    if (rows.length === 0) return
    const supplierName = (formRef.current.supplier || formRef.current.issuerName || '').trim()
    if (!supplierName) return
    try {
      const overlay = await getEffectiveOverlay()
      if (!overlay) return
      const geometry = vatRowGeometry(overlay, 1)
      if (geometry.length === 0) return
      const vatRows = matchTramosToGeometry(rows, geometry)
      if (vatRows.length === 0) return
      const q = new URLSearchParams({ supplierName })
      if (formRef.current.issuerTaxId) q.set('nif', formRef.current.issuerTaxId)
      const listRes = await fetch(`/api/erp/expenses/ocr-templates?${q.toString()}`)
      const listData = await listRes.json()
      const templates = Array.isArray(listData?.templates) ? listData.templates : []
      const body: Record<string, any> = {
        supplierName,
        nif: formRef.current.issuerTaxId || undefined,
        vatRows,
      }
      if (templates.length > 0) {
        // Fusionar en la más reciente (la más probable para este formato)
        body.templateId = templates[0].id
        body.name = templates[0].name
      }
      const res = await fetch('/api/erp/expenses/ocr-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) return
      console.log(`[OcrVat] ${vatRows.length} tramo${vatRows.length !== 1 ? 's' : ''} aprendido${vatRows.length !== 1 ? 's' : ''} en la plantilla de ${supplierName}`)
    } catch { /* silencioso: se re-aprenderá en el próximo guardado */ }
  }

  const selectSupplier = (s: any, fromOcrAutoMatch = false) => {
    setSelectedSupplier(s)
    setSupplierQuery('')
    setSupplierOpen(false)
    setRatesTouched(false)
    setSupplierVatRates(Array.isArray(s.vatRates) ? s.vatRates : [])
    setForm(p => ({
      ...p,
      supplier: s.name,
      issuerName: p.issuerName || s.name || '',
      issuerTaxId: p.issuerTaxId || s.taxId || '',
      issuerAddress: p.issuerAddress || buildSupplierAddress(s),
    }))
    // Tras el OCR, los tipos del proveedor mandan sobre los detectados
    autoCreateTramos(s.vatRates, fromOcrAutoMatch)
  }

  // Proveedor no registrado: usar el nombre tecleado como nuevo proveedor
  const chooseNewSupplier = (name: string) => {
    const clean = name.trim()
    setSelectedSupplier(null)
    setSupplierQuery('')
    setSupplierOpen(false)
    setRatesTouched(false)
    setSupplierVatRates([])
    setForm(p => ({
      ...p,
      supplier: clean,
      issuerName: p.issuerName || clean,
    }))
  }

  // Tras el OCR: si el proveedor detectado ya está registrado, aplica sus
  // datos (emisor, tipos de IVA y tramos) automáticamente.
  const matchSupplierByName = async (name: string | null) => {
    if (!name || !name.trim()) return
    try {
      const res = await fetch(`/api/erp/suppliers?search=${encodeURIComponent(name.trim())}`)
      const list = await res.json()
      if (!Array.isArray(list) || list.length === 0) return
      const exact = list.find((s: any) => (s.name || '').toLowerCase() === name.trim().toLowerCase())
      const s = exact || list[0]
      selectSupplier(s, true)
      setAllSuppliers(prev => (prev.some(p => p.id === s.id) ? prev : [...prev, s]))
    } catch {
      /* silencioso: el usuario puede elegir el proveedor en el buscador */
    }
  }

  // Abre el modal para completar la ficha del nuevo proveedor
  const openSupplierModal = () => {
    setSupplierModal({
      name: form.supplier,
      taxId: form.issuerTaxId || '',
      email: '',
      phone: '',
      category: form.category,
      pais: 'España',
      vatRates: [...supplierVatRates],
    })
    setSupplierTaxIdError('')
    setSupplierModalOpen(true)
  }

  // Valida el NIF/CIF con la misma lógica fiscal que los perfiles
  const validateModalTaxId = (): string | null => {
    const id = supplierModal.taxId.trim()
    if (!id) return null // opcional: sin ID no se valida
    const paisCode = normalizarPais(supplierModal.pais) || supplierModal.pais
    const configs = getFiscalIdConfigsByCountry(paisCode)
    if (configs.length === 0) return null // país sin configuración → aceptar
    const tipos: string[] = paisCode === 'ES'
      ? [detectTipoIdEspanol(id)].filter((t): t is 'NIF' | 'CIF' | 'NIE' => t !== null)
      : configs.map(c => c.tipoId)
    if (tipos.length === 0) return 'Formato de NIF/CIF no reconocido (NIF, CIF o NIE).'
    for (const tipo of tipos) {
      if (validateFiscalId(paisCode, tipo, id).valid) return null
    }
    return `El identificador fiscal no es válido para ${supplierModal.pais}. Revisa el formato o el país.`
  }

  // Guarda el proveedor con la ficha completa (email, teléfono, categoría…)
  const submitSupplierRegistration = async () => {
    const name = supplierModal.name.trim()
    if (!name) {
      toast.error('El nombre del proveedor es obligatorio')
      return
    }
    const taxIdError = validateModalTaxId()
    if (taxIdError) {
      setSupplierTaxIdError(taxIdError)
      toast.error(taxIdError)
      return
    }
    setRegisteringSupplier(true)
    try {
      const res = await fetch('/api/erp/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          taxId: supplierModal.taxId.trim() || undefined,
          email: supplierModal.email.trim() || undefined,
          phone: supplierModal.phone.trim() || undefined,
          category: supplierModal.category,
          country: supplierModal.pais,
          vatRates: supplierModal.vatRates.length > 0 ? supplierModal.vatRates : undefined,
          ...parseSupplierAddress(form.issuerAddress),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al registrar proveedor')
        return
      }
      setSelectedSupplier(data)
      setAllSuppliers(prev => [...prev.filter(p => p.id !== data.id), data].sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setSupplierModalOpen(false)
      // Los tipos de IVA del modal pasan al formulario (el proveedor ya los tiene)
      setSupplierVatRates(supplierModal.vatRates)
      setRatesTouched(false)
      // Si el usuario corrigió el nombre en el modal, se refleja en el gasto
      setForm(p => ({
        ...p,
        supplier: data.name,
        issuerName: p.issuerName || data.name,
        issuerTaxId: p.issuerTaxId || data.taxId || '',
      }))
      // Crea los tramos de IVA según los tipos registrados. Si el OCR ya
      // creó tramos detectados, los tipos elegidos para el proveedor mandan.
      autoCreateTramos(supplierModal.vatRates, true)
      toast.success(`Proveedor «${data.name}» registrado`)
    } catch {
      toast.error('Error de conexión al registrar proveedor')
    } finally {
      setRegisteringSupplier(false)
    }
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

  const entryProposal = buildExpenseEntryProposal({
    category: form.category,
    amount: form.totalFactura || form.amount,
    taxableBase: form.taxableBase,
    vatRate: form.vatRate,
    vatAmount: form.vatAmount,
    irpfAmount: form.irpfAmount,
    surchargeAmount: form.surchargeAmount,
    operationType: form.operationType || (form.taxRegime === 'recargo_equivalencia' ? 'recargo_equivalencia' : 'nacional'),
    vatBreakdown: ivaRows
      .map(row => ({
        rate: parseFloat(row.rate),
        base: parseFloat(row.base),
        amount: parseFloat(computePercentageAmount(row.base, row.rate)),
      }))
      .filter(row => Number.isFinite(row.rate) && Number.isFinite(row.base) && Number.isFinite(row.amount)),
  })

  // ─── Receptor: pre-rellena con los datos fiscales del tenant (emisor) ──
  const loadTenantReceptor = async () => {
    try {
      // No limitar la consulta a `esPrincipal=true`: perfiles fiscales antiguos
      // pueden no tener ese indicador aunque sean el único perfil activo del
      // tenant. El API ordena el principal primero y después los demás.
      const res = await fetch('/api/configuracion/fiscal/emisores?activo=true')
      if (!res.ok) return
      const data = await res.json()
      const emisores = Array.isArray(data?.emisores) ? data.emisores : []
      const emisor = emisores.find((item: any) => item.esPrincipal) || emisores[0]
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

  // Aviso de conciliación: base + IVA + recargo − IRPF debe cuadrar con el total OCR
  const totalsMismatch = computeInvoiceTotalMismatch(form.taxableBase, form.vatAmount, form.irpfAmount, form.totalFactura, form.surchargeAmount)

  const handleFileCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    setCapturedFile(file)
    setCapturedFileName(file.name)
    setIsPdf(pdf)
    setCapturedImage(pdf ? null : URL.createObjectURL(file))
    setPdfPreviewUrl(null)
    setPdfPreviewPages([])
    setPdfGroups([])
    setSelectedPdfGroupId(null)
    setPdfInboxDocumentIds({})
    setPdfBatchLoading(false)
    setScanOverlay(null)
    setIvaRows([])
    setTrancheTarget('')
    setLockedEmptyRows(new Set())
    setShowSelect(false)
    setShowForm(false)
    setScanResult(null)
    if (pdf) {
      setPdfBatchLoading(true)
      detectPdfDocumentGroups(file)
        .then(async groups => {
          setPdfGroups(groups)
          setSelectedPdfGroupId(groups[0]?.id || null)
          // Persistir el lote en la bandeja una sola vez: las entradas comparten
          // el archivo original y conservan su rango de páginas.
          const inboxForm = new FormData()
          inboxForm.append('file', file, file.name)
          inboxForm.append('groups', JSON.stringify(groups.map(group => ({ label: group.label, pageStart: group.pageStart, pageEnd: group.pageEnd }))))
          const inboxResponse = await fetch('/api/erp/expenses/inbox', { method: 'POST', body: inboxForm })
          if (inboxResponse.ok) {
            const inboxData = await inboxResponse.json()
            const ids: Record<string, string> = {}
            ;(inboxData.documents || []).forEach((document: any, index: number) => {
              if (groups[index]) ids[groups[index].id] = document.id
            })
            setPdfInboxDocumentIds(ids)
          }
        })
        .catch(() => {
          setPdfGroups([])
          setSelectedPdfGroupId(null)
          setPdfInboxDocumentIds({})
        })
        .finally(() => setPdfBatchLoading(false))
    }
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
      let scanFile = capturedFile
      const selectedGroup = pdfGroups.find(group => group.id === selectedPdfGroupId)
      if (pdf && selectedGroup && (selectedGroup.pageStart > 1 || selectedGroup.pageEnd < Math.max(...pdfGroups.map(group => group.pageEnd)))) {
        setScanMessage(`Separando ${selectedGroup.label} (páginas ${selectedGroup.pageStart}-${selectedGroup.pageEnd})...`)
        scanFile = await createPdfFromPageRange(capturedFile, selectedGroup.pageStart, selectedGroup.pageEnd, `${selectedGroup.label.replace(/[^a-z0-9_-]+/gi, '_')}.pdf`)
        setCapturedFile(scanFile)
        setCapturedFileName(scanFile.name)
      }
      const { blob, mimeType, fileName } = await prepareFile(scanFile)
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
      const inboxId = selectedPdfGroupId ? pdfInboxDocumentIds[selectedPdfGroupId] : null
      if (inboxId) {
        fetch('/api/erp/expenses/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: inboxId, status: 'REVIEW', extractedData: data.extracted || null }),
        }).catch(() => { /* el escaneo continúa aunque la bandeja no responda */ })
      }
      setRawOcrText(data.rawText || '')
      setScanOverlay(data.overlay || null)
      const ext: ExtractedData = data.extracted
      // Proveedores de visión sin coordenadas: si no leyeron el desglose de
      // IVA, intentar recuperarlo por la posición de las filas en la imagen
      // (detección local de palabras en segundo plano).
      if (!data.overlay && (!ext.totales?.desglose_iva || ext.totales.desglose_iva.length === 0)) {
        void improveBreakdownFromImage(ext)
      }
      // Aprendizaje automático: este escaneo es la referencia para saber si el
      // usuario corrige un campo a mano (y qué valor corregir sobre la imagen).
      scannedExtRef.current = ext
      setOcrProposals({})
      localOverlayRef.current = null
      localOverlayLoadedRef.current = false
      // El nombre del proveedor llega ya saneado por la API, pero protegemos
      // aquí también por si llega de otro flujo: solo la razón social, sin
      // fechas, moneda ni etiquetas de la cabecera de la factura.
      const safeSupplier = sanitizeSupplierName(ext.supplier ?? ext.issuerName) ?? ''
      setForm(prev => ({
        ...prev,
        description: safeSupplier ? `Gasto en ${safeSupplier}` : '',
        amount: ext.total ? ext.total.toString() : '',
        supplier: safeSupplier,
        category: ext.category || 'otros',
        date: ext.date ? formatDetectedDate(ext.date) : prev.date,
        dueDate: ext.fecha_vencimiento ? formatDetectedDate(ext.fecha_vencimiento) : '',
        currency: ext.moneda || 'EUR',
        paymentMethod: ext.forma_pago || '',
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
        surchargeRate: ext.totales?.tipo_recargo?.toString() || '',
        surchargeAmount: ext.totales?.cuota_recargo?.toString() || '',
        taxRegime: ext.regimen_fiscal || '',
        operationType: ext.tipo_operacion || '',
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
      // Si la factura tiene varios tipos de IVA, materializarlos como tramos
      // inmediatamente; antes solo se conservaba el IVA principal.
      applyDetectedVatBreakdown(ext.totales?.desglose_iva)
      setShowForm(true)
      loadTenantReceptor()
      matchSupplierByName(ext.supplier)
      // Si este proveedor ya tiene plantilla aprendida, corregir con ella
      applySavedTemplate(ext, data.overlay || null)
      // PDF: renderizar la primera página para poder anotar sobre la imagen
      if (pdf) ensurePdfPreview()
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedFile, pdfGroups, selectedPdfGroupId, pdfInboxDocumentIds])

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

  // ─── Corrección con plantilla: mapea valores extraídos por región al form ──
  // `values` viene del modal o del auto-aplicado: { field → texto normalizado }
  const mergeTemplateValues = (values: Record<string, string>) => {
    setForm(p => {
      const next = { ...p }
      if (values.fecha_emision) next.date = formatDetectedDate(values.fecha_emision)
      if (values.fecha_operacion) next.operationDate = formatDetectedDate(values.fecha_operacion)
      if (values.fecha_vencimiento) next.dueDate = formatDetectedDate(values.fecha_vencimiento)
      if (values.numero_factura) next.invoiceNumber = values.numero_factura
      if (values.moneda) next.currency = values.moneda.toUpperCase()
      if (values.forma_pago) next.paymentMethod = values.forma_pago
      if (values.base_imponible) next.taxableBase = values.base_imponible
      if (values.tipo_iva) next.vatRate = values.tipo_iva
      if (values.cuota_iva) next.vatAmount = values.cuota_iva
      if (values.tipo_irpf) next.irpfRate = values.tipo_irpf
      if (values.cuota_irpf) next.irpfAmount = values.cuota_irpf
      if (values.tipo_recargo) next.surchargeRate = values.tipo_recargo
      if (values.cuota_recargo) next.surchargeAmount = values.cuota_recargo
      if (values.regimen_fiscal) next.taxRegime = values.regimen_fiscal
      if (values.tipo_operacion) next.operationType = values.tipo_operacion
      if (values.total_factura) {
        next.totalFactura = values.total_factura
        next.amount = values.total_factura
      }
      if (values.emisor_nombre) {
        next.issuerName = values.emisor_nombre
        next.supplier = next.supplier || values.emisor_nombre
      }
      if (values.emisor_nif) next.issuerTaxId = values.emisor_nif
      if (values.emisor_direccion) next.issuerAddress = values.emisor_direccion
      if (values.receptor_nombre) next.receptorNombre = values.receptor_nombre
      if (values.receptor_nif) next.receptorNif = values.receptor_nif
      if (values.receptor_direccion) next.receptorDireccion = values.receptor_direccion
      if (values.iban) next.iban = values.iban
      return next
    })
  }

  // Renderiza todas las páginas del PDF una sola vez para que el visualizador
  // pueda navegar por facturas multipágina.
  const ensurePdfPreview = useCallback(async (): Promise<string | null> => {
    if (!isPdf || !capturedFile) return null
    if (pdfPreviewPages.length > 0) return pdfPreviewPages[0]
    try {
      const pages = await renderPdfPages(capturedFile)
      setPdfPreviewPages(pages)
      setPdfPreviewUrl(pages[0] || null)
      return pages[0] || null
    } catch (err: any) {
      console.error('[OcrCorrection] Error al renderizar PDF:', err?.message || err)
      return null
    }
  }, [isPdf, capturedFile, pdfPreviewPages.length])

  // Valor que el parser genérico extrajo para un campo de plantilla (para comparar)
  const parserExtractedValue = (ext: ExtractedData, field: string): string | null => {
    const num = (v: number | null | undefined): string | null => (v === null || v === undefined ? null : String(v))
    switch (field) {
      case 'fecha_emision': return ext.fecha_emision || null
      case 'fecha_operacion': return ext.fecha_operacion || null
      case 'fecha_vencimiento': return ext.fecha_vencimiento || null
      case 'numero_factura': return ext.numero_factura || ext.invoiceNumber || null
      case 'moneda': return ext.moneda || null
      case 'forma_pago': return ext.forma_pago || null
      case 'base_imponible': return num(ext.totales?.base_imponible ?? ext.taxableBase)
      case 'tipo_iva': return num(ext.totales?.tipo_iva ?? ext.vatRate)
      case 'cuota_iva': return num(ext.totales?.cuota_iva ?? ext.vatAmount)
      case 'tipo_irpf': return num(ext.totales?.tipo_irpf)
      case 'cuota_irpf': return num(ext.totales?.cuota_irpf)
      case 'tipo_recargo': return num(ext.totales?.tipo_recargo)
      case 'cuota_recargo': return num(ext.totales?.cuota_recargo)
      case 'regimen_fiscal': return ext.regimen_fiscal || null
      case 'tipo_operacion': return ext.tipo_operacion || null
      case 'total_factura': return num(ext.totales?.total_factura ?? ext.total)
      case 'emisor_nombre': return ext.emisor?.nombre || ext.issuerName || null
      case 'emisor_nif': return ext.emisor?.nif || ext.issuerTaxId || null
      case 'emisor_direccion': return ext.emisor?.direccion || null
      case 'receptor_nombre': return ext.receptor?.nombre || null
      case 'receptor_nif': return ext.receptor?.nif || null
      case 'receptor_direccion': return ext.receptor?.direccion || null
      case 'iban': return ext.iban || null
      default: return null
    }
  }

  // Detecta las cajas localmente (tesseract.js) sobre la imagen que ve el
  // usuario, para cuando el proveedor de visión no devuelve coordenadas.
  const detectLocalBoxes = async (): Promise<OcrOverlay | null> => {
    const src = isPdf ? await ensurePdfPreview() : capturedImage
    if (!src) return null
    try {
      const { detectWordBoxes } = await import('@/lib/finance/ocr-boxes')
      return await detectWordBoxes(src)
    } catch (err: any) {
      console.error('[OcrCorrection] Error detectando palabras:', err?.message || err)
      return null
    }
  }

  // Tras el OCR: si el proveedor ya tiene plantilla aprendida, la aplica.
  // Cuando la plantilla discrepa con lo que leyó el parser genérico, en vez de
  // sobrescribir a ciegas abre la comparación lado a lado para confirmar.
  const applySavedTemplate = async (ext: ExtractedData | null, overlay: OcrOverlay | null) => {
    // Aunque el proveedor de visión no devuelva cajas (caso habitual con
    // OpenRouter/Gemini y PDFs), el visualizador puede generarlas localmente.
    if (!ext) return
    const supplierName = (ext.supplier || ext.issuerName || '').trim()
    if (!supplierName) return
    try {
      const q = new URLSearchParams({ supplierName })
      const nif = ext.emisor?.nif || ext.issuerTaxId || null
      if (nif) q.set('nif', nif)
      const res = await fetch(`/api/erp/expenses/ocr-templates?${q.toString()}`)
      const data = await res.json()
      // Puede haber varias plantillas (formatos distintos): usamos la más
      // reciente, que es la más probable para el documento actual.
      const template = Array.isArray(data?.templates) ? data.templates[0] : data?.template
      const vatTemplate: VatRowTemplate[] = Array.isArray(template?.vatRows) ? template.vatRows : []
      if (!template?.fields?.length && vatTemplate.length === 0) return

      // Cajas de palabras: las del proveedor de visión si existen; si no
      // (OpenRouter/Gemini no devuelven coordenadas), se detectan localmente
      // con tesseract.js sobre la imagen que ve el usuario.
      if (!overlay) toast.info('Detectando palabras del documento para aplicar la plantilla…')
      const boxes = overlay ?? (await detectLocalBoxes())
      if (!boxes) return

      // Tramos de IVA aprendidos por posición: extraerlos de sus regiones y
      // materializarlos directamente (el layout confirmado del proveedor manda
      // sobre lo que haya leído el modelo esta vez).
      if (vatTemplate.length > 0) {
        const breakdown = applyVatRowTemplate(boxes, vatTemplate, 1)
        if (breakdown.length > 0) applyDetectedVatBreakdown(breakdown)
      }

      if (!template?.fields?.length) return
      const values = applyTemplate(boxes, template.fields)
      const count = Object.keys(values).length
      if (count === 0) return

      // Guardar referencias de la plantilla aplicada para actualizarlas al confirmar
      setAppliedTemplateRef({ id: template.id, supplierName, nif: template.nif, fields: template.fields })

      // Discrepancias: campo donde la plantilla difiere del parser (o el parser
      // no lo leyó), o donde la lectura no coincide con el formato de la
      // referencia guardada (la región puede apuntar mal). Si no hay ninguna,
      // se aplica sin molestar.
      const mismatches: ComparisonItem[] = []
      for (const [field, templateValue] of Object.entries(values)) {
        const parserVal = parserExtractedValue(ext, field)
        const ref = template.fields?.find((f: OcrTemplateField) => f.field === field)?.reference ?? null
        const refCheck = validateReference(templateValue, ref)
        if (parserVal === null || !sameFieldValue(parserVal, templateValue) || !refCheck.ok) {
          mismatches.push({
            field,
            label: getOcrFieldDef(field)?.label || field,
            ocrValue: parserVal,
            templateValue,
            reference: ref,
            formatMismatch: !refCheck.ok,
          })
        }
      }

      if (mismatches.length === 0) {
        mergeTemplateValues(values)
        toast.success(`Plantilla de ${supplierName} aplicada (${count} campo${count !== 1 ? 's' : ''} verificado${count !== 1 ? 's' : ''})`)
      } else {
        setComparisonItems(mismatches)
      }
    } catch {
      /* silencioso: el formulario ya tiene los datos del OCR genérico */
    }
  }

  // Confirmación de la comparación: aplica solo los campos marcados y guarda
  // el valor confirmado como referencia en la plantilla (aprendizaje continuo).
  const confirmTemplateComparison = (values: Record<string, string>) => {
    const count = Object.keys(values).length
    mergeTemplateValues(values)
    setComparisonItems(null)
    if (count > 0) {
      toast.success(`${count} campo${count !== 1 ? 's' : ''} corregido${count !== 1 ? 's' : ''} con la plantilla del proveedor`)
      // Actualizar la referencia de los campos confirmados (best-effort)
      const applied = appliedTemplateRef
      setAppliedTemplateRef(null)
      if (applied) {
        const updatedFields = applied.fields.map(f => ({
          ...f,
          reference: values[f.field] ?? f.reference ?? null,
        }))
        fetch('/api/erp/expenses/ocr-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplierName: applied.supplierName,
            nif: applied.nif || undefined,
            templateId: applied.id,
            fields: updatedFields,
          }),
        }).catch(() => { /* no bloquea: la referencia se re-aprenderá en el siguiente guardado */ })
      }
    } else {
      setAppliedTemplateRef(null)
    }
  }

  // ─── Aprendizaje automático: proponer la región de un campo corregido ─────
  // Al corregir a mano un campo tras el escaneo, se busca ese valor en las
  // cajas de palabras del OCR y se propone la región para la plantilla.
  const FORM_FIELD_TO_OCR: Record<string, string> = {
    amount: 'total_factura',
    date: 'fecha_emision',
    operationDate: 'fecha_operacion',
    dueDate: 'fecha_vencimiento',
    invoiceNumber: 'numero_factura',
    currency: 'moneda',
    paymentMethod: 'forma_pago',
    taxableBase: 'base_imponible',
    vatRate: 'tipo_iva',
    vatAmount: 'cuota_iva',
    irpfRate: 'tipo_irpf',
    irpfAmount: 'cuota_irpf',
    surchargeRate: 'tipo_recargo',
    surchargeAmount: 'cuota_recargo',
    taxRegime: 'regimen_fiscal',
    operationType: 'tipo_operacion',
    totalFactura: 'total_factura',
    issuerName: 'emisor_nombre',
    issuerTaxId: 'emisor_nif',
    issuerAddress: 'emisor_direccion',
    receptorNombre: 'receptor_nombre',
    receptorNif: 'receptor_nif',
    receptorDireccion: 'receptor_direccion',
    iban: 'iban',
  }

  // Con tramos de IVA activos los agregados del desglose se derivan de las
  // filas: no hay una región única que proponer para ellos.
  const TAX_FIELDS_WITH_TRANCHES = ['taxableBase', 'vatRate', 'vatAmount', 'irpfRate', 'irpfAmount']

  // Cajas de palabras: las del proveedor de visión si existen; si no, las
  // detectadas localmente con tesseract (cacheadas para no repetir el OCR).
  const getEffectiveOverlay = async (): Promise<OcrOverlay | null> => {
    if (scanOverlay) return scanOverlay
    if (localOverlayLoadedRef.current) return localOverlayRef.current
    const boxes = await detectLocalBoxes()
    localOverlayRef.current = boxes
    localOverlayLoadedRef.current = true
    return boxes
  }

  // Valor corregido del formulario para un campo de plantilla (la referencia
  // que se guarda con la región aprendida).
  const referenceFor = (ocrField: string): string | null => {
    switch (ocrField) {
      case 'total_factura': return form.totalFactura || form.amount || null
      case 'fecha_emision': return form.date || null
      case 'fecha_operacion': return form.operationDate || null
      case 'fecha_vencimiento': return form.dueDate || null
      case 'numero_factura': return form.invoiceNumber || null
      case 'moneda': return form.currency || null
      case 'forma_pago': return form.paymentMethod || null
      case 'base_imponible': return form.taxableBase || null
      case 'tipo_iva': return form.vatRate || null
      case 'cuota_iva': return form.vatAmount || null
      case 'tipo_irpf': return form.irpfRate || null
      case 'cuota_irpf': return form.irpfAmount || null
      case 'tipo_recargo': return form.surchargeRate || null
      case 'cuota_recargo': return form.surchargeAmount || null
      case 'regimen_fiscal': return form.taxRegime || null
      case 'tipo_operacion': return form.operationType || null
      case 'emisor_nombre': return form.issuerName || null
      case 'emisor_nif': return form.issuerTaxId || null
      case 'emisor_direccion': return form.issuerAddress || null
      case 'receptor_nombre': return form.receptorNombre || null
      case 'receptor_nif': return form.receptorNif || null
      case 'receptor_direccion': return form.receptorDireccion || null
      case 'iban': return form.iban || null
      default: return null
    }
  }

  // Busca la región del valor corregido (con debounce para no lanzar el OCR
  // en cada tecla). Solo propone si el usuario CAMBIÓ el valor respecto a lo
  // que leyó el escaneo — re-escribir lo mismo no es un aprendizaje.
  const maybeProposeRegion = (formField: string, value: string) => {
    if (proposalTimerRef.current) clearTimeout(proposalTimerRef.current)
    proposalTimerRef.current = setTimeout(async () => {
      const ocrField = FORM_FIELD_TO_OCR[formField]
      if (!ocrField) return
      const def = getOcrFieldDef(ocrField)
      if (!def) return
      const t = value.trim()
      if (!t || (ivaRows.length > 0 && TAX_FIELDS_WITH_TRANCHES.includes(formField))) {
        setOcrProposals(p => { const n = { ...p }; delete n[formField]; return n })
        return
      }
      const ext = scannedExtRef.current
      if (!ext) return // sin escaneo previo no hay nada que aprender
      const parserVal = parserExtractedValue(ext, ocrField)
      if (parserVal !== null && valuesEquivalent(parserVal, t)) {
        // El usuario no cambió nada respecto a lo leído: descartar propuesta
        setOcrProposals(p => { const n = { ...p }; delete n[formField]; return n })
        return
      }
      setProposalBusy(b => ({ ...b, [formField]: true }))
      try {
        const overlay = await getEffectiveOverlay()
        const proposal = overlay ? findRegionForValue(overlay, t, def) : null
        setOcrProposals(p => {
          if (!proposal) { const n = { ...p }; delete n[formField]; return n }
          return { ...p, [formField]: proposal }
        })
      } finally {
        setProposalBusy(b => { const n = { ...b }; delete n[formField]; return n })
      }
    }, 450)
  }

  // ─── Aprendizaje de tramos de IVA ───────────────────────────────────────
  // Mismo mecanismo que los campos de texto pero por fila de tramo: cuando el
  // usuario ajusta a mano la base o el tipo de un tramo tras el escaneo, se
  // busca ese valor en las cajas del OCR y se propone guardar la región en la
  // plantilla del proveedor. Los agregados del desglose (base/IVA/IRPF) no
  // sirven porque con tramos se derivan de las filas y pueden mezclar tipos.
  const maybeProposeTrancheRegion = (rowId: number, field: 'base' | 'rate', prevValue: string, value: string) => {
    if (proposalTimerRef.current) clearTimeout(proposalTimerRef.current)
    proposalTimerRef.current = setTimeout(async () => {
      const ocrField = field === 'rate' ? 'tipo_iva' : 'base_imponible'
      const def = getOcrFieldDef(ocrField)
      if (!def) return
      const key = `tranche:${rowId}:${field}`
      const t = value.trim()
      if (!t || !scannedExtRef.current) {
        setOcrProposals(p => { const n = { ...p }; delete n[key]; return n })
        return
      }
      // Re-escribir lo mismo que ya traía la fila no es una corrección
      if (prevValue && valuesEquivalent(prevValue, t)) {
        setOcrProposals(p => { const n = { ...p }; delete n[key]; return n })
        return
      }
      setProposalBusy(b => ({ ...b, [key]: true }))
      try {
        const overlay = await getEffectiveOverlay()
        const proposal = overlay ? findRegionForValue(overlay, t, def) : null
        setOcrProposals(p => {
          if (!proposal) { const n = { ...p }; delete n[key]; return n }
          // La referencia guardada es el valor corregido de la fila
          return { ...p, [key]: { ...proposal, reference: t } }
        })
      } finally {
        setProposalBusy(b => { const n = { ...b }; delete n[key]; return n })
      }
    }, 450)
  }

  const dismissProposal = (formField: string) => {
    setOcrProposals(p => { const n = { ...p }; delete n[formField]; return n })
  }

  // Abre el visualizador con la propuesta pre-dibujada para ajustarla
  const openProposalInViewer = (formField: string) => {
    const proposal = ocrProposals[formField]
    if (!proposal) return
    setOcrProposalForModal({
      field: proposal.field,
      label: proposal.label,
      region: proposal.region,
      matchedText: proposal.matchedText,
    })
    setCorrectionOpen(true)
  }

  // Guarda la región propuesta en la plantilla del proveedor: si ya existe una
  // plantilla se fusiona en la más reciente; si no, se crea una nueva.
  const saveProposalToTemplate = async (formField: string) => {
    const proposal = ocrProposals[formField]
    if (!proposal) return
    const supplierName = (form.supplier || form.issuerName || '').trim()
    if (!supplierName) {
      toast.error('Indica primero el proveedor para guardar la plantilla')
      return
    }
    setSavingProposal(formField)
    try {
      const region: OcrTemplateField = {
        ...proposal.region,
        // Los tramos llevan su referencia en la propuesta (el valor corregido
        // de la fila); los campos de texto usan el valor actual del formulario.
        reference: proposal.reference ?? (referenceFor(proposal.field) || null),
      }
      const q = new URLSearchParams({ supplierName })
      if (form.issuerTaxId) q.set('nif', form.issuerTaxId)
      const listRes = await fetch(`/api/erp/expenses/ocr-templates?${q.toString()}`)
      const listData = await listRes.json()
      const templates = Array.isArray(listData?.templates) ? listData.templates : []
      const body: Record<string, any> = {
        supplierName,
        nif: form.issuerTaxId || undefined,
        fields: [region],
      }
      if (templates.length > 0) {
        // Fusionar en la más reciente (la más probable para este formato)
        const existing = templates[0]
        body.templateId = existing.id
        body.name = existing.name
        body.fields = (existing.fields || [])
          .filter((f: OcrTemplateField) => f.field !== proposal.field)
          .concat(region)
      }
      const res = await fetch('/api/erp/expenses/ocr-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      toast.success(`Región de «${proposal.label}» guardada en la plantilla de ${supplierName}`)
      dismissProposal(formField)
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar la plantilla')
    } finally {
      setSavingProposal(null)
    }
  }

  // Chip de propuesta que aparece bajo el campo corregido
  const renderProposalChip = (formField: string) => {
    if (proposalBusy[formField]) {
      return (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-[11px] text-violet-700">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          Buscando la región del valor corregido…
        </div>
      )
    }
    const proposal = ocrProposals[formField]
    if (!proposal) return null
    const supplierName = (form.supplier || form.issuerName || '').trim()
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-[11px]">
        <Sparkles className="h-3 w-3 text-violet-600 shrink-0" />
        <span className="text-violet-800">
          <span className="font-bold">«{proposal.matchedText}»</span> encontrado en la imagen — guardar región de{' '}
          <span className="font-bold">{proposal.label.toLowerCase()}</span> en la plantilla{supplierName ? ` de ${supplierName}` : ''}?
        </span>
        <Button type="button" size="sm" className="h-6 px-2 text-[11px]" onClick={() => saveProposalToTemplate(formField)} disabled={savingProposal === formField}>
          {savingProposal === formField ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
          Guardar
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => openProposalInViewer(formField)}>
          Ver en imagen
        </Button>
        <button type="button" onClick={() => dismissProposal(formField)} className="ml-auto text-violet-400 hover:text-violet-700" aria-label="Descartar propuesta">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const submitExpenseBody = async (body: Record<string, any>, allowDuplicate = false) => {
    const res = await fetch('/api/erp/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, allowDuplicate }),
    })
    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      const inboxId = selectedPdfGroupId ? pdfInboxDocumentIds[selectedPdfGroupId] : null
      if (inboxId) {
        fetch('/api/erp/expenses/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: inboxId, status: 'PROCESSED', expenseId: data.id, extractedData: body }),
        }).catch(() => { /* el gasto ya está guardado; la bandeja se puede reconciliar después */ })
      }
      toast.success('Gasto registrado correctamente')
      // Confirmación de los tramos: aprender su posición en la plantilla del
      // proveedor para que el siguiente escaneo los extraiga sin re-detectar.
      void saveVatRowTemplate()
      router.push('/dashboard/finanzas/gastos')
      return true
    }

    if (res.status === 409 && data.code === 'POSSIBLE_DUPLICATE' && !allowDuplicate) {
      setDuplicateCandidate({ body, message: data.error || 'Se encontró un posible duplicado.', duplicate: data.duplicate })
      return false
    }

    toast.error(data.error || 'Error al crear gasto')
    return false
  }

  const confirmDuplicateExpense = async () => {
    if (!duplicateCandidate) return
    const body = duplicateCandidate.body
    setDuplicateCandidate(null)
    setSaving(true)
    try {
      await submitExpenseBody(body, true)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
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
              taxId: form.issuerTaxId || undefined,
              vatRates: ratesTouched ? supplierVatRates : undefined,
              ...parseSupplierAddress(form.issuerAddress),
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
        currency: form.currency || 'EUR',
        date: form.date || undefined,
        dueDate: form.dueDate || undefined,
        paymentMethod: form.paymentMethod || undefined,
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
        surchargeRate: form.surchargeRate || undefined,
        surchargeAmount: form.surchargeAmount || undefined,
        taxRegime: form.taxRegime || undefined,
        operationType: form.operationType || undefined,
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
        vatBreakdown: ivaRows.length > 0 ? ivaRows.map(row => ({
          rate: parseFloat(row.rate),
          base: parseFloat(row.base),
          amount: parseFloat(computePercentageAmount(row.base, row.rate)),
        })).filter(row => Number.isFinite(row.rate) && Number.isFinite(row.base) && Number.isFinite(row.amount)) : undefined,
      }
      if (form.receiptUrl) body.receiptUrl = form.receiptUrl

      await submitExpenseBody(body)
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
    setScanOverlay(null)
    setPdfPreviewUrl(null)
    setPdfPreviewPages([])
    setPdfGroups([])
    setSelectedPdfGroupId(null)
    setPdfInboxDocumentIds({})
    setPdfBatchLoading(false)
    setOcrProposals({})
    setProposalBusy({})
    setSavingProposal(null)
    setDuplicateCandidate(null)
    setOcrProposalForModal(null)
    scannedExtRef.current = null
    localOverlayRef.current = null
    localOverlayLoadedRef.current = false
    if (proposalTimerRef.current) {
      clearTimeout(proposalTimerRef.current)
      proposalTimerRef.current = null
    }
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
      surchargeRate: '',
      surchargeAmount: '',
      taxRegime: '',
      operationType: '',
      dueDate: '',
      currency: 'EUR',
      paymentMethod: '',
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
            {isPdf && (
              <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-950">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  {pdfBatchLoading ? 'Analizando páginas del PDF…' : pdfGroups.length > 1 ? 'Documentos detectados en el PDF' : 'Documento PDF listo'}
                </div>
                {pdfBatchLoading ? (
                  <div className="flex items-center gap-2 text-xs text-indigo-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando separadores de facturas…</div>
                ) : (
                  <div className="space-y-1">
                    {pdfGroups.map(group => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setSelectedPdfGroupId(group.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${selectedPdfGroupId === group.id ? 'border-indigo-500 bg-white ring-1 ring-indigo-300' : 'border-indigo-100 bg-white/60 hover:bg-white'}`}
                      >
                        <span className="font-bold text-indigo-950">{group.label}</span>
                        <span className="ml-2 text-indigo-600">páginas {group.pageStart}–{group.pageEnd}</span>
                      </button>
                    ))}
                    {pdfGroups.length === 1 && <p className="text-[10px] text-indigo-700">Si el PDF es un escaneo sin texto incrustado, se procesa como un único documento para evitar separar páginas incorrectamente.</p>}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3 mt-4 justify-center flex-wrap">
              <Button variant="outline" onClick={resetAll}>
                {isPdf ? <FileText className="h-4 w-4 mr-2" /> : <Camera className="h-4 w-4 mr-2" />} {isPdf ? 'Nuevo PDF' : 'Nueva Foto'}
              </Button>
              <Button variant="outline" onClick={goToForm}>
                <Receipt className="h-4 w-4 mr-2" /> Sin OCR
              </Button>
              <Button onClick={runScan} disabled={scanning || pdfBatchLoading} className="min-w-[180px]">
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
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg flex items-center gap-2">
                {scanResult?.ocrTimedOut ? <><span className="text-amber-500">⚠</span> OCR no disponible</> : scanResult ? <><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Datos Extraídos</> : <><Receipt className="h-5 w-5" /> Datos del Gasto</>}
              </CardTitle>
              {(capturedImage || isPdf) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setCorrectionOpen(true); ensurePdfPreview() }}
                  className="shrink-0"
                >
                  <MousePointerClick className="h-4 w-4 mr-1.5" />
                  Ajustar lectura
                </Button>
              )}
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
                  <Input type="number" step="0.01" value={form.amount} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, amount: v })); maybeProposeRegion('amount', v) }} placeholder="0.00" />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={form.date} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, date: v })); maybeProposeRegion('date', v) }} />
                </div>
              </div>
              {renderProposalChip('amount')}
              {renderProposalChip('date')}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Proveedor</Label>
                  <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" aria-expanded={supplierOpen} className="w-full justify-between font-normal">
                        <span className="truncate">{form.supplier || 'Buscar o escribir proveedor…'}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar proveedor…" value={supplierQuery} onValueChange={setSupplierQuery} />
                        <CommandList>
                          <CommandEmpty>{allSuppliers.length === 0 ? 'No tienes proveedores registrados todavía. Escribe el nombre para crear uno.' : 'No hay proveedores con ese nombre.'}</CommandEmpty>
                          {allSuppliers.length > 0 && (
                            <CommandGroup heading="Proveedores registrados">
                              {allSuppliers.map(s => (
                                <CommandItem
                                  key={s.id}
                                  value={`${s.name} ${s.taxId || ''}`.trim()}
                                  onSelect={() => selectSupplier(s)}
                                >
                                  <Check className={`mr-2 h-4 w-4 ${form.supplier === s.name ? 'opacity-100' : 'opacity-0'}`} />
                                  <span className="truncate">{s.name}</span>
                                  {s.taxId && <span className="ml-auto pl-2 text-xs text-muted-foreground">{s.taxId}</span>}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          {supplierQuery.trim() && !allSuppliers.some(s => (s.name || '').toLowerCase() === supplierQuery.trim().toLowerCase()) && (
                            <CommandItem value={`${supplierQuery.trim()} como nuevo proveedor`} onSelect={() => chooseNewSupplier(supplierQuery)} className="text-primary">
                              <Plus className="mr-2 h-4 w-4" />
                              Registrar «{supplierQuery.trim()}» como nuevo proveedor
                            </CommandItem>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Categoría</Label>
                  <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.supplier && !selectedSupplier && (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    «{form.supplier}» no está en tu base de proveedores. Rellena sus datos fiscales en «Datos Fiscales (Verifactu)» y regístralo, o se registrará solo al guardar el gasto.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={openSupplierModal} className="h-7 text-xs">
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    Registrar proveedor
                  </Button>
                </div>
              )}

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
                      <Input value={form.invoiceNumber} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, invoiceNumber: v })); maybeProposeRegion('invoiceNumber', v) }} placeholder="F2026-00142" />
                    </div>
                    <div>
                      <Label>Serie</Label>
                      <Input value={form.serie} onChange={e => setForm(p => ({ ...p, serie: e.target.value }))} placeholder="F2026" />
                    </div>
                  </div>
                  {renderProposalChip('invoiceNumber')}

                  {/* Fechas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Fecha Operación</Label>
                      <Input type="date" value={form.operationDate} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, operationDate: v })); maybeProposeRegion('operationDate', v) }} />
                    </div>
                    <div>
                      <Label>Total Factura</Label>
                      <Input type="number" step="0.01" value={form.totalFactura} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, totalFactura: v })); maybeProposeRegion('totalFactura', v) }} placeholder="0.00" />
                    </div>
                  </div>
                  {renderProposalChip('operationDate')}
                  {renderProposalChip('totalFactura')}

                  {/* Vencimiento, moneda y pago */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Fecha Vencimiento</Label>
                      <Input type="date" value={form.dueDate} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, dueDate: v })); maybeProposeRegion('dueDate', v) }} />
                    </div>
                    <div>
                      <Label>Moneda</Label>
                      <select
                        value={form.currency}
                        onChange={e => { const v = e.target.value; setForm(p => ({ ...p, currency: v })); maybeProposeRegion('currency', v) }}
                        className="w-full bg-background border rounded-xl px-3 py-2.5 text-sm outline-none"
                      >
                        {['EUR', 'USD', 'MXN', 'GBP', 'CHF', 'CAD', 'ARS', 'COP', 'CLP', 'PEN', 'BRL'].map(currency => (
                          <option key={currency} value={currency}>{currency}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Forma de Pago</Label>
                      <Input value={form.paymentMethod} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, paymentMethod: v })); maybeProposeRegion('paymentMethod', v) }} placeholder="Transferencia, tarjeta…" />
                    </div>
                  </div>
                  {renderProposalChip('dueDate')}
                  {renderProposalChip('currency')}
                  {renderProposalChip('paymentMethod')}

                  {/* Emisor */}
                  <div className="border-b pb-2 mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Emisor (Quien vende)</span>
                    {selectedSupplier && (
                      <span className="text-[10px] font-semibold text-emerald-600">✓ Datos del proveedor registrado</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Razón Social</Label>
                      <Input value={form.issuerName} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, issuerName: v })); maybeProposeRegion('issuerName', v) }} placeholder="Nombre o razón social" />
                    </div>
                    <div>
                      <Label>NIF / CIF</Label>
                      <Input value={form.issuerTaxId} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, issuerTaxId: v })); maybeProposeRegion('issuerTaxId', v) }} placeholder="B12345678" />
                    </div>
                  </div>
                  {renderProposalChip('issuerName')}
                  {renderProposalChip('issuerTaxId')}
                  <div>
                    <Label>Domicilio Fiscal</Label>
                    <Input value={form.issuerAddress} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, issuerAddress: v })); maybeProposeRegion('issuerAddress', v) }} placeholder="C/ Ejemplo 123, 28001 Madrid" />
                  </div>

                  {/* Receptor */}
                  <div className="border-b pb-2 mb-1 mt-4">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Receptor (Cliente)</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">Autorelleno con los datos fiscales de tu empresa (Emisor principal).</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nombre / Razón Social</Label>
                      <Input value={form.receptorNombre} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, receptorNombre: v })); maybeProposeRegion('receptorNombre', v) }} placeholder="Nombre del cliente" />
                    </div>
                    <div>
                      <Label>NIF / CIF</Label>
                      <Input value={form.receptorNif} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, receptorNif: v })); maybeProposeRegion('receptorNif', v) }} placeholder="12345678Z" />
                    </div>
                  </div>
                  <div>
                    <Label>Domicilio</Label>
                    <Input value={form.receptorDireccion} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, receptorDireccion: v })); maybeProposeRegion('receptorDireccion', v) }} placeholder="Avda. Constitución 12, Sevilla" />
                  </div>

                  {/* Totales e Impuestos */}
                  <div className="border-b pb-2 mb-2 mt-4">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Desglose de Impuestos</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Base Imponible</Label>
                      <Input type="number" step="0.01" value={form.taxableBase} onChange={e => { applyTaxableBase(e.target.value); maybeProposeRegion('taxableBase', e.target.value) }} placeholder="0.00" />
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
                            <Input type="number" step="0.01" value={form.vatRate} onChange={e => { applyVatRate(e.target.value); maybeProposeRegion('vatRate', e.target.value) }} placeholder="21" className="w-20" />
                          )}
                        </div>
                      ) : (
                        <Input type="number" step="0.01" value={form.vatRate} onChange={e => { applyVatRate(e.target.value); maybeProposeRegion('vatRate', e.target.value) }} placeholder="21" />
                      )}
                    </div>
                    <div>
                      <Label>Cuota IVA</Label>
                      <Input type="number" step="0.01" value={form.vatAmount} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, vatAmount: v })); maybeProposeRegion('vatAmount', v) }} placeholder="0.00" />
                    </div>
                  </div>
                  {renderProposalChip('taxableBase')}
                  {renderProposalChip('vatRate')}
                  {renderProposalChip('vatAmount')}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>IRPF % (Retención)</Label>
                      <Input type="number" step="0.01" value={form.irpfRate} onChange={e => { applyIrpfRate(e.target.value); maybeProposeRegion('irpfRate', e.target.value) }} placeholder="15" />
                    </div>
                    <div>
                      <Label>Cuota IRPF</Label>
                      <Input type="number" step="0.01" value={form.irpfAmount} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, irpfAmount: v })); maybeProposeRegion('irpfAmount', v) }} placeholder="-240.00" />
                    </div>
                  </div>
                  {renderProposalChip('irpfRate')}
                  {renderProposalChip('irpfAmount')}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Régimen fiscal</Label>
                      <Select value={form.taxRegime || 'general'} onValueChange={v => { setForm(p => ({ ...p, taxRegime: v })); maybeProposeRegion('taxRegime', v) }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">Régimen general</SelectItem>
                          <SelectItem value="recargo_equivalencia">Recargo de equivalencia</SelectItem>
                          <SelectItem value="intracomunitaria">Intracomunitaria</SelectItem>
                          <SelectItem value="inversion_sujeto_pasivo">Inversión del sujeto pasivo</SelectItem>
                          <SelectItem value="exenta">Exenta</SelectItem>
                          <SelectItem value="no_sujeta">No sujeta</SelectItem>
                          <SelectItem value="igic">IGIC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tipo de operación</Label>
                      <Select value={form.operationType || 'nacional'} onValueChange={v => { setForm(p => ({ ...p, operationType: v })); maybeProposeRegion('operationType', v) }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nacional">Nacional</SelectItem>
                          <SelectItem value="intracomunitaria">Intracomunitaria</SelectItem>
                          <SelectItem value="exportacion">Exportación</SelectItem>
                          <SelectItem value="inversion_sujeto_pasivo">Inversión del sujeto pasivo</SelectItem>
                          <SelectItem value="exenta">Exenta</SelectItem>
                          <SelectItem value="no_sujeta">No sujeta</SelectItem>
                          <SelectItem value="canarias_igic">Canarias (IGIC)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {renderProposalChip('taxRegime')}
                  {renderProposalChip('operationType')}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Recargo de equivalencia %</Label>
                      <Input type="number" step="0.01" value={form.surchargeRate} onChange={e => { applySurchargeRate(e.target.value); maybeProposeRegion('surchargeRate', e.target.value) }} placeholder="5.20" />
                    </div>
                    <div>
                      <Label>Cuota recargo</Label>
                      <Input type="number" step="0.01" value={form.surchargeAmount} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, surchargeAmount: v })); maybeProposeRegion('surchargeAmount', v) }} placeholder="0.00" />
                    </div>
                  </div>
                  {renderProposalChip('surchargeRate')}
                  {renderProposalChip('surchargeAmount')}

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
                        <div className="flex items-center gap-2 mb-1">
                          <Label className="text-xs text-muted-foreground">Total base a repartir</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={trancheTarget}
                            onChange={e => {
                              const target = e.target.value
                              setTrancheTarget(target)
                              const rows = applyDistribution(ivaRows, target)
                              setIvaRows(rows)
                              syncTotalsFromRows(rows)
                            }}
                            placeholder="0.00"
                            className="w-28 h-8 rounded-lg"
                          />
                          <div className="flex rounded-lg border overflow-hidden shrink-0">
                            <button
                              type="button"
                              onClick={() => changeTrancheMode('equal')}
                              className={`px-2 py-1 text-[10px] font-bold uppercase transition-colors ${trancheMode === 'equal' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
                            >
                              Repartir
                            </button>
                            <button
                              type="button"
                              onClick={() => changeTrancheMode('last')}
                              className={`px-2 py-1 text-[10px] font-bold uppercase transition-colors ${trancheMode === 'last' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
                            >
                              Resto en último
                            </button>
                          </div>
                        </div>
                        {ivaRows.map(row => (
                          <div key={row.id} className="space-y-1">
                            <div className="grid grid-cols-[1fr_90px_110px_auto] gap-2 items-center">
                              <Input type="number" step="0.01" placeholder="Base imponible" value={row.base} onChange={e => updateIvaRow(row.id, 'base', e.target.value)} className="h-9 rounded-lg" />
                              <Input type="number" step="0.01" placeholder="IVA %" value={row.rate} onChange={e => updateIvaRow(row.id, 'rate', e.target.value)} className="h-9 rounded-lg" />
                              <span className="text-xs font-bold text-slate-600 text-right">€{computePercentageAmount(row.base, row.rate) || '0.00'}</span>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => removeIvaRow(row.id)} aria-label="Quitar tramo">×</Button>
                            </div>
                            {/* Aprendizaje: propuesta de región al corregir un tramo a mano */}
                            {renderProposalChip(`tranche:${row.id}:base`)}
                            {renderProposalChip(`tranche:${row.id}:rate`)}
                          </div>
                        ))}
                        <div className="flex justify-between text-xs font-black pt-2 border-t">
                          <span>Base total: <span className="text-foreground">€{ivaTotals.base.toFixed(2)}</span></span>
                          <span>IVA total: <span className="text-foreground">€{ivaTotals.vat.toFixed(2)}</span></span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">«Repartir» distribuye el total a partes iguales entre los tramos vacíos (el último absorbe el redondeo). «Resto en último» deja los intermedios vacíos y solo rellena el último con lo que falte para cuadrar el total. Los totales se sincronizan con el desglose superior (Base Imponible / Cuota IVA).</p>
                      </div>
                    )}
                  </div>

                  {totalsMismatch && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-tight">Los totales no cuadran</p>
                        <p className="text-xs font-medium">
                          Base + IVA + recargo − IRPF = <span className="font-bold">€{totalsMismatch.expected.toFixed(2)}</span>, pero el total de la factura es{' '}
                          <span className="font-bold">€{parseFloat(form.totalFactura).toFixed(2)}</span> (diferencia{' '}
                          <span className="font-bold">€{totalsMismatch.difference.toFixed(2)}</span>). Revisa los importes antes de guardar.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Asiento contable propuesto */}
                  {(form.amount || form.taxableBase) && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-indigo-600" />
                          <span className="text-xs font-black uppercase tracking-wider text-indigo-950">Asiento contable propuesto</span>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${entryProposal.totalMatches ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {entryProposal.totalMatches ? 'Cuadra' : 'Revisar total'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-indigo-950">
                        <span>Cuenta de gasto: <strong>{entryProposal.expenseAccountCode} · {entryProposal.expenseAccountName}</strong></span>
                        <span className="text-right">A pagar proveedor: <strong>{form.currency || 'EUR'} {entryProposal.supplierPayable.toFixed(2)}</strong></span>
                      </div>
                      <p className="text-[10px] font-semibold text-indigo-800">{entryProposal.treatmentLabel}</p>
                      <div className="overflow-x-auto rounded-lg border border-indigo-100 bg-white/80">
                        <table className="w-full text-[11px]">
                          <thead className="border-b border-indigo-100 text-indigo-500">
                            <tr><th className="px-2 py-1 text-left">Cuenta</th><th className="px-2 py-1 text-left">Concepto</th><th className="px-2 py-1 text-right">Debe</th><th className="px-2 py-1 text-right">Haber</th></tr>
                          </thead>
                          <tbody>
                            {entryProposal.lines.map((line, index) => (
                              <tr key={`${line.accountCode}-${index}`} className="border-b border-indigo-50 last:border-0">
                                <td className="px-2 py-1 font-bold">{line.accountCode}</td>
                                <td className="px-2 py-1">{line.accountName}</td>
                                <td className="px-2 py-1 text-right">{line.debit > 0 ? line.debit.toFixed(2) : '—'}</td>
                                <td className="px-2 py-1 text-right">{line.credit > 0 ? line.credit.toFixed(2) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!entryProposal.totalMatches && (
                        <p className="text-[10px] font-medium text-amber-800">Los componentes fiscales difieren del total detectado en {form.currency || 'EUR'} {entryProposal.sourceTotal.toFixed(2)} por {form.currency || 'EUR'} {Math.abs(entryProposal.difference).toFixed(2)}. Revisa la factura antes de guardar.</p>
                      )}
                      {entryProposal.requiresFiscalReview && (
                        <p className="text-[10px] font-medium text-amber-800">Esta operación requiere revisión fiscal: el IVA se trata como {entryProposal.reverseChargeVat > 0 ? 'autorrepercutido y soportado' : 'no IVA español'} y no se aplicará como una factura nacional estándar.</p>
                      )}
                      <p className="text-[10px] text-indigo-700">Se generará automáticamente después de guardar el gasto; esta vista solo permite revisarlo antes.</p>
                    </div>
                  )}

                  {/* IBAN */}
                  <div className="border-b pb-2 mb-2 mt-4">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pago</span>
                  </div>
                  <div>
                    <Label>IBAN</Label>
                    <Input value={form.iban} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, iban: v })); maybeProposeRegion('iban', v) }} placeholder="ES9100491234561234567890" />
                  {renderProposalChip('iban')}
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

      {/* Confirmación de posible factura duplicada */}
      <Dialog open={duplicateCandidate !== null} onOpenChange={open => { if (!open) setDuplicateCandidate(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" /> Posible factura duplicada
            </DialogTitle>
            <DialogDescription>
              {duplicateCandidate?.message} Revisa el gasto existente antes de continuar.
            </DialogDescription>
          </DialogHeader>
          {duplicateCandidate?.duplicate && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1 text-sm">
              <p><span className="font-semibold">Factura:</span> {duplicateCandidate.duplicate.invoiceNumber || 'Sin número'}</p>
              <p><span className="font-semibold">Importe:</span> {duplicateCandidate.duplicate.currency || 'EUR'} {Number(duplicateCandidate.duplicate.amount || 0).toFixed(2)}</p>
              <p><span className="font-semibold">Fecha:</span> {duplicateCandidate.duplicate.date ? new Intl.DateTimeFormat('es-ES').format(new Date(duplicateCandidate.duplicate.date)) : '—'}</p>
              {duplicateCandidate.duplicate.description && <p><span className="font-semibold">Descripción:</span> {duplicateCandidate.duplicate.description}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateCandidate(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDuplicateExpense} disabled={saving}>
              Guardar de todos modos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: completar la ficha del nuevo proveedor antes de registrarlo */}
      <Dialog open={supplierModalOpen} onOpenChange={setSupplierModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-black tracking-tight uppercase">Registrar Proveedor</DialogTitle>
            <DialogDescription>Completa la ficha de «{supplierModal.name}» para guardarlo en tu base.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Razón Social / Nombre</Label>
              <Input value={supplierModal.name} onChange={e => setSupplierModal(m => ({ ...m, name: e.target.value }))} placeholder="Nombre del proveedor" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>NIF / CIF</Label>
                <Input
                  value={supplierModal.taxId}
                  onChange={e => {
                    setSupplierModal(m => ({ ...m, taxId: e.target.value }))
                    setSupplierTaxIdError('')
                  }}
                  placeholder="B12345678"
                  className={supplierTaxIdError ? 'border-destructive' : ''}
                />
                {supplierTaxIdError && (
                  <p className="text-[11px] font-medium text-destructive mt-1">{supplierTaxIdError}</p>
                )}
              </div>
              <div>
                <Label>País</Label>
                <select
                  value={supplierModal.pais}
                  onChange={e => {
                    setSupplierModal(m => ({ ...m, pais: e.target.value }))
                    setSupplierTaxIdError('')
                  }}
                  className="w-full bg-background border rounded-xl px-3 py-2.5 text-sm outline-none"
                >
                  {SUPPLIER_COUNTRIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoría</Label>
                <Select value={supplierModal.category} onValueChange={v => setSupplierModal(m => ({ ...m, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={supplierModal.email} onChange={e => setSupplierModal(m => ({ ...m, email: e.target.value }))} placeholder="proveedor@empresa.com" />
              </div>
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input type="tel" value={supplierModal.phone} onChange={e => setSupplierModal(m => ({ ...m, phone: e.target.value }))} placeholder="+34 600 000 000" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipos de IVA aplicables</Label>
              <IvaRatesEditor
                value={supplierModal.vatRates}
                onChange={vatRates => setSupplierModal(m => ({ ...m, vatRates }))}
              />
              <p className="text-[10px] text-muted-foreground">Se usan para crear los tramos del desglose y se guardan en la ficha del proveedor.</p>
            </div>
            {form.issuerAddress && (
              <p className="text-[10px] text-muted-foreground">
                Domicilio: {form.issuerAddress} (se registrará en la ficha).
              </p>
            )}
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setSupplierModalOpen(false)} disabled={registeringSupplier}>Cancelar</Button>
            <Button onClick={submitSupplierRegistration} disabled={registeringSupplier}>
              {registeringSupplier ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {registeringSupplier ? 'Registrando…' : 'Guardar proveedor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: visualizador de corrección OCR (aprende la plantilla del proveedor) */}
      <OcrCorrectionModal
        open={correctionOpen}
        onClose={() => { setCorrectionOpen(false); setOcrProposalForModal(null) }}
        // Fuentes locales primero (blob/data URL) para que tesseract pueda
        // leerlas sin problemas de CORS; la URL de S3 solo como último recurso.
        imageUrl={isPdf ? pdfPreviewUrl : capturedImage || form.receiptUrl}
        pdfPages={isPdf ? pdfPreviewPages : undefined}
        overlay={isPdf ? null : scanOverlay}
        supplierName={form.supplier || form.issuerName}
        supplierNif={form.issuerTaxId}
        onApply={mergeTemplateValues}
        autoProposal={ocrProposalForModal}
      />

      {/* Comparación lado a lado: confirmar antes de aplicar la plantilla */}
      <OcrComparisonModal
        open={comparisonItems !== null}
        items={comparisonItems || []}
        imageUrl={isPdf ? pdfPreviewUrl : capturedImage || form.receiptUrl}
        pdfPages={isPdf ? pdfPreviewPages : undefined}
        onConfirm={confirmTemplateComparison}
        onClose={() => setComparisonItems(null)}
      />
    </div>
  )
}
