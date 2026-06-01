'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, Trash2, Receipt, FileText, ShieldCheck, 
  CheckCircle2, Clock, AlertCircle, Euro, User,
  Building2, Mail, MapPin, Hash
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface InvoiceItem {
  id: string;
  concepto: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  impuestos: number;
}

interface ManualInvoiceModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ManualInvoiceModal({ open, onOpenChange, onSuccess }: ManualInvoiceModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [clientData, setClientData] = useState({
    nombre: '',
    email: '',
    nif: '',
    direccion: '',
    notas: '',
  });
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', concepto: '', descripcion: '', cantidad: 1, precioUnitario: 0, impuestos: 21 }
  ]);
  const [moneda, setMoneda] = useState('EUR');

  const addItem = () => {
    setItems([...items, { 
      id: Math.random().toString(36).substring(7), 
      concepto: '', descripcion: '', cantidad: 1, precioUnitario: 0, impuestos: 21 
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(i => i.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const subtotal = items.reduce((sum, i) => sum + (i.cantidad * i.precioUnitario), 0);
  const totalImpuestos = items.reduce((sum, i) => {
    const base = i.cantidad * i.precioUnitario;
    return sum + (base * i.impuestos / 100);
  }, 0);
  const total = subtotal + totalImpuestos;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(amount);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // Validar
      if (!clientData.nombre.trim()) {
        toast.error('El nombre del cliente es obligatorio');
        setLoading(false);
        return;
      }

      const validItems = items.filter(i => i.concepto.trim() && i.precioUnitario > 0);
      if (validItems.length === 0) {
        toast.error('Agrega al menos un concepto válido con precio');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNombre: clientData.nombre,
          clienteEmail: clientData.email || undefined,
          clienteNif: clientData.nif || undefined,
          clienteDireccion: clientData.direccion || undefined,
          moneda,
          notas: clientData.notas || undefined,
          items: validItems.map(i => ({
            concepto: i.concepto,
            descripcion: i.descripcion || undefined,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            impuestos: i.impuestos,
          }))
        })
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data.invoice);
        setStep(3);
        toast.success('Factura creada correctamente', {
          description: `Factura ${data.invoice.numero} generada con éxito`,
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        });
        if (onSuccess) onSuccess();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al crear la factura');
      }
    } catch (error) {
      toast.error('Error de red al crear la factura');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setClientData({ nombre: '', email: '', nif: '', direccion: '', notas: '' });
    setItems([{ id: '1', concepto: '', descripcion: '', cantidad: 1, precioUnitario: 0, impuestos: 21 }]);
    setResult(null);
    setMoneda('EUR');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange?.(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="rounded-xl bg-primary text-white hover:bg-primary/90 shadow-md px-5 gap-2">
          <Plus className="h-4 w-4" />
          Crear Factura Manual
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
            <Receipt className="h-6 w-6 text-primary" />
            {step === 1 ? 'Nueva Factura Manual' : step === 2 ? 'Confirmar Factura' : 'Factura Creada'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? 'Ingresa los datos del cliente y los conceptos a facturar.'
              : step === 2 
                ? 'Revisa los datos antes de emitir la factura.'
                : 'La factura ha sido generada correctamente.'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex items-center gap-2 px-2 mb-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                step >= s ? "bg-primary text-white" : "bg-slate-100 text-slate-400"
              )}>
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn("h-0.5 flex-1 rounded-full", step > s ? "bg-primary" : "bg-slate-100")} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Form */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Cliente */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <User className="h-4 w-4" /> Datos del Cliente
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="cliente-nombre">Nombre / Razón Social *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input 
                      id="cliente-nombre" 
                      placeholder="Ej. Cliente S.L."
                      className="pl-9"
                      value={clientData.nombre}
                      onChange={(e) => setClientData({...clientData, nombre: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input 
                      id="cliente-email" 
                      placeholder="cliente@email.com"
                      className="pl-9"
                      value={clientData.email}
                      onChange={(e) => setClientData({...clientData, email: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente-nif">NIF / CIF</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input 
                      id="cliente-nif" 
                      placeholder="B12345678"
                      className="pl-9 uppercase"
                      value={clientData.nif}
                      onChange={(e) => setClientData({...clientData, nif: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="cliente-direccion">Dirección</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input 
                      id="cliente-direccion" 
                      placeholder="Dirección fiscal"
                      className="pl-9"
                      value={clientData.direccion}
                      onChange={(e) => setClientData({...clientData, direccion: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Moneda */}
            <div className="flex items-center gap-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Moneda:</Label>
              <div className="flex gap-2">
                {['EUR', 'USD', 'MXN'].map(c => (
                  <Button
                    key={c}
                    variant={moneda === c ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setMoneda(c)}
                  >
                    {c === 'EUR' ? '€' : c === 'USD' ? '$' : 'MX$'} {c}
                  </Button>
                ))}
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Conceptos
              </h3>

              {items.map((item, index) => (
                <div key={item.id} className="grid grid-cols-12 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="col-span-5 space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-slate-500">Concepto</Label>
                    <Input 
                      placeholder="Ej. Consultoría"
                      value={item.concepto}
                      onChange={(e) => updateItem(item.id, 'concepto', e.target.value)}
                      className="bg-white border-none shadow-sm h-9"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-slate-500">Cant.</Label>
                    <Input 
                      type="number" 
                      min={1}
                      value={item.cantidad}
                      onChange={(e) => updateItem(item.id, 'cantidad', parseFloat(e.target.value) || 0)}
                      className="bg-white border-none shadow-sm h-9"
                    />
                  </div>
                  <div className="col-span-3 space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-slate-500">Precio Unit.</Label>
                    <Input 
                      type="number" 
                      min={0}
                      step={0.01}
                      value={item.precioUnitario}
                      onChange={(e) => updateItem(item.id, 'precioUnitario', parseFloat(e.target.value) || 0)}
                      className="bg-white border-none shadow-sm h-9"
                    />
                  </div>
                  <div className="col-span-1 flex items-end pb-1 justify-center">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-9 w-9 text-slate-300 hover:text-red-500"
                      onClick={() => removeItem(item.id)}
                      disabled={items.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="col-span-11 space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-slate-500">Descripción (opcional)</Label>
                    <Input 
                      placeholder="Descripción del servicio"
                      value={item.descripcion}
                      onChange={(e) => updateItem(item.id, 'descripcion', e.target.value)}
                      className="bg-white border-none shadow-sm h-9"
                    />
                  </div>
                </div>
              ))}

              <Button 
                variant="outline" 
                onClick={addItem}
                className="w-full border-dashed border-2 py-5 rounded-xl text-slate-400 hover:text-primary hover:border-primary/50 transition-all"
              >
                <Plus className="h-4 w-4 mr-2" /> Añadir otro concepto
              </Button>
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notas">Notas / Observaciones</Label>
              <textarea
                id="notas"
                rows={2}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                placeholder="Notas adicionales para la factura..."
                value={clientData.notas}
                onChange={(e) => setClientData({...clientData, notas: e.target.value})}
              />
            </div>
          </div>
        )}

        {/* Step 2: Confirmación */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-slate-50 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">{clientData.nombre}</p>
                  <div className="flex gap-3 text-xs text-slate-500">
                    {clientData.email && <span>{clientData.email}</span>}
                    {clientData.nif && <span className="font-mono">NIF: {clientData.nif}</span>}
                  </div>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 font-bold text-slate-500 text-[10px] uppercase">Concepto</th>
                    <th className="pb-2 font-bold text-slate-500 text-[10px] uppercase text-right">Cant.</th>
                    <th className="pb-2 font-bold text-slate-500 text-[10px] uppercase text-right">P. Unit.</th>
                    <th className="pb-2 font-bold text-slate-500 text-[10px] uppercase text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(i => i.concepto.trim() && i.precioUnitario > 0).map((item, idx) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-2 font-medium text-slate-800">{item.concepto}</td>
                      <td className="py-2 text-right text-slate-600">{item.cantidad}</td>
                      <td className="py-2 text-right text-slate-600">{formatCurrency(item.precioUnitario)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(item.cantidad * item.precioUnitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-slate-200 pt-4 space-y-1 text-right">
                <p className="text-sm text-slate-500">Subtotal: <span className="font-medium text-slate-700">{formatCurrency(subtotal)}</span></p>
                <p className="text-sm text-slate-500">Impuestos: <span className="font-medium text-slate-700">{formatCurrency(totalImpuestos)}</span></p>
                <p className="text-lg font-black">{formatCurrency(total)}</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                Al confirmar, se generará una factura legal con sellado Veri*factu. 
                Los datos del cliente se guardarán en el sistema.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Resultado */}
        {step === 3 && result && (
          <div className="space-y-6 text-center py-4">
            <div className="flex justify-center">
              <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tight">Factura Creada</h3>
              <p className="text-slate-500 font-medium mt-1">
                Factura <span className="font-bold text-slate-800">{result.numero}</span> generada correctamente
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="text-slate-600">
                {result.isSealed ? 'Sellada criptográficamente' : 'Veri*factu pendiente'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-slate-900">{formatCurrency(result.monto)}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400 mt-1">Total</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-lg font-bold text-slate-900">{result.numero}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400 mt-1">Número</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t pt-4 gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button 
                className="rounded-xl px-8 gap-2"
                onClick={() => setStep(2)}
                disabled={!clientData.nombre.trim() || !items.some(i => i.concepto.trim() && i.precioUnitario > 0)}
              >
                Revisar Factura
                <Receipt className="h-4 w-4" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl">
                Volver
              </Button>
              <Button 
                className="rounded-xl px-8 gap-2 bg-primary hover:bg-primary/90"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <><Clock className="h-4 w-4 animate-spin mr-2" /> Creando...</>
                ) : (
                  <><ShieldCheck className="h-4 w-4" /> Emitir Factura</>
                )}
              </Button>
            </>
          )}
          {step === 3 && (
            <Button 
              className="rounded-xl px-8 mx-auto w-full"
              onClick={() => {
                handleOpenChange(false);
                resetForm();
              }}
            >
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
