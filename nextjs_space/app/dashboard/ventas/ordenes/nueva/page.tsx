'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useFiscalConfig } from '@/hooks/use-fiscal-config';
import { CatalogSearchSelect, CatalogoItemResult } from '@/components/catalogo/CatalogSearchSelect';
import {
  FileText, Plus, Trash2, Calculator, ArrowLeft, ArrowRight, Save, Send,
  Building2, User, AlertCircle, Globe, Info, Package, CheckCircle2, RefreshCw,
  Settings2, Calendar, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface LineItem {
  id: string;
  catalogoItemId?: string | null;
  catalogoItem?: CatalogoItemResult | null;
  concepto: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  tasaImpuesto?: number;
  tasaRetencion?: number;
}

interface Lead {
  id: string;
  nombre: string;
  email: string;
  empresa: string | null;
  pais: string | null;
}

interface Contact {
  id: string;
  nombre: string;
  email: string;
  tipo: string;
}

interface Emisor {
  id: string;
  razonSocial: string;
  nombreComercial: string | null;
  pais: string;
  esPrincipal: boolean;
}

export default function NuevaOrdenVentaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedLeadId = searchParams.get('leadId');
  const preselectedContactId = searchParams.get('contactId');
  const preselectedDealId = searchParams.get('dealId');

  // Estado del formulario
  const [clientType, setClientType] = useState<'lead' | 'contact'>('lead');
  const [selectedLeadId, setSelectedLeadId] = useState(preselectedLeadId || '');
  const [selectedContactId, setSelectedContactId] = useState(preselectedContactId || '');
  const [selectedEmisorId, setSelectedEmisorId] = useState('');
  const [clientePais, setClientePais] = useState('');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [emisores, setEmisores] = useState<Emisor[]>([]);

  const [fechaOrden, setFechaOrden] = useState(new Date().toISOString().split('T')[0]);
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [referenciaCliente, setReferenciaCliente] = useState('');
  const [notas, setNotas] = useState('');
  const [condicionesVenta, setCondicionesVenta] = useState('');
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);

  const [items, setItems] = useState<LineItem[]>([{
    id: crypto.randomUUID(),
    concepto: '',
    descripcion: '',
    cantidad: 1,
    precioUnitario: 0,
    descuento: 0,
    catalogoItem: null,
  }]);

  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [step, setStep] = useState(1);

  // Hook de configuración fiscal dinámica
  const { config, loading: loadingConfig, calculateTotals, formatCurrency } = useFiscalConfig({
    leadId: clientType === 'lead' ? selectedLeadId : undefined,
    contactId: clientType === 'contact' ? selectedContactId : undefined,
    emisorId: selectedEmisorId || undefined,
    clientePais: clientePais || undefined,
  });

  // EFECTO: Auto-relleno fiscal cuando cambia el cliente
  useEffect(() => {
    if (config.cliente && items.length > 0) {
      setItems(prev => prev.map(item => ({
        ...item,
        // Si el item no tiene un impuesto manual o del catálogo, usamos el default del cliente
        tasaImpuesto: item.tasaImpuesto ?? config.cliente?.defaultIva ?? config.taxRate,
        tasaRetencion: item.tasaRetencion ?? config.cliente?.defaultIrpf ?? 0,
      })));
      
      if (config.cliente.defaultIrpf > 0) {
        toast.info(`Aplicada Retención IRPF del ${config.cliente.defaultIrpf}% (Gobernanza)`);
      }
    }
  }, [config.cliente?.id, config.cliente?.defaultIva, config.cliente?.defaultIrpf]);

  // Cargar datos iniciales
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [leadsRes, contactsRes, emisoresRes] = await Promise.all([
          fetch('/api/leads?limit=500'),
          fetch('/api/contacts?limit=500'),
          fetch('/api/configuracion/fiscal/emisores'),
        ]);

        if (leadsRes.ok) {
          const data = await leadsRes.json();
          setLeads(data.leads || []);
        }
        if (contactsRes.ok) {
          const data = await contactsRes.json();
          setContacts(data.contacts || data || []);
        }
        if (emisoresRes.ok) {
          const data = await emisoresRes.json();
          const emisoresList = data.emisores || [];
          setEmisores(emisoresList);
          // Seleccionar emisor principal por defecto
          const principal = emisoresList.find((e: Emisor) => e.esPrincipal);
          if (principal) setSelectedEmisorId(principal.id);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);

  // Actualizar país del cliente cuando cambia la selección
  useEffect(() => {
    if (clientType === 'lead' && selectedLeadId) {
      const lead = leads.find(l => l.id === selectedLeadId);
      if (lead?.pais) setClientePais(lead.pais);
    }
  }, [selectedLeadId, clientType, leads]);

  // CALCULO DE TOTALES: Actualizado para incluir retención
  const totals = useMemo(() => {
    const lineItems = items.map(item => ({
      concepto: item.concepto,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      descuento: item.descuento,
      tasaImpuesto: item.tasaImpuesto,
      tasaRetencion: item.tasaRetencion,
    }));
    return calculateTotals(lineItems, descuentoGlobal);
  }, [items, descuentoGlobal, calculateTotals]);

  // Manejar cambios en items
  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleSelectCatalogoItem = (itemId: string, catalogoItem: CatalogoItemResult) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        catalogoItemId: catalogoItem.id,
        catalogoItem: catalogoItem,
        concepto: catalogoItem.nombre,
        descripcion: catalogoItem.descripcion || '',
        precioUnitario: catalogoItem.precioBase,
        tasaImpuesto: catalogoItem.tasaImpuesto?.porcentaje,
      };
    }));
  };

  const handleClearCatalogoItem = (itemId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        catalogoItemId: null,
        catalogoItem: null,
        concepto: '',
        descripcion: '',
        precioUnitario: 0,
        tasaImpuesto: undefined,
      };
    }));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      concepto: '',
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      descuento: 0,
      catalogoItem: null,
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // Guardar orden
  const handleSubmit = async (sendEmail: boolean = false) => {
    // Validaciones
    if (!selectedLeadId && !selectedContactId) {
      toast.error('Selecciona un cliente');
      return;
    }

    const validItems = items.filter(i => i.concepto && i.precioUnitario > 0);
    if (validItems.length === 0) {
      toast.error('Agrega al menos un item válido');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        leadId: clientType === 'lead' ? selectedLeadId : null,
        contactId: clientType === 'contact' ? selectedContactId : null,
        emisorId: selectedEmisorId || null,
        dealId: preselectedDealId || null,
        fechaOrden,
        fechaEntrega: fechaEntrega || null,
        referenciaCliente: referenciaCliente || null,
        notas: notas || null,
        condicionesVenta: condicionesVenta || null,
        moneda: config.currencyCode,
        descuentoGlobal,
        tipoDescuento: 'porcentaje',
        items: validItems.map(item => ({
          catalogoItemId: item.catalogoItemId || null,
          concepto: item.concepto,
          descripcion: item.descripcion || null,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          descuento: item.descuento,
          porcentajeImpuesto: item.tasaImpuesto !== undefined ? item.tasaImpuesto : config.taxRate,
          porcentajeRetencion: item.tasaRetencion || 0,
        })),
      };

      const res = await fetch('/api/ordenes-venta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success('Orden de venta creada');

        if (sendEmail) {
          // Enviar por email
          await fetch(`/api/ordenes-venta/${data.id}/send`, { method: 'POST' });
          toast.success('Orden enviada por email');
        }

        router.push(`/dashboard/ventas/ordenes/${data.id}`);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al crear orden');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const selectedClient = clientType === 'lead'
    ? leads.find(l => l.id === selectedLeadId)
    : contacts.find(c => c.id === selectedContactId);

  const steps = [
    { title: 'Entidades', icon: Building2 },
    { title: 'Referencia', icon: Calendar },
    { title: 'Productos', icon: Package },
    { title: 'Confirmar', icon: Settings2 },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header & Back */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ventas/ordenes">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Nueva Orden de Venta</h1>
            <p className="text-muted-foreground text-sm">
              Configuración: {config.fiscalIdLabel} | {config.taxName} {config.taxRate}%
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
                {/* Alertas */}
                {config.esOperacionExtranjera && (
                  <Alert className="bg-blue-50/50 border-blue-100">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-700">
                      <strong>Operación Internacional:</strong> Cliente en {clientePais}.
                      {config.aplicaReverseCharge && ' Aplica Reverse Charge.'} Tax: 0%.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 gap-6">
                  <Card className="glass-card shadow-lg border-primary/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" /> Selección de Cliente
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant={clientType === 'lead' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => { setClientType('lead'); setSelectedContactId(''); }}
                        >
                          <User className="h-4 w-4 mr-1" /> Lead
                        </Button>
                        <Button
                          variant={clientType === 'contact' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => { setClientType('contact'); setSelectedLeadId(''); }}
                        >
                          <Building2 className="h-4 w-4 mr-1" /> Contacto
                        </Button>
                      </div>

                      {clientType === 'lead' ? (
                        <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue placeholder="Seleccionar lead" />
                          </SelectTrigger>
                          <SelectContent>
                            {leads.map(lead => (
                              <SelectItem key={lead.id} value={lead.id}>
                                {lead.nombre} {lead.empresa ? `(${lead.empresa})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue placeholder="Seleccionar contacto" />
                          </SelectTrigger>
                          <SelectContent>
                            {contacts.map(contact => (
                              <SelectItem key={contact.id} value={contact.id}>
                                {contact.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {config.cliente && (
                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-2 text-sm relative overflow-hidden">
                          {config.cliente.isLocked && (
                            <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] px-2 py-0.5 font-bold uppercase tracking-tighter shadow-sm flex items-center gap-1 z-10">
                              <ShieldCheck className="h-3 w-3" /> Fiscalmente Bloqueado
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              {config.fiscalIdLabel}:
                              {config.cliente.nif && <Badge variant="outline" className="text-[10px] py-0 border-emerald-500/30 bg-emerald-500/5 text-emerald-700 h-4 px-1 gap-1">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Validado
                              </Badge>}
                            </span>
                            <span className={cn("font-bold", config.cliente.isLocked && "text-muted-foreground")}>
                              {config.cliente.nif || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">País:</span>
                            <span className="font-medium">{config.cliente.pais}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="glass-card shadow-lg border-primary/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" /> Entidad Emisora
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Select value={selectedEmisorId} onValueChange={setSelectedEmisorId}>
                        <SelectTrigger className="bg-muted/30">
                          <SelectValue placeholder="Seleccionar emisor" />
                        </SelectTrigger>
                        <SelectContent>
                          {emisores.map(emisor => (
                            <SelectItem key={emisor.id} value={emisor.id}>
                              {emisor.nombreComercial || emisor.razonSocial}
                              {emisor.esPrincipal && ' (Principal)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {config.emisor && (
                        <div className="p-4 rounded-xl bg-muted/50 border border-muted space-y-1 text-sm">
                          <p className="font-bold text-primary">{config.emisor.razonSocial}</p>
                          <p className="text-muted-foreground">{config.fiscalIdLabel}: {config.emisor.idFiscal}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
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
                      <Calendar className="h-5 w-5 text-primary" /> Referencia y Tiempos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fecha Orden *</Label>
                        <Input type="date" value={fechaOrden} onChange={(e) => setFechaOrden(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Fecha Entrega</Label>
                        <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Referencia Externo (PO #)</Label>
                      <Input
                        value={referenciaCliente}
                        onChange={(e) => setReferenciaCliente(e.target.value)}
                        placeholder="Ej: ORD-2024-001"
                        className="font-mono"
                      />
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
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Package className="h-5 w-5 text-primary" /> Productos / Servicios
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={addItem} className="h-8 border-primary/20 hover:bg-primary/5">
                      <Plus className="h-4 w-4 mr-1" /> Añadir
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
                            moneda={config.currencyCode}
                            allowQuickCreate={true}
                          />

                          {!item.catalogoItem && (
                            <div className="grid grid-cols-2 gap-3">
                              <Input
                                value={item.concepto}
                                onChange={(e) => updateItem(item.id, 'concepto', e.target.value)}
                                placeholder="Concepto manual..."
                                className="bg-background"
                              />
                              <Input
                                value={item.descripcion}
                                onChange={(e) => updateItem(item.id, 'descripcion', e.target.value)}
                                placeholder="Descripción..."
                                className="bg-background text-xs"
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-4 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Cant.</Label>
                              <Input
                                type="number"
                                value={item.cantidad}
                                onChange={(e) => updateItem(item.id, 'cantidad', parseFloat(e.target.value) || 1)}
                                className="h-8 bg-background"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Precio Uint.</Label>
                              <Input
                                type="number"
                                value={item.precioUnitario}
                                onChange={(e) => updateItem(item.id, 'precioUnitario', parseFloat(e.target.value) || 0)}
                                className="h-8 bg-background"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">IVA %</Label>
                              <Input
                                type="number"
                                value={item.tasaImpuesto}
                                onChange={(e) => updateItem(item.id, 'tasaImpuesto', parseFloat(e.target.value) || 0)}
                                className="h-8 bg-background"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">IRPF %</Label>
                              <Input
                                type="number"
                                value={item.tasaRetencion}
                                onChange={(e) => updateItem(item.id, 'tasaRetencion', parseFloat(e.target.value) || 0)}
                                className="h-8 bg-background text-primary font-bold"
                              />
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
                    <CardTitle className="text-lg">Configuración Final</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Descuento Global (%)</Label>
                      <Input
                        type="number"
                        max="100"
                        value={descuentoGlobal}
                        onChange={(e) => setDescuentoGlobal(parseFloat(e.target.value) || 0)}
                        className="max-w-[150px]"
                      />
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Notas (Visibles en PDF)</Label>
                        <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: Favor de entregar en almacén central..." rows={3} />
                      </div>
                      <div className="space-y-2">
                        <Label>Condiciones Especiales</Label>
                        <Textarea value={condicionesVenta} onChange={(e) => setCondicionesVenta(e.target.value)} placeholder="Términos de pago, garantía..." rows={3} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Nav Buttons */}
          <div className="flex justify-between items-center pt-8 border-t">
            <Button
              variant="outline"
              onClick={() => setStep(prev => Math.max(1, prev - 1))}
              disabled={step === 1}
              className="px-6 rounded-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Anterior
            </Button>

            {step < steps.length ? (
              <Button
                onClick={() => setStep(prev => prev + 1)}
                className="px-8 bg-primary rounded-full hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                Siguiente <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(false)}
                  disabled={saving}
                  className="rounded-full px-6"
                >
                  <Save className="h-4 w-4 mr-2" /> Borrador
                </Button>
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={saving}
                  className="px-10 rounded-full premium-gradient-primary border-none shadow-xl shadow-primary/30"
                >
                  {saving ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Guardar y Enviar
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Totals Sidebar */}
        <div className="space-y-6">
          <Card className="sticky top-6 glass-card overflow-hidden border-none shadow-2xl">
            <div className="bg-primary/90 backdrop-blur-md p-6 text-white text-center">
              <p className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-80 mb-2">Total de Orden</p>
              <h3 className="text-4xl font-black tracking-tighter">
                {formatCurrency(totals.total)}
              </h3>
              <p className="text-[10px] mt-2 opacity-60">{config.currencyCode} | {config.taxName} {config.taxRate}%</p>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium uppercase text-[10px]">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(totals.subtotal)}</span>
                </div>
                {totals.descuentoTotal > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span className="font-medium uppercase text-[10px]">Descuento Total</span>
                    <span className="font-bold">-{formatCurrency(totals.descuentoTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium uppercase text-[10px]">Base Imponible</span>
                  <span className="font-semibold">{formatCurrency(totals.baseImponible)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-dashed pt-3">
                  <span className="text-muted-foreground font-medium uppercase text-[10px]">{config.taxName} ({config.taxRate}%)</span>
                  <span className="font-semibold">{formatCurrency(totals.impuesto)}</span>
                </div>
                {totals.retencion > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span className="font-medium uppercase text-[10px]">Retención IRPF</span>
                    <span className="font-bold">-{formatCurrency(totals.retencion)}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Info className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Entrega Estimada</p>
                    <p className="text-sm font-medium">{fechaEntrega || 'Por definir'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Items</p>
                    <p className="text-sm font-medium">{items.length} productos</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
