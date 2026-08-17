'use client';

import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  Edit3, 
  MoreHorizontal,
  ChevronRight,
  MapPin,
  Briefcase,
  Plus,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface ContactDetailsSidebarProps {
  contact: any;
  loading: boolean;
  onUpdateTags?: (tags: string[]) => void;
}

export function ContactDetailsSidebar({ contact, loading, onUpdateTags }: ContactDetailsSidebarProps) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const tags: string[] = Array.isArray(contact?.hubMetadata?.tags) ? contact.hubMetadata.tags : [];

  const goToFicha = () => {
    if (contact?.leadId) router.push(`/dashboard/leads/${contact.leadId}`);
    else if (contact?.contactId) router.push(`/dashboard/contactos/${contact.contactId}`);
    else toast.error('No hay ficha asociada a esta conversación');
  };

  const commitTags = (next: string[]) => {
    onUpdateTags?.(next);
  };

  const addTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    if (tags.includes(value)) { setTagInput(''); setAddingTag(false); return; }
    commitTags([...tags, value]);
    setTagInput('');
    setAddingTag(false);
  };

  const removeTag = (tag: string) => {
    commitTags(tags.filter((t) => t !== tag));
  };

  if (!contact && !loading) return null;

  return (
    <div className="w-[300px] border-l bg-white flex flex-col h-full overflow-hidden shrink-0 shadow-sm animate-in slide-in-from-right duration-300">
      <div className="flex-1 overflow-y-auto">
        {/* Profile Card */}
        <div className="p-6 flex flex-col items-center border-b bg-slate-50/50">
          <div className="relative mb-4">
            <div className="h-24 w-24 rounded-2xl bg-white shadow-md flex items-center justify-center text-4xl font-bold text-slate-300 border border-slate-100 overflow-hidden">
              {contact?.contactoNombre?.charAt(0) || <User size={40} />}
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-green-500 border-2 border-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 text-center">{contact?.contactoNombre || 'Cargando...'}</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4">Lead • Tecnico</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs gap-1 py-0 px-3 border-slate-200" onClick={goToFicha}>
              <Edit3 size={12} /> Editar
            </Button>
            <div className="relative">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 border border-slate-100 bg-white" onClick={() => setMoreOpen(v => !v)}>
                <MoreHorizontal size={14} />
              </Button>
              {moreOpen && (
                <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border bg-white shadow-lg z-30 py-1">
                  <button className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50" onClick={() => { goToFicha(); setMoreOpen(false); }}>Ver ficha completa</button>
                  <button className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50" onClick={() => { router.push('/dashboard/contactos'); setMoreOpen(false); }}>Buscar contacto</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Details Section */}
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Información de contacto</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-slate-600">
                <Briefcase size={14} className="text-slate-400 shrink-0" />
                <span className="text-xs truncate font-medium">{contact?.lead?.empresa || 'Empresa no detallada'}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <Mail size={14} className="text-slate-400 shrink-0" />
                <span className="text-xs truncate font-medium">{contact?.contactoEmail || 'Sin email'}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <Phone size={14} className="text-slate-400 shrink-0" />
                <span className="text-xs truncate font-medium font-mono">{contact?.contactoTelefono || 'Sin teléfono'}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <MapPin size={14} className="text-slate-400 shrink-0" />
                <span className="text-xs truncate font-medium">Madrid, ES</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-2">CRM Contexto</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Estado del Lead</span>
                <Badge className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-none font-bold text-[10px] px-1.5">{contact?.lead?.estado || 'Nuevo'}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Puntos</span>
                <span className="font-bold text-slate-900">1,240</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium font-bold uppercase tracking-tighter">ID Sistema</span>
                <span className="font-mono text-[10px] text-slate-500">{contact?.id?.slice(-8)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Etiquetas</h4>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200 border-none text-[10px] px-2 gap-1">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-500"><X size={10} /></button>
                </Badge>
              ))}
              {addingTag ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTag();
                      if (e.key === 'Escape') { setAddingTag(false); setTagInput(''); }
                    }}
                    placeholder="Etiqueta..."
                    className="w-24 text-[10px] px-2 py-0.5 border rounded-full outline-none focus:border-blue-400"
                  />
                  <button onClick={addTag} className="text-blue-600"><Plus size={12} /></button>
                </div>
              ) : (
                <Badge variant="secondary" className="bg-blue-100 text-blue-600 hover:bg-blue-200 border-none text-[10px] px-2 cursor-pointer" onClick={() => setAddingTag(true)}>
                  + Agregar
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t bg-slate-50/50">
        <Button variant="outline" className="w-full h-10 border-slate-200 gap-2 text-slate-600 text-xs font-bold shadow-sm" onClick={goToFicha}>
          Ver ficha completa <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
