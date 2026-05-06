'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  BookOpen, 
  Search, 
  Plus, 
  FileText, 
  ShieldCheck, 
  Wrench, 
  Globe,
  Sparkles,
  ChevronRight,
  Tags,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function KnowledgeHubPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSemantic, setIsSemantic] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: articles, isLoading } = useSWR(
    `/api/knowledge?${searchQuery ? `q=${searchQuery}&` : ''}${isSemantic ? 'semantic=true&' : ''}${activeCategory ? `category=${activeCategory}` : ''}`,
    fetcher
  );

  const categories = [
    { id: 'POLICY', label: 'Políticas', icon: ShieldCheck, color: 'text-indigo-600' },
    { id: 'SOP', label: 'Procesos', icon: Wrench, color: 'text-amber-600' },
    { id: 'TECHNICAL', label: 'Técnico', icon: FileText, color: 'text-rose-600' },
    { id: 'CULTURE', label: 'Cultura', icon: Globe, color: 'text-emerald-600' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 flex items-center gap-4">
            <BookOpen className="w-10 h-10 text-primary" />
            Knowledge <span className="text-primary italic">Hub</span>
          </h1>
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mt-2">
            Memoria Organizacional e Inteligencia de Procesos
          </p>
        </div>

        <Button className="rounded-2xl font-black uppercase text-[10px] tracking-widest px-6 h-12 shadow-xl shadow-primary/20">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Artículo
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 relative">
           <Search className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2" />
           <input 
             type="text" 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             placeholder="¿QUÉ PROCESO O POLÍTICA BUSCAS?"
             className="w-full h-16 pl-12 pr-32 rounded-[2rem] bg-white border-slate-100 shadow-xl shadow-slate-100/50 text-xs font-bold uppercase tracking-widest focus:ring-primary/20"
           />
           <button 
             onClick={() => setIsSemantic(!isSemantic)}
             className={cn(
               "absolute right-3 top-3 h-10 px-4 rounded-xl flex items-center gap-2 transition-all",
               isSemantic ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
             )}
           >
              <Sparkles className="w-4 h-4" />
              <span className="text-[8px] font-black uppercase tracking-widest">IA Semantic</span>
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
         {/* Categories Sidebar */}
         <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4">Filtrar por Dominio</h3>
            <div className="grid grid-cols-1 gap-2">
               {categories.map((cat) => (
                 <button 
                  key={cat.id}
                  onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                    activeCategory === cat.id 
                      ? "bg-white border-primary shadow-lg ring-1 ring-primary/20" 
                      : "bg-white border-slate-100 hover:border-slate-200"
                  )}
                 >
                    <div className="flex items-center gap-4">
                       <div className={cn("h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center", cat.color)}>
                          <cat.icon className="w-5 h-5" />
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-tight text-slate-700">{cat.label}</span>
                    </div>
                    {activeCategory === cat.id && <ChevronRight className="w-4 h-4 text-primary" />}
                 </button>
               ))}
            </div>
         </div>

         {/* Articles Grid */}
         <div className="md:col-span-3 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                 <Loader2 className="w-12 h-12 animate-spin mb-4" />
                 <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando con el núcleo...</p>
              </div>
            ) : !articles || articles.length === 0 ? (
              <Card className="p-20 text-center border-dashed border-2 border-slate-100 bg-slate-50/50 rounded-[3rem]">
                 <BookOpen className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                 <h3 className="text-xl font-black uppercase text-slate-400">No se encontró conocimiento</h3>
                 <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-2 max-w-xs mx-auto leading-relaxed">
                    Asegúrate de que la IA esté activa o intenta una búsqueda por palabra clave.
                 </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                 {articles.map((article: any) => (
                   <Card 
                    key={article.id} 
                    className="p-6 rounded-[2rem] border-slate-100 hover:border-primary/20 hover:shadow-2xl transition-all group cursor-pointer"
                   >
                      <div className="flex items-start justify-between">
                         <div className="space-y-4">
                            <div className="flex items-center gap-3">
                               <Badge className="bg-slate-100 text-slate-500 border-none px-3 py-1 rounded-lg font-black text-[8px] uppercase tracking-widest">
                                  {article.category}
                               </Badge>
                               <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                                  Actualizado {new Date(article.updatedAt).toLocaleDateString()}
                               </span>
                            </div>
                            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight group-hover:text-primary transition-colors">
                               {article.title}
                            </h2>
                            <p className="text-xs font-medium text-slate-500 leading-relaxed line-clamp-2">
                               {article.content}
                            </p>
                            <div className="flex items-center gap-2">
                               <Tags className="w-3 h-3 text-slate-300" />
                               {article.tags?.map((tag: string) => (
                                 <span key={tag} className="text-[8px] font-black uppercase text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                                    #{tag}
                                 </span>
                               ))}
                            </div>
                         </div>
                         <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-200 group-hover:bg-primary/5 group-hover:text-primary transition-all">
                            <ChevronRight className="w-6 h-6" />
                         </div>
                      </div>
                   </Card>
                 ))}
              </div>
            )}
         </div>
      </div>
    </div>
  );
}
