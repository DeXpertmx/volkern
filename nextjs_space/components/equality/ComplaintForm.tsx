
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  ShieldCheck, 
  Send, 
  Info, 
  Lock, 
  FileWarning, 
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function ComplaintForm() {
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [category, setCategory] = useState('ACROSS_HARASSMENT');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Por favor, describe el incidente.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/equality/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          isAnonymous,
          category
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSubmitted(true);
        setTicketId(data.id);
        toast.success('Denuncia enviada correctamente de forma segura.');
      } else {
        toast.error('Hubo un error al enviar la denuncia.');
      }
    } catch (error) {
      toast.error('Error de conexión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border-none shadow-2xl bg-white rounded-[2rem] overflow-hidden animate-in zoom-in duration-300">
        <CardContent className="p-12 text-center space-y-6">
          <div className="h-20 w-20 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto shadow-inner">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Denuncia Registrada</h2>
            <p className="text-sm text-slate-500 font-medium max-w-sm mx-auto">
              Tu reporte ha sido cifrado y almacenado de forma inmutable. El responsable ha sido notificado.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 inline-block">
            <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Folio de Seguimiento</p>
            <p className="font-mono text-sm font-bold text-primary">{ticketId}</p>
          </div>
          <div className="pt-6">
            <Button 
              variant="outline" 
              className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8"
              onClick={() => {
                setSubmitted(false);
                setDescription('');
              }}
            >
              Nuevo Reporte
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-2xl bg-white rounded-[2rem] overflow-hidden">
      <div className="h-2 bg-indigo-600" />
      <CardHeader className="p-8 pb-0">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
            <FileWarning className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-900">Canal de Denuncias</CardTitle>
            <CardDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Normativa de Igualdad y Transparencia</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-4">
          <Info className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
            Este canal es confidencial. Los datos registrados son <b>inmutables</b> y solo accesibles por el responsable de cumplimiento.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Categoría del Incidente</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'ACROSS_HARASSMENT', label: 'Acoso', icon: AlertTriangle },
                { id: 'DISCRIMINATION', label: 'Discriminación', icon: AlertTriangle },
                { id: 'IRREGULARITY', label: 'Irregularidad', icon: AlertTriangle },
                { id: 'OTHER', label: 'Otro', icon: AlertTriangle },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border text-[10px] font-black uppercase transition-all",
                    category === cat.id 
                      ? "bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm" 
                      : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                  )}
                >
                  <cat.icon className="w-4 h-4" />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Descripción de los Hechos</Label>
            <Textarea 
              placeholder="Describe lo sucedido con el mayor detalle posible..."
              className="min-h-[150px] rounded-2xl border-slate-100 bg-slate-50 focus:ring-indigo-500/20 text-sm p-4"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="p-6 rounded-[1.5rem] bg-slate-900 text-white flex items-center justify-between shadow-xl">
             <div className="flex items-center gap-4">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  isAnonymous ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-slate-400"
                )}>
                  {isAnonymous ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest">Denuncia Anónima</p>
                  <p className="text-[9px] text-slate-400 font-medium">Ocultar mi identidad al responsable</p>
                </div>
             </div>
             <Switch 
               checked={isAnonymous}
               onCheckedChange={setIsAnonymous}
               className="data-[state=checked]:bg-emerald-500"
             />
          </div>

          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full h-14 rounded-[1.5rem] bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl shadow-indigo-200 flex items-center justify-center gap-3"
          >
            {isSubmitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white" />
            ) : (
              <>
                Enviar Denuncia Segura
                <Send className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
