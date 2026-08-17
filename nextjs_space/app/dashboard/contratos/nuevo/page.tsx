'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  Loader2,
  Package,
  CheckCircle2,
  User,
  FileText,
  Settings2,
  Calendar,
  Calculator,
  GripVertical,
  RefreshCw,
  FileStack
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useFiscalConfig } from '@/hooks/use-fiscal-config'
import { CatalogSearchSelect, CatalogoItemResult } from '@/components/catalogo/CatalogSearchSelect'
import { ContactSearchSelect, ContactResult } from '@/components/ventas/ContactSearchSelect'
import { ContratoTemplatesManager, ContratoTemplate } from '@/components/contratos/ContratoTemplatesManager'

interface Item {
  id: string
  catalogoItemId?: string | null
  catalogoItem?: CatalogoItemResult | null
  concepto: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  tasaImpuesto?: number
}

export default function NuevoContratoPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <NuevoContratoContent />
    </Suspense>
  )
}

function NuevoContratoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cotizacionId = searchParams.get('cotizacionId')
  const dealId = searchParams.get('dealId')
  const leadId = searchParams.get('leadId')

  // Cargar configuración fiscal del tenant
  const { config: fiscalConfig, loading: loadingFiscal } = useFiscalConfig()

  const [saving, setSaving] = useState(false)
  const [loadingCotizacion, setLoadingCotizacion] = useState(false)
  const [step, setStep] = useState(1)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  // Formulario - Se inicializarán con la configuración fiscal
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState('servicio')
  const [moneda, setMoneda] = useState('')
  const [items, setItems] = useState<Item[]>([{
    id: '1',
    concepto: '',
    descripcion: '',
    cantidad: 1,
    precioUnitario: 0,
    catalogoItem: null
  }])
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0)
  const [incluyeIva, setIncluyeIva] = useState(true)
  const [tasaIva, setTasaIva] = useState(0)

  // Cliente
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteEmpresa, setClienteEmpresa] = useState('')
  const [clienteIdFiscal, setClienteIdFiscal] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null)

  // Inicializar con la configuración fiscal del tenant
  useEffect(() => {
    if (!loadingFiscal && fiscalConfig) {
      if (!moneda) setMoneda(fiscalConfig.currencyCode)
      if (tasaIva === 0) setTasaIva(fiscalConfig.taxRate)
    }
  }, [fiscalConfig, loadingFiscal, moneda, tasaIva])

  // Configuración
  const [metodoPago, setMetodoPago] = useState('')
  const [frecuenciaPago, setFrecuenciaPago] = useState('unico')
  const [condicionesPago, setCondicionesPago] = useState('')
  const [clausulas, setClausulas] = useState('')
  const [notasCliente, setNotasCliente] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  // IDs relacionados
  const [selectedDealId, setSelectedDealId] = useState(dealId || '')
  const [selectedLeadId, setSelectedLeadId] = useState(leadId || '')
  const [selectedCotizacionId, setSelectedCotizacionId] = useState(cotizacionId || '')

  // Cargar datos de cotización si existe
  useEffect(() => {
    if (cotizacionId) {
      loadCotizacion(cotizacionId)
    }
  }, [cotizacionId])

  const loadCotizacion = async (id: string) => {
    setLoadingCotizacion(true)
    try {
      const res = await fetch(`/api/cotizaciones/${id}`)
      if (res.ok) {
        const cot = await res.json()
        setTitulo(cot.titulo)
        setDescripcion(cot.descripcion || '')
        setMoneda(cot.moneda)
        setDescuentoPorcentaje(cot.descuentoPorcentaje || 0)
        setIncluyeIva(cot.impuestos > 0)
        setCondicionesPago(cot.terminosPago || '')
        setNotasCliente(cot.notasCliente || '')
        setClienteNombre(cot.clienteNombre || '')
        setClienteEmail(cot.clienteEmail || '')
        setClienteTelefono(cot.clienteTelefono || '')
        setClienteEmpresa(cot.clienteEmpresa || '')
        setSelectedDealId(cot.dealId || '')
        setSelectedLeadId(cot.leadId || '')
        setSelectedCotizacionId(id)
        if (cot.items && cot.items.length > 0) {
          setItems(cot.items.map((item: any, idx: number) => ({
            id: String(idx + 1),
            catalogoItemId: item.catalogoItemId || null,
            catalogoItem: item.catalogoItem || null,
            concepto: item.concepto,
            descripcion: item.descripcion || '',
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            tasaImpuesto: item.porcentajeImpuesto || 0
          })))
        }
        toast.success('Datos cargados desde cotización')
      }
    } catch (error) {
      toast.error('Error al cargar cotización')
    } finally {
      setLoadingCotizacion(false)
    }
  }

  const addItem = () => {
    setItems([...items, {
      id: String(Date.now()),
      concepto: '',
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      catalogoItem: null
    }])
  }

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id))
    }
  }

  const updateItem = (id: string, field: keyof Item, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const handleSelectCatalogoItem = (itemId: string, catalogoItem: CatalogoItemResult) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      return {
        ...item,
        catalogoItemId: catalogoItem.id,
        catalogoItem: catalogoItem,
        concepto: catalogoItem.nombre,
        descripcion: catalogoItem.descripcion || '',
        precioUnitario: catalogoItem.precioBase,
        tasaImpuesto: catalogoItem.tasaImpuesto?.porcentaje,
      }
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
      }
    }))
  }

  // Cálculos
  const subtotal = items.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0)
  const descuentoMonto = subtotal * descuentoPorcentaje / 100
  const subtotalConDescuento = subtotal - descuentoMonto
  const ivaMonto = incluyeIva ? subtotalConDescuento * (tasaIva / 100) : 0
  const total = subtotalConDescuento + ivaMonto

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda || 'EUR' }).format(amount)
  }

  const handleSubmit = async () => {
    if (!titulo) {
      toast.error('El título es requerido')
      return
    }
    if (items.some(item => !item.concepto || item.precioUnitario <= 0)) {
      toast.error('Todos los items deben tener concepto y precio')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/contratos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          descripcion,
          tipo,
          moneda,
          contactId: selectedContact?.id || null,
          items: items.map(item => ({
            catalogoItemId: item.catalogoItemId || null,
            concepto: item.concepto,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            porcentajeImpuesto: item.tasaImpuesto || 0
          })),
          descuentoPorcentaje,
          incluyeIva,
          metodoPago,
          frecuenciaPago,
          condicionesPago,
          clausulas,
          notasCliente,
          fechaInicio: fechaInicio || null,
          fechaFin: fechaFin || null,
          clienteNombre,
          clienteEmail,
          clienteTelefono,
          clienteEmpresa,
          clienteIdFiscal,
          clienteDireccion,
          dealId: selectedDealId || null,
          leadId: selectedLeadId || null,
          cotizacionId: selectedCotizacionId || null
        })
      })

      if (res.ok) {
        const contrato = await res.json()
        toast.success('Contrato creado correctamente')
        router.push(`/dashboard/contratos/${contrato.id}`)
      } else {
        const error = await res.json()
        toast.error(error.error || 'Error al crear contrato')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  if (loadingCotizacion) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const steps = [
    { title: 'Información', icon: FileText },
    { title: 'Cliente', icon: User },
    { title: 'Objeto', icon: Package },
    { title: 'Términos', icon: Calendar },
    { title: 'Revisión', icon: Settings2 },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header & Back */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/contratos')} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Nuevo Contrato</h1>
            <p className="text-muted-foreground">
              {cotizacionId ? 'Generando contrato desde cotización' : 'Formaliza tu acuerdo comercial'}
            </p>
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
                      <FileText className="h-5 w-5 text-primary" /> Información del Contrato
                    </CardTitle>
                    <CardDescription>Detalles básicos de identificación</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Selector de plantilla reutilizable */}
                    <div className="rounded-lg border border-dashed bg-slate-50/60 p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <FileStack className="h-4 w-4 text-blue-700" />
                        <span>
                          <span className="font-medium">Plantilla:</span>{' '}
                          {templatesOpen ? 'eligiendo…' : '¿Empezar desde una plantilla? (servicios, confidencialidad…)'}
                        </span>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => setTemplatesOpen(true)}>
                        Elegir plantilla
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>Título del Contrato *</Label>
                      <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Contrato de Mantenimiento Anual" className="text-lg font-medium" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tipo de Contrato</Label>
                        <Select value={tipo} onValueChange={setTipo}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="servicio">Servicio</SelectItem>
                            <SelectItem value="venta">Venta</SelectItem>
                            <SelectItem value="suscripcion">Suscripción</SelectItem>
                            <SelectItem value="otro">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Moneda</Label>
                        <Select value={moneda} onValueChange={setMoneda}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MXN">MXN</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Descripción General</Label>
                      <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Breve descripción del alcance..." rows={3} />
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
                    <CardDescription>Información legal y de contacto</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <Label className="text-sm font-semibold text-primary uppercase tracking-wider">Identidad Legal</Label>
                      <ContactSearchSelect
                        value={selectedContact}
                        onSelect={(contact) => {
                          setSelectedContact(contact);
                          setClienteNombre(contact.nombre);
                          setClienteEmail(contact.email);
                          setClienteTelefono(contact.telefono || '');
                          setClienteEmpresa(contact.company?.nombre || '');
                          setClienteIdFiscal(contact.perfilFiscal?.nif || '');
                          setClienteDireccion(contact.perfilFiscal?.direccion || contact.ubicacion || '');
                        }}
                        onClear={() => setSelectedContact(null)}
                      />
                      {!selectedContact?.perfilFiscal?.nif && selectedContact && (
                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs flex items-center gap-2">
                          <Settings2 className="h-4 w-4" />
                          <span>Atención: Este contacto no tiene un NIF validado. El contrato podría ser rechazado por gobernanza fiscal.</span>
                        </div>
                      )}
                    </div>

                    <Separator className="my-2" />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nombre / Razón Social *</Label>
                        <Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Ej: Juan Pérez o Empresa S.L." />
                      </div>
                      <div className="space-y-2">
                        <Label>Empresa / Marca</Label>
                        <Input value={clienteEmpresa} onChange={(e) => setClienteEmpresa(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Email de contacto</Label>
                        <Input type="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Teléfono</Label>
                        <Input value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{fiscalConfig?.fiscalIdLabel || 'NIF / CIF'} *</Label>
                        <Input 
                          value={clienteIdFiscal} 
                          onChange={(e) => setClienteIdFiscal(e.target.value)}
                          className={cn(!clienteIdFiscal && "border-destructive/50")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Dirección Fiscal / Legal</Label>
                        <Input value={clienteDireccion} onChange={(e) => setClienteDireccion(e.target.value)} />
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
                        <Package className="h-5 w-5 text-primary" /> Objeto del Contrato
                      </CardTitle>
                      <CardDescription>Productos o servicios contratados</CardDescription>
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

                          <div className="grid grid-cols-4 gap-4">
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
                            <div className="space-y-1 col-span-2 flex flex-col justify-end">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold text-right">Subtotal</Label>
                              <p className="text-sm font-bold text-right h-8 flex items-center justify-end">
                                {formatCurrency(item.cantidad * item.precioUnitario)}
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
                      <Calendar className="h-5 w-5 text-primary" /> Términos y Configuración
                    </CardTitle>
                    <CardDescription>Plazos y condiciones de pago</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Método de Pago</Label>
                        <Select value={metodoPago} onValueChange={setMetodoPago}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="tarjeta">Tarjeta</SelectItem>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                            <SelectItem value="otro">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Frecuencia de Pago</Label>
                        <Select value={frecuenciaPago} onValueChange={setFrecuenciaPago}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unico">Pago Único</SelectItem>
                            <SelectItem value="mensual">Mensual</SelectItem>
                            <SelectItem value="trimestral">Trimestral</SelectItem>
                            <SelectItem value="anual">Anual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fecha de Inicio</Label>
                        <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Fecha de Fin</Label>
                        <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Condiciones de Pago</Label>
                      <Textarea value={condicionesPago} onChange={(e) => setCondicionesPago(e.target.value)} placeholder="Ej: Pago antes de los primeros 5 días..." rows={2} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cláusulas Especiales</Label>
                      <Textarea value={clausulas} onChange={(e) => setClausulas(e.target.value)} placeholder="Obligaciones y términos legales..." rows={4} />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <Card className="glass-card shadow-lg border-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" /> Revisión Final
                    </CardTitle>
                    <CardDescription>Confirma los ajustes finales antes de crear</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Descuento Global (%)</Label>
                          <Input type="number" min="0" max="100" value={descuentoPorcentaje} onChange={(e) => setDescuentoPorcentaje(Number(e.target.value))} />
                        </div>
                        <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/30 border border-muted">
                          <Checkbox id="iva" checked={incluyeIva} onCheckedChange={(checked) => setIncluyeIva(checked as boolean)} />
                          <Label htmlFor="iva" className="cursor-pointer text-sm font-medium">Incluir {fiscalConfig?.taxName || 'IVA'} ({tasaIva}%)</Label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Notas Finales</Label>
                        <Textarea value={notasCliente} onChange={(e) => setNotasCliente(e.target.value)} placeholder="Notas visibles para el cliente..." rows={4} />
                      </div>
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
                disabled={saving}
                className="px-10 premium-gradient-primary border-none shadow-lg shadow-primary/30"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Finalizar y Guardar
              </Button>
            )}
          </div>
        </div>

        {/* Sticky Summary Sidebar */}
        <div>
          <Card className="sticky top-6 glass-card overflow-hidden border-none shadow-2xl">
            <div className="bg-primary p-4 text-white">
              <h3 className="font-bold flex items-center gap-2">
                <Calculator className="h-5 w-5" /> Resumen del Acuerdo
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
                {incluyeIva && (
                  <div className="flex justify-between text-sm border-b border-dashed pb-3">
                    <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">{fiscalConfig?.taxName || 'IVA'} ({tasaIva}%)</span>
                    <span className="font-semibold">{formatCurrency(ivaMonto)}</span>
                  </div>
                )}
                <div className="flex justify-between items-end pt-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">Total Contrato</span>
                  <span className="text-3xl font-black text-primary tracking-tighter">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              <div className="pt-4 space-y-2">
                <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100/50">
                  <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Frecuencia</p>
                  <p className="text-sm font-medium">{frecuenciaPago === 'unico' ? 'Pago Único' : frecuenciaPago === 'mensual' ? 'Mensual' : frecuenciaPago === 'trimestral' ? 'Trimestral' : 'Anual'}</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-100/50">
                  <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Duración</p>
                  <p className="text-sm font-medium">
                    {fechaInicio && fechaFin ? `${fechaInicio} al ${fechaFin}` : 'Indefinido'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Gestor de plantillas: al elegir, rellena los campos del contrato */}
      <ContratoTemplatesManager
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onSelect={(t: ContratoTemplate) => {
          setTitulo(t.nombre)
          if (t.tipo !== 'otro') setTipo(t.tipo === 'confidencialidad' ? 'servicio' : t.tipo)
          setDescripcion(t.descripcion || '')
          setClausulas(t.clausulas || '')
          setCondicionesPago(t.condicionesPago || '')
          toast.success(`Plantilla "${t.nombre}" aplicada`)
          setTemplatesOpen(false)
        }}
      />
    </div>
  )
}
