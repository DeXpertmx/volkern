'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Save,
  Calculator,
  User,
  Building2,
  GripVertical,
  Package,
  CheckCircle2,
  Settings2,
  FileText,
  RefreshCw
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useFiscalConfig } from '@/hooks/use-fiscal-config'
import { CatalogSearchSelect, CatalogoItemResult } from '@/components/catalogo/CatalogSearchSelect'
import { PlaceholderHelp } from '@/components/contratos/PlaceholderHelp'

interface CotizacionItem {
  id: string
  catalogoItemId?: string | null
  concepto: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  descuento: number
  total: number
  tasaImpuesto?: number
  tasaImpuestoId?: string | null
  catalogoItem?: CatalogoItemResult | null
}

interface Lead {
  id: string
  nombre: string
  email: string
  empresa: string | null
  telefono: string | null
}

interface Deal {
  id: string
  titulo: string
  valor: number
  lead: Lead | null
  contact: { nombre: string; email: string } | null
}

export default function NuevaCotizacionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const leadIdParam = searchParams.get('leadId')
  const dealIdParam = searchParams.get('dealId')
  const contactIdParam = searchParams.get('contactId')
  const editIdParam = searchParams.get('editId')
  const isEditing = Boolean(editIdParam)

  // Cargar configuración fiscal del tenant
  const { config: fiscalConfig, loading: loadingFiscal } = useFiscalConfig()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [deals, setDeals] = useState<Deal[]>([])

  // Form data - Se inicializarán con la configuración fiscal
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [leadId, setLeadId] = useState(leadIdParam || '')
  const [dealId, setDealId] = useState(dealIdParam || '')
  const [contactId, setContactId] = useState(contactIdParam || '')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteEmpresa, setClienteEmpresa] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [moneda, setMoneda] = useState('')
  const [validezDias, setValidezDias] = useState(30)
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0)
  const [impuestos, setImpuestos] = useState(0)
  const [terminosPago, setTerminosPago] = useState('')
  const [clausulas, setClausulas] = useState('')
  const [notasCliente, setNotasCliente] = useState('')

  // Inicializar moneda e impuestos una sola vez. Un IVA 0% elegido por el
  // usuario es válido y no debe volver a sustituirse por el valor del tenant.
  const fiscalDefaultsApplied = useRef(false)
  useEffect(() => {
    if (!loadingFiscal && fiscalConfig && !fiscalDefaultsApplied.current) {
      if (!moneda) setMoneda(fiscalConfig.currencyCode)
      setImpuestos(fiscalConfig.taxRate)
      fiscalDefaultsApplied.current = true
    }
  }, [fiscalConfig, loadingFiscal, moneda])

  const [items, setItems] = useState<CotizacionItem[]>([{
    id: crypto.randomUUID(),
    concepto: '',
    descripcion: '',
    cantidad: 1,
    precioUnitario: 0,
    descuento: 0,
    total: 0,
    catalogoItem: null
  }])

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    // Auto-fill client data when lead changes
    if (leadId) {
      const lead = leads.find(l => l.id === leadId)
      if (lead) {
        setClienteNombre(lead.nombre)
        setClienteEmail(lead.email || '')
        setClienteEmpresa(lead.empresa || '')
        setClienteTelefono(lead.telefono || '')
      }
    }
  }, [leadId, leads])

  useEffect(() => {
    // Auto-fill from deal
    if (dealId) {
      const deal = deals.find(d => d.id === dealId)
      if (deal) {
        if (deal.lead) {
          setLeadId(deal.lead.id)
          setClienteNombre(deal.lead.nombre)
          setClienteEmail(deal.lead.email || '')
          setClienteEmpresa(deal.lead.empresa || '')
        } else if (deal.contact) {
          setClienteNombre(deal.contact.nombre)
          setClienteEmail(deal.contact.email || '')
        }
        if (!titulo) {
          setTitulo(`Cotización - ${deal.titulo}`)
        }
      }
    }
  }, [dealId, deals])

  const fetchData = async () => {
    try {
      const [leadsRes, dealsRes] = await Promise.all([
        fetch('/api/leads?limit=100'),
        fetch('/api/deals?estado=activo')
      ])

      const leadsData = await leadsRes.json()
      const dealsData = await dealsRes.json()

      // /api/leads devuelve un array pelado (no { leads }): soportar ambos
      setLeads(Array.isArray(leadsData) ? leadsData : (leadsData.leads || []))
      if (dealsData.deals) setDeals(dealsData.deals)

      if (editIdParam) {
        const cotizacionRes = await fetch(`/api/cotizaciones/${editIdParam}`)
        const cotizacionData = await cotizacionRes.json()
        if (!cotizacionRes.ok || !cotizacionData.cotizacion) {
          toast.error(cotizacionData.error || 'No se pudo cargar la cotización')
          router.push('/dashboard/cotizaciones')
          return
        }

        const cotizacion = cotizacionData.cotizacion
        setTitulo(cotizacion.titulo || '')
        setDescripcion(cotizacion.descripcion || '')
        setLeadId(cotizacion.leadId || '')
        setDealId(cotizacion.dealId || '')
        setContactId(cotizacion.contactId || '')
        setClienteNombre(cotizacion.clienteNombre || '')
        setClienteEmail(cotizacion.clienteEmail || '')
        setClienteEmpresa(cotizacion.clienteEmpresa || '')
        setClienteTelefono(cotizacion.clienteTelefono || '')
        setMoneda(cotizacion.moneda || 'EUR')
        setValidezDias(cotizacion.validezDias || 30)
        setDescuentoPorcentaje(cotizacion.descuentoPorcentaje || 0)
        // `cotizacion.impuestos` es el importe total, no la tasa. Las líneas
        // guardan su porcentaje real y se reutilizan al editar.
        setImpuestos(cotizacion.items?.[0]?.porcentajeImpuesto ?? 0)
        setTerminosPago(cotizacion.terminosPago || '')
        setNotasCliente(cotizacion.notasCliente || '')
        setItems((cotizacion.items || []).map((item: any, index: number) => ({
          id: item.id || crypto.randomUUID(),
          catalogoItemId: item.catalogoItemId || null,
          concepto: item.concepto || '',
          descripcion: item.descripcion || '',
          cantidad: Number(item.cantidad) || 1,
          precioUnitario: Number(item.precioUnitario) || 0,
          descuento: Number(item.descuento) || 0,
          // Recalcular desde precio, cantidad y descuento para no arrastrar
          // totales corruptos de cotizaciones creadas con el bug anterior.
          total: Math.max(0, (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0) - (Number(item.descuento) || 0)),
          tasaImpuesto: item.porcentajeImpuesto ?? 0,
          tasaImpuestoId: item.tasaImpuestoId || null,
          catalogoItem: null,
        })))
      }
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const updateItem = (id: string, field: keyof CotizacionItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item

      const updated = { ...item, [field]: value }
      const bruto = Math.max(0, Number(updated.cantidad) * Number(updated.precioUnitario))
      updated.descuento = Math.min(bruto, Math.max(0, Number(updated.descuento) || 0))
      // Recalculate total using a fixed monetary discount.
      updated.total = Math.max(0, bruto - updated.descuento)
      return updated
    }))
  }

  const handleSelectCatalogoItem = (itemId: string, catalogoItem: CatalogoItemResult) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item

      const updated = {
        ...item,
        catalogoItemId: catalogoItem.id,
        catalogoItem: catalogoItem,
        concepto: catalogoItem.nombre,
        descripcion: catalogoItem.descripcion || '',
        precioUnitario: catalogoItem.precioBase,
        // El catálogo manda por línea. La categoría exento también implica 0%
        // aunque el artículo no tenga una relación TasaImpuesto configurada.
        tasaImpuesto: catalogoItem.tasaImpuesto?.porcentaje ?? (
          catalogoItem.categoriaFiscal === 'exento' ? 0 : undefined
        ),
        tasaImpuestoId: catalogoItem.tasaImpuesto?.id || null,
      }
      const bruto = Math.max(0, Number(updated.cantidad) * Number(updated.precioUnitario))
      updated.descuento = Math.min(bruto, Math.max(0, Number(updated.descuento) || 0))
      updated.total = Math.max(0, bruto - updated.descuento)
      return updated
    }))
  }

  const handleClearCatalogoItem = (itemId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      return {
        ...item,
        catalogoItemId: null,
        catalogoItem: null,
        concepto: '',
        descripcion: '',
        precioUnitario: 0,
        tasaImpuesto: undefined,
        tasaImpuestoId: null,
        total: 0,
      }
    }))
  }

  const addItem = () => {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      concepto: '',
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      descuento: 0,
      total: 0,
      catalogoItem: null
    }])
  }

  const removeItem = (id: string) => {
    if (items.length === 1) {
      toast.error('Debe haber al menos un item')
      return
    }
    setItems(prev => prev.filter(item => item.id !== id))
  }

  // Calcular totales por línea. El IVA general solo sirve como valor por
  // defecto para líneas manuales; los artículos del catálogo conservan su
  // propio tipo, permitiendo una cotización con 0%, 10%, 21%, etc.
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const descuentoMonto = subtotal * (descuentoPorcentaje / 100)
  const baseImponible = subtotal - descuentoMonto
  const factorDescuento = subtotal > 0 ? baseImponible / subtotal : 1
  const impuestosPorLinea = items.map(item => {
    const base = Math.round(item.total * factorDescuento * 100) / 100
    const tasa = item.tasaImpuesto ?? impuestos
    return Math.round(base * (tasa / 100) * 100) / 100
  })
  const montoImpuestos = impuestosPorLinea.reduce((sum, amount) => sum + amount, 0)
  const total = baseImponible + montoImpuestos
  const tasasActivas = Array.from(new Set(items.map(item => item.tasaImpuesto ?? impuestos)))
    .sort((a, b) => a - b)

  const handleSubmit = async () => {
    if (!titulo) {
      toast.error('El título es requerido')
      return
    }

    const itemsValidos = items.filter(item => item.concepto && item.precioUnitario > 0)
    if (itemsValidos.length === 0) {
      toast.error('Agrega al menos un item válido')
      return
    }
    const itemConDescuentoInvalido = itemsValidos.find(item => item.descuento > item.cantidad * item.precioUnitario)
    if (itemConDescuentoInvalido) {
      toast.error(`El descuento de «${itemConDescuentoInvalido.concepto}» no puede superar el importe de la línea`)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(isEditing ? `/api/cotizaciones/${editIdParam}` : '/api/cotizaciones', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          descripcion,
          leadId: leadId || null,
          dealId: dealId || null,
          contactId: contactId || null,
          clienteNombre,
          clienteEmail,
          clienteEmpresa,
          clienteTelefono,
          moneda,
          validezDias,
          descuentoPorcentaje,
          impuestos,
          terminosPago,
          clausulas,
          notasCliente,
          items: itemsValidos.map(item => ({
            catalogoItemId: item.catalogoItemId || null,
            concepto: item.concepto,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            descuento: item.descuento,
            // Enviar siempre el tipo efectivo: 0 es un valor explícito y no
            // debe caer al IVA del catálogo por un operador ||.
            tasaImpuestoId: item.tasaImpuestoId || item.catalogoItem?.tasaImpuesto?.id || null,
            porcentajeImpuesto: item.tasaImpuesto ?? impuestos
          }))
        })
      })

      const data = await res.json()

      if (res.ok && data.cotizacion) {
        toast.success(isEditing ? 'Cotización actualizada exitosamente' : 'Cotización creada exitosamente')
        router.push(`/dashboard/cotizaciones/${data.cotizacion.id}`)
      } else {
        toast.error(data.error || 'Error al crear cotización')
      }
    } catch (error) {
      toast.error('Error al crear cotización')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: moneda || 'MXN'
    }).format(amount)
  }

  const steps = [
    { title: 'Información', icon: FileText },
    { title: 'Cliente', icon: User },
    { title: 'Items', icon: Package },
    { title: 'Finalizar', icon: Settings2 },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header & Back */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{isEditing ? 'Editar Cotización' : 'Nueva Cotización'}</h1>
            <p className="text-muted-foreground">{isEditing ? 'Corrige los datos y vuelve a calcular la propuesta' : 'Estructura tu propuesta comercial paso a paso'}</p>
          </div>
        </div>
      </div>

      {/* Wizard Progress */}
      <div className="relative mb-12">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-muted -translate-y-1/2 rounded-full" />
        <div
          className="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 rounded-full transition-all duration-500"
          style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
        />
        <div className="relative flex justify-between">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-col items-center">
              <div
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10",
                  step > i + 1 ? "bg-primary border-primary text-white" :
                    step === i + 1 ? "bg-background border-primary text-primary shadow-lg ring-4 ring-primary/10" :
                      "bg-background border-muted text-muted-foreground"
                )}
              >
                {step > i + 1 ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              <span className={cn(
                "absolute -bottom-7 text-xs font-medium whitespace-nowrap transition-colors",
                step === i + 1 ? "text-primary" : "text-muted-foreground"
              )}>
                {s.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Section */}
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <Card className="glass-card shadow-lg border-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" /> Información General
                    </CardTitle>
                    <CardDescription>Detalles básicos para identificar la cotización</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="titulo">Título de la Cotización *</Label>
                      <Input
                        id="titulo"
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        placeholder="Ej: Propuesta de servicios de consultoría"
                        className="text-lg font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="descripcion">Descripción Interna</Label>
                      <Textarea
                        id="descripcion"
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        placeholder="Notas para el equipo..."
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Deal Asociado</Label>
                        <Select value={dealId} onValueChange={setDealId}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue placeholder="Opcional: vincular a un deal" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin deal</SelectItem>
                            {deals.map(deal => (
                              <SelectItem key={deal.id} value={deal.id}>{deal.titulo}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Lead / Prospecto</Label>
                        <Select value={leadId} onValueChange={setLeadId}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue placeholder="Vincular a un lead" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin lead</SelectItem>
                            {leads.map(lead => (
                              <SelectItem key={lead.id} value={lead.id}>
                                {lead.nombre} {lead.empresa ? `(${lead.empresa})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <Card className="glass-card shadow-lg border-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" /> Datos del Cliente
                    </CardTitle>
                    <CardDescription>Confirmar o editar datos de facturación y contacto</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nombre / Razón Social *</Label>
                        <Input
                          value={clienteNombre}
                          onChange={(e) => setClienteNombre(e.target.value)}
                          placeholder="Nombre del cliente"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={clienteEmail}
                          onChange={(e) => setClienteEmail(e.target.value)}
                          placeholder="email@ejemplo.com"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Empresa</Label>
                        <Input
                          value={clienteEmpresa}
                          onChange={(e) => setClienteEmpresa(e.target.value)}
                          placeholder="Nombre de la empresa"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Teléfono</Label>
                        <Input
                          value={clienteTelefono}
                          onChange={(e) => setClienteTelefono(e.target.value)}
                          placeholder="+52 55 1234 5678"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <Card className="glass-card shadow-lg border-primary/5">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" /> Items de la Propuesta
                      </CardTitle>
                      <CardDescription>Añade productos o servicios del catálogo</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={addItem} className="h-8">
                      <Plus className="h-4 w-4 mr-2" /> Agregar Item
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {items.map((item, index) => (
                      <Card key={item.id} className="p-4 bg-muted/20 border-muted relative group">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                          className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>

                        <div className="space-y-4">
                          <CatalogSearchSelect
                            value={item.catalogoItem}
                            onSelect={(catalogoItem) => handleSelectCatalogoItem(item.id, catalogoItem)}
                            onClear={() => handleClearCatalogoItem(item.id)}
                            placeholder="Buscar en catálogo..."
                            moneda={moneda || 'EUR'}
                            allowQuickCreate={true}
                          />

                          {!item.catalogoItem && (
                            <Input
                              value={item.concepto}
                              onChange={(e) => updateItem(item.id, 'concepto', e.target.value)}
                              placeholder="Concepto manual..."
                            />
                          )}

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Cant.</Label>
                              <Input
                                type="number"
                                value={item.cantidad}
                                onChange={(e) => updateItem(item.id, 'cantidad', parseFloat(e.target.value) || 1)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Precio Unit.</Label>
                              <Input
                                type="number"
                                value={item.precioUnitario}
                                onChange={(e) => updateItem(item.id, 'precioUnitario', parseFloat(e.target.value) || 0)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Desc. (€)</Label>
                              <Input
                                type="number"
                                min="0"
                                max={Math.max(0, item.cantidad * item.precioUnitario)}
                                step="0.01"
                                value={item.descuento}
                                onChange={(e) => updateItem(item.id, 'descuento', parseFloat(e.target.value) || 0)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">IVA %</Label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={item.tasaImpuesto ?? impuestos}
                                onChange={(e) => updateItem(item.id, 'tasaImpuesto', parseFloat(e.target.value) || 0)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1 flex flex-col justify-end">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold text-right">Subtotal</Label>
                              <p className="text-sm font-bold text-right h-8 flex items-center justify-end">
                                {formatCurrency(item.total)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <Card className="glass-card shadow-lg border-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5 text-primary" /> Configuración y Notas
                    </CardTitle>
                    <CardDescription>Ajustes fiscales y términos comerciales</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Moneda</Label>
                        <Select value={moneda} onValueChange={setMoneda}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MXN">MXN</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Validez (días)</Label>
                        <Input
                          type="number"
                          value={validezDias}
                          onChange={(e) => setValidezDias(parseInt(e.target.value) || 30)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{fiscalConfig?.taxName || 'IVA'} por defecto (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={impuestos}
                          onChange={(e) => setImpuestos(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Se usa solo en líneas manuales; cada producto o servicio conserva su propio IVA.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Términos de Pago</Label>
                        <Textarea
                          value={terminosPago}
                          onChange={(e) => setTerminosPago(e.target.value)}
                          placeholder="Ej: 50% anticipo, 50% contra entrega"
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Notas Adicionales</Label>
                        <Textarea
                          value={notasCliente}
                          onChange={(e) => setNotasCliente(e.target.value)}
                          placeholder="Visible para el cliente..."
                          rows={3}
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Label>Cláusulas (se heredan al contrato al aceptar)</Label>
                      <PlaceholderHelp onInsert={(t) => setClausulas(clausulas + (clausulas ? ' ' : '') + t)} />
                      <Textarea
                        value={clausulas}
                          onChange={(e) => setClausulas(e.target.value)}
                          placeholder="Obligaciones y términos legales..."
                          rows={4}
                        />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center pt-8 border-t">
            <Button
              variant="outline"
              onClick={() => setStep(prev => Math.max(1, prev - 1))}
              disabled={step === 1}
              className="px-6"
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Anterior
            </Button>

            {step < steps.length ? (
              <Button
                onClick={() => setStep(prev => prev + 1)}
                className="px-8 bg-primary hover:bg-primary/90 shadow-md shadow-primary/20"
              >
                Siguiente <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="px-10 premium-gradient-primary border-none shadow-lg shadow-primary/30"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Confirmar y Guardar
              </Button>
            )}
          </div>
        </div>

        {/* Sticky Summary Sidebar */}
        <div>
          <Card className="sticky top-6 glass-card overflow-hidden border-none shadow-2xl">
            <div className="bg-primary p-4 text-white">
              <h3 className="font-bold flex items-center gap-2">
                <Calculator className="h-5 w-5" /> Resumen Económico
              </h3>
            </div>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(subtotal)}</span>
                </div>
                {descuentoPorcentaje > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600 font-medium uppercase tracking-wider text-[10px]">Descuento ({descuentoPorcentaje}%)</span>
                    <span className="font-semibold text-emerald-600">-{formatCurrency(descuentoMonto)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Base Imponible</span>
                  <span className="font-semibold">{formatCurrency(baseImponible)}</span>
                </div>
                <div className="flex justify-between text-sm border-b border-dashed pb-3">
                  <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">{fiscalConfig?.taxName || 'IVA'} por líneas ({tasasActivas.map(rate => `${rate}%`).join(' + ')})</span>
                  <span className="font-semibold">{formatCurrency(montoImpuestos)}</span>
                </div>
                <div className="flex justify-between items-end pt-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">Total Final</span>
                  <span className="text-3xl font-black text-primary tracking-tighter">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              <div className="pt-4 space-y-2">
                <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100/50">
                  <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Items</p>
                  <p className="text-sm font-medium">{items.length} conceptos registrados</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-100/50">
                  <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Validez</p>
                  <p className="text-sm font-medium">{validezDias} días naturales</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
