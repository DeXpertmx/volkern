'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Loader2,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const CATEGORIES = [
  { id: 'POLICY', label: 'Políticas', icon: ShieldCheck, color: 'text-indigo-600' },
  { id: 'SOP', label: 'Procesos', icon: Wrench, color: 'text-amber-600' },
  { id: 'TECHNICAL', label: 'Técnico', icon: FileText, color: 'text-rose-600' },
  { id: 'CULTURE', label: 'Cultura', icon: Globe, color: 'text-emerald-600' },
  { id: 'FISCAL', label: 'Fiscal', icon: FileText, color: 'text-blue-600' },
  { id: 'ACCOUNTING', label: 'Contable', icon: FileText, color: 'text-teal-600' },
];

const CATEGORY_COLORS: Record<string, string> = {
  POLICY: 'bg-indigo-50 text-indigo-700',
  SOP: 'bg-amber-50 text-amber-700',
  TECHNICAL: 'bg-rose-50 text-rose-700',
  CULTURE: 'bg-emerald-50 text-emerald-700',
  FISCAL: 'bg-blue-50 text-blue-700',
  ACCOUNTING: 'bg-teal-50 text-teal-700',
};

export default function KnowledgeHubPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSemantic, setIsSemantic] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [deletingArticle, setDeletingArticle] = useState<any>(null);
  const [selectedArticle, setSelectedArticle] = useState<any>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('SOP');
  const [formTags, setFormTags] = useState('');
  const [formIsPublic, setFormIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  const queryParams = new URLSearchParams();
  if (searchQuery) queryParams.set('q', searchQuery);
  if (isSemantic) queryParams.set('semantic', 'true');
  if (activeCategory) queryParams.set('category', activeCategory);
  const queryKey = `/api/knowledge${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const { data: articles, isLoading, mutate } = useSWR(queryKey, fetcher);

  function resetForm() {
    setFormTitle('');
    setFormContent('');
    setFormCategory('SOP');
    setFormTags('');
    setFormIsPublic(true);
    setEditingArticle(null);
  }

  function openCreate() {
    resetForm();
    setShowCreateDialog(true);
  }

  function openEdit(article: any) {
    setEditingArticle(article);
    setFormTitle(article.title);
    setFormContent(article.content);
    setFormCategory(article.category);
    setFormTags((article.tags || []).join(', '));
    setFormIsPublic(article.isPublic);
    setShowCreateDialog(true);
  }

  function openDetail(article: any) {
    setSelectedArticle(article);
    setShowDetailDialog(true);
  }

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSaving(true);

    const body = {
      title: formTitle.trim(),
      content: formContent.trim(),
      category: formCategory,
      tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      isPublic: formIsPublic,
    };

    if (editingArticle) {
      await fetch(`/api/knowledge/${editingArticle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    setShowCreateDialog(false);
    resetForm();
    setSaving(false);
    mutate();
  }

  async function handleDelete() {
    if (!deletingArticle) return;
    await fetch(`/api/knowledge/${deletingArticle.id}`, { method: 'DELETE' });
    setDeletingArticle(null);
    if (showDetailDialog) setShowDetailDialog(false);
    mutate();
  }

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

        <Button
          onClick={openCreate}
          className="rounded-2xl font-black uppercase text-[10px] tracking-widest px-6 h-12 shadow-xl shadow-primary/20"
        >
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
              'absolute right-3 top-3 h-10 px-4 rounded-xl flex items-center gap-2 transition-all',
              isSemantic
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
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
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4">
            Filtrar por Dominio
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={cn(
                  'flex items-center justify-between p-4 rounded-2xl border transition-all text-left',
                  activeCategory === cat.id
                    ? 'bg-white border-primary shadow-lg ring-1 ring-primary/20'
                    : 'bg-white border-slate-100 hover:border-slate-200'
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn('h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center', cat.color)}>
                    <cat.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-tight text-slate-700">
                    {cat.label}
                  </span>
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
                Crea tu primer artículo con el botón &quot;Nuevo Artículo&quot; o siembra datos con /api/knowledge/seed
              </p>
              <Button
                onClick={openCreate}
                variant="outline"
                className="mt-6 rounded-2xl font-black uppercase text-[10px] tracking-widest"
              >
                <Plus className="w-4 h-4 mr-2" /> Crear Primer Artículo
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {articles.map((article: any) => (
                <Card
                  key={article.id}
                  className="p-6 rounded-[2rem] border-slate-100 hover:border-primary/20 hover:shadow-2xl transition-all group cursor-pointer"
                  onClick={() => openDetail(article)}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-4 flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge className={cn('border-none px-3 py-1 rounded-lg font-black text-[8px] uppercase tracking-widest', CATEGORY_COLORS[article.category] || 'bg-slate-100 text-slate-500')}>
                          {article.category}
                        </Badge>
                        {article.isPublic && (
                          <Badge className="bg-green-50 text-green-600 border-none px-3 py-1 rounded-lg font-black text-[8px] uppercase tracking-widest">
                            Público
                          </Badge>
                        )}
                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                          {new Date(article.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(article); }}
                        className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 hover:bg-amber-50 hover:text-amber-600 transition-all opacity-0 group-hover:opacity-100"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingArticle(article); }}
                        className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="h-10 w-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-200 group-hover:bg-primary/5 group-hover:text-primary transition-all">
                        <ChevronRight className="w-6 h-6" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) { setShowCreateDialog(false); resetForm(); }
      }}>
        <DialogContent className="max-w-2xl rounded-[2rem] p-8">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">
              {editingArticle ? 'Editar Artículo' : 'Nuevo Artículo'}
            </DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest">
              {editingArticle
                ? 'Modifica el contenido y los metadatos del artículo'
                : 'Escribe contenido estructurado para la memoria organizacional'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 mt-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                Título
              </label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ej: Política de Teletrabajo Híbrido"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                Contenido
              </label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Escribe el contenido completo del artículo aquí..."
                rows={8}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium leading-relaxed focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                  Categoría
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                  Etiquetas (coma separada)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="Ej: iva, fiscal, aeats"
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formIsPublic}
                onChange={(e) => setFormIsPublic(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
              />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Artículo público (disponible para búsqueda semántica y RAG)
              </span>
            </label>
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => { setShowCreateDialog(false); resetForm(); }}
              className="rounded-2xl font-black uppercase text-[10px] tracking-widest"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formTitle.trim() || !formContent.trim()}
              className="rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...
                </>
              ) : editingArticle ? (
                'Actualizar Artículo'
              ) : (
                'Crear Artículo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail View Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl rounded-[2rem] p-8 max-h-[85vh] overflow-y-auto">
          {selectedArticle && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Badge className={cn('border-none px-3 py-1 rounded-lg font-black text-[8px] uppercase tracking-widest', CATEGORY_COLORS[selectedArticle.category] || 'bg-slate-100 text-slate-500')}>
                    {selectedArticle.category}
                  </Badge>
                  {selectedArticle.isPublic && (
                    <Badge className="bg-green-50 text-green-600 border-none px-3 py-1 rounded-lg font-black text-[8px] uppercase tracking-widest">
                      Público
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight">
                  {selectedArticle.title}
                </DialogTitle>
                <DialogDescription className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Actualizado {new Date(selectedArticle.updatedAt).toLocaleDateString('es-ES', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                  {selectedArticle.vectorId && ' · Embedding generado'}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-6 space-y-6">
                <div className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {selectedArticle.content}
                </div>
                {selectedArticle.tags?.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap pt-4 border-t border-slate-100">
                    <Tags className="w-4 h-4 text-slate-300" />
                    {selectedArticle.tags.map((tag: string) => (
                      <span key={tag} className="text-[10px] font-black uppercase text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDetailDialog(false);
                    setTimeout(() => openEdit(selectedArticle), 100);
                  }}
                  className="rounded-2xl font-black uppercase text-[10px] tracking-widest"
                >
                  <Pencil className="w-3 h-3 mr-2" /> Editar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDeletingArticle(selectedArticle)}
                  className="rounded-2xl font-black uppercase text-[10px] tracking-widest text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  <Trash2 className="w-3 h-3 mr-2" /> Eliminar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingArticle} onOpenChange={(open) => { if (!open) setDeletingArticle(null); }}>
        <DialogContent className="max-w-md rounded-[2rem] p-8">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight text-rose-600">
              Eliminar Artículo
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500 mt-2">
              ¿Estás seguro de eliminar <strong className="text-slate-800">&quot;{deletingArticle?.title}&quot;</strong>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setDeletingArticle(null)}
              className="rounded-2xl font-black uppercase text-[10px] tracking-widest"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              className="rounded-2xl font-black uppercase text-[10px] tracking-widest bg-rose-600 hover:bg-rose-700 shadow-xl shadow-rose-600/20"
            >
              <Trash2 className="w-3 h-3 mr-2" /> Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
