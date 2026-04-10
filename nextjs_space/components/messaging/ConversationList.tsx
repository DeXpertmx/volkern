'use client';

import React from 'react';
import { 
  Search, 
  Filter, 
  Phone, 
  Mail, 
  MessageSquare, 
  Send, 
  Facebook, 
  Instagram, 
  Bot,
  Circle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  contactoNombre: string;
  canal: string;
  estado: string;
  ultimoMensaje?: string;
  fechaUltimoMensaje?: string;
  noLeidos: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

export function ConversationList({ 
  conversations, 
  selectedId, 
  onSelect, 
  loading 
}: ConversationListProps) {
  
  const getCanalIcon = (canal: string) => {
    switch (canal) {
      case 'whatsapp': return <Phone size={12} />;
      case 'email': return <Mail size={12} />;
      case 'facebook': return <Facebook size={12} />;
      case 'instagram': return <Instagram size={12} />;
      case 'telegram': return <Send size={12} />;
      case 'chatbot': return <Bot size={12} />;
      default: return <MessageSquare size={12} />;
    }
  };

  const getCanalColor = (canal: string) => {
    switch (canal) {
      case 'whatsapp': return 'bg-emerald-500';
      case 'email': return 'bg-blue-500';
      case 'facebook': return 'bg-blue-600';
      case 'instagram': return 'bg-pink-500';
      case 'telegram': return 'bg-sky-500';
      case 'chatbot': return 'bg-purple-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="w-[380px] border-r bg-white flex flex-col h-full overflow-hidden shrink-0">
      {/* Search Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            Conversaciones 
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-bold">Abierta <Search size={10} className="ml-1 opacity-40"/></Badge>
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
            <Filter size={16} />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Buscar por nombre o mensaje..." 
            className="pl-9 h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20 bg-slate-50/50"
          />
        </div>
        <div className="flex gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-tight">
          <button className="px-2 py-1 text-blue-600 border-b-2 border-blue-600">Mías (8)</button>
          <button className="px-2 py-1 hover:text-slate-600">Sin asignar (6)</button>
          <button className="px-2 py-1 hover:text-slate-600">Todas (7)</button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-10 w-10 bg-slate-100 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 bg-slate-100 rounded w-full" />
                  <div className="h-2 bg-slate-50 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center text-slate-400 italic text-sm">
            No se encontraron conversaciones
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                "w-full p-4 flex gap-4 border-b text-left transition-all relative group",
                selectedId === conv.id ? "bg-blue-50/50" : "hover:bg-slate-50"
              )}
            >
              {selectedId === conv.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
              )}
              
              {/* Avatar with Canal Badge */}
              <div className="relative shrink-0">
                <div className="h-11 w-11 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500 overflow-hidden border border-white">
                  {conv.contactoNombre.charAt(0).toUpperCase()}
                </div>
                <div className={cn(
                  "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white flex items-center justify-center text-white",
                  getCanalColor(conv.canal)
                )}>
                  {getCanalIcon(conv.canal)}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="font-bold text-sm text-slate-900 truncate pr-2">{conv.contactoNombre}</h3>
                  <span className="text-[10px] text-slate-400 font-bold flex-shrink-0">
                    {conv.fechaUltimoMensaje ? format(new Date(conv.fechaUltimoMensaje), 'HH:mm', { locale: es }) : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={cn(
                    "text-xs truncate",
                    conv.noLeidos > 0 ? "text-slate-900 font-bold" : "text-slate-500"
                  )}>
                    {conv.ultimoMensaje || 'Cargando mensaje...'}
                  </p>
                  {conv.noLeidos > 0 && (
                    <div className="h-5 w-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0">
                      {conv.noLeidos}
                    </div>
                  )}
                </div>
              </div>

              {/* Status Indicators */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Circle size={8} className="text-green-500 fill-green-500" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
