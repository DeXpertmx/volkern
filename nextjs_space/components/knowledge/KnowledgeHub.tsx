'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Tag, 
  FileText, 
  ShieldCheck,
  Zap,
  Globe
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function KnowledgeHub() {
  const [activeCategory, setActiveCategory] = useState('ALL');

  const categories = [
    { id: 'ALL', label: 'Todo', icon: Globe },
    { id: 'POLICY', label: 'Políticas', icon: ShieldCheck },
    { id: 'SOP', label: 'Procedimientos (SOP)', icon: Zap },
    { id: 'TECHNICAL', label: 'Técnico', icon: BookOpen },
    { id: 'CULTURE', label: 'Cultura', icon: Tag }
  ];

  return (
    <div className="p-8 space-y-12 max-w-7xl mx-auto">
      {/* Header Premium */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-primary font-black uppercase tracking-[0.3em] text-[10px] animate-in fade-in slide-in-from-left-4">
            <BookOpen className="h-4 w-4 fill-primary" />
            Memoria Organizacional Viva
          </div>
          <h1 className="text-6xl font-black tracking-tighter uppercase leading-none">
            Knowledge <span className="text-primary italic">Hub</span>
          </h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl">
            La fuente única de verdad de tu empresa. Sin manuales estáticos, solo conocimiento accionable.
          </p>
        </div>

        <Button className="h-16 px-8 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest gap-3 shadow-2xl">
          <Plus className="h-6 w-6" /> Crear Artículo
        </Button>
      </div>

      {/* Toolbar de Búsqueda y Categorías */}
      <div className="flex flex-col md:flex-row gap-6 items-center">
         <div className="relative flex-1">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-300" />
            <Input 
              placeholder="Buscar en la sabiduría de la empresa..." 
              className="h-16 pl-16 pr-8 bg-white border-none rounded-3xl text-lg font-medium shadow-xl shadow-slate-200/50"
            />
         </div>
         <div className="flex gap-2 p-2 bg-slate-100 rounded-[2rem]">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all",
                  activeCategory === cat.id ? "bg-white text-primary shadow-lg" : "text-slate-500 hover:text-slate-900"
                )}
              >
                <cat.icon className="h-4 w-4" />
                {cat.label}
              </button>
            ))}
         </div>
      </div>

      {/* Grid de Artículos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
         {[
           { title: 'Política de Comisiones 2026', cat: 'POLICY', tags: ['Sales', 'Finance'], author: 'Carlos M.' },
           { title: 'SOP: Cierre de Nómina Mensual', cat: 'SOP', tags: ['HR', 'Finance'], author: 'Elena R.' },
           { title: 'Protocolo de Emergencia en Planta', cat: 'TECHNICAL', tags: ['Industrial', 'Safety'], author: 'Juan G.' },
           { title: 'Valores y Cultura Volkern', cat: 'CULTURE', tags: ['People', 'Vision'], author: 'Admin' },
           { title: 'Manual de Identidad Visual', cat: 'TECHNICAL', tags: ['Branding', 'Marketing'], author: 'Sofía L.' },
         ].map((art, i) => (
           <Card key={i} className="group border-none shadow-lg hover:shadow-2xl transition-all duration-500 rounded-[2.5rem] bg-white overflow-hidden flex flex-col">
              <CardHeader className="p-8 pb-4">
                 <div className="flex justify-between items-start mb-4">
                    <Badge className={cn(
                      "px-4 py-1 rounded-xl text-[10px] font-black tracking-widest",
                      art.cat === 'POLICY' ? "bg-emerald-50 text-emerald-600" :
                      art.cat === 'SOP' ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"
                    )}>
                      {art.cat}
                    </Badge>
                    <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 group-hover:bg-primary/5 group-hover:text-primary transition-all">
                       <FileText className="h-5 w-5" />
                    </div>
                 </div>
                 <CardTitle className="text-2xl font-black uppercase tracking-tight group-hover:text-primary transition-colors leading-tight">
                    {art.title}
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-8 pt-0 flex-1 space-y-6">
                 <div className="flex flex-wrap gap-2">
                    {art.tags.map(t => (
                      <span key={t} className="text-[10px] font-bold text-slate-400">#{t}</span>
                    ))}
                 </div>
                 <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                    <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-bold">
                       {art.author[0]}
                    </div>
                    <span className="text-xs font-bold text-slate-500">{art.author}</span>
                 </div>
              </CardContent>
           </Card>
         ))}
      </div>

      {/* Footer Info */}
      <div className="p-8 rounded-[2.5rem] bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-8">
         <div className="flex items-center gap-6">
            <div className="h-16 w-16 bg-white/10 rounded-3xl flex items-center justify-center text-primary">
               <Zap className="h-8 w-8" />
            </div>
            <div>
               <h4 className="text-xl font-black uppercase tracking-tight">Cosecha de Conocimiento Activa</h4>
               <p className="text-sm text-slate-400 font-medium">Volkern Guide está indexando automáticamente cada decisión sellada en el sistema.</p>
            </div>
         </div>
         <Button variant="outline" className="h-14 px-8 rounded-2xl border-white/10 text-white hover:bg-white/5 font-bold uppercase tracking-widest">
            Auditar Memoria Viva
         </Button>
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
