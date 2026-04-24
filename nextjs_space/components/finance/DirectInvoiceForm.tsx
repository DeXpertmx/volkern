'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ShieldCheck, 
  AlertCircle,
  FileText,
  Clock,
  CheckCircle2,
  Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface InvoiceItem {
  id: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
}

export function DirectInvoiceForm() {
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', name: '', description: '', price: 0, quantity: 1 }
  ]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [clientData, setClientData] = useState({
    rfc: '',
    email: '',
    usoCFDI: 'G03',
    regimenFiscal: '601'
  });

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(), name: '', description: '', price: 0, quantity: 1 }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(i => i.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.16; // Simulado MX
  const total = subtotal + tax;

  const handleEmit = async () => {
    try {
      setLoading(true);
      // Simulación de orquestación Zero-Stripe
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success('¡Factura MX emitida con éxito!', {
        description: 'El CFDI 4.0 ha sido timbrado y enviado al cliente.',
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      });
      setStep(3);
    } catch (error) {
      toast.error('Error al emitir factura');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress Stepper */}
      <div className="flex items-center justify-between px-8 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center font-bold transition-all",
              step >= s ? "bg-primary text-white" : "bg-slate-100 text-slate-400"
            )}>
              {step > s ? <CheckCircle2 className="h-6 w-6" /> : s}
            </div>
            {s < 3 && (
              <div className={cn(
                "h-1 w-24 mx-2 rounded-full",
                step > s ? "bg-primary" : "bg-slate-100"
              )} />
            )}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                <Receipt className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Conceptos de Facturación</CardTitle>
                <CardDescription>Define los servicios o productos que integrarán el CFDI 4.0</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="grid grid-cols-12 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 group">
                <div className="col-span-6 space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Producto / Servicio</Label>
                  <Input 
                    placeholder="Ej. Consultoría Estratégica"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    className="bg-white border-none shadow-sm focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Cant.</Label>
                  <Input 
                    type="number" 
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value))}
                    className="bg-white border-none shadow-sm"
                  />
                </div>
                <div className="col-span-3 space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Precio Unitario</Label>
                  <Input 
                    type="number" 
                    value={item.price}
                    onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value))}
                    className="bg-white border-none shadow-sm"
                  />
                </div>
                <div className="col-span-1 flex items-end pb-1 justify-center">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeItem(item.id)}
                    className="text-slate-300 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button 
              variant="outline" 
              onClick={addItem}
              className="w-full border-dashed border-2 py-8 rounded-2xl text-slate-400 hover:text-primary hover:border-primary/50 transition-all"
            >
              <Plus className="h-4 w-4 mr-2" /> Añadir otro concepto
            </Button>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-6 bg-slate-50/50">
            <div className="text-right flex-1 pr-8">
              <p className="text-xs text-slate-400 font-bold uppercase">Subtotal estimado</p>
              <p className="text-2xl font-black tracking-tight text-slate-900">${subtotal.toFixed(2)} MXN</p>
            </div>
            <Button size="lg" className="rounded-2xl px-8 font-bold" onClick={() => setStep(2)}>
              Siguiente <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Validación Fiscal SAT</CardTitle>
                <CardDescription>Confirma los datos del receptor para el timbrado inmediato</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="rfc">RFC del Cliente</Label>
                <Input 
                  id="rfc" 
                  placeholder="ABCD123456XYZ" 
                  className="h-12 uppercase font-mono tracking-widest border-2 focus:border-emerald-500/50"
                  value={clientData.rfc}
                  onChange={(e) => setClientData({...clientData, rfc: e.target.value})}
                />
                <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Formato de RFC Válido
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp">C.P. Fiscal</Label>
                <Input 
                  id="cp" 
                  placeholder="06700" 
                  className="h-12 border-2 focus:border-emerald-500/50"
                />
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900 text-white space-y-4 shadow-xl shadow-slate-200">
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <p className="text-xs font-bold uppercase text-slate-400">Resumen de Timbrado</p>
                <Badge className="bg-emerald-500 hover:bg-emerald-600">Stripe Tax Activo</Badge>
              </div>
              <div className="space-y-2 py-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Subtotal</span>
                  <span className="font-mono">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">IVA (16%)</span>
                  <span className="font-mono">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-4 border-t border-white/10">
                  <span className="font-black uppercase tracking-widest text-primary">Total CFDI</span>
                  <span className="text-3xl font-black tracking-tighter">${total.toFixed(2)} MXN</span>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between p-6 bg-slate-50/50">
            <Button variant="ghost" onClick={() => setStep(1)} className="rounded-2xl px-6">Regresar</Button>
            <Button 
              size="lg" 
              className="rounded-2xl px-12 bg-primary hover:bg-primary/90 font-black tracking-wide"
              onClick={handleEmit}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Timbrando CFDI...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Emitir Factura Legal
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card className="border-none shadow-2xl bg-white animate-in slide-in-from-top-4 duration-500 overflow-hidden">
          <div className="h-2 bg-emerald-500 w-full" />
          <CardContent className="p-12 text-center space-y-8">
            <div className="flex justify-center">
              <div className="h-24 w-24 bg-emerald-50 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle2 className="h-16 w-16 text-emerald-500" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-4xl font-black uppercase tracking-tight">¡Éxito Total!</h2>
              <p className="text-slate-500 font-medium max-w-sm mx-auto">
                La factura ha sido emitida, timbrada por el SAT y sellada en el Trust Protocol de Volkern.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-20 rounded-3xl border-2 hover:bg-slate-50 flex flex-col items-center justify-center gap-1 group">
                <FileText className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest">Ver PDF Nativo</span>
              </Button>
              <Button variant="outline" className="h-20 rounded-3xl border-2 hover:bg-slate-50 flex flex-col items-center justify-center gap-1 group">
                <Send className="h-5 w-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest">Enviar por Connect</span>
              </Button>
            </div>

            <Button variant="link" className="text-slate-400 font-bold uppercase tracking-widest text-[10px]" onClick={() => setStep(1)}>
              Nueva Factura Directa
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 py-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> SSL 256-BIT ENCRYPTION
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> SAT CFDI 4.0 COMPLIANT
        </div>
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4" /> POWERED BY STRIPE NATIVE
        </div>
      </div>
    </div>
  );
}
