'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Loader2, Box, FileText, TrendingUp, Info, AtSign, LifeBuoy } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const handleCreateTicket = async (message: any) => {
  const confirm = window.confirm('¿Deseas convertir este mensaje en un Ticket de Soporte?');
  if (!confirm) return;

  try {
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: `Ticket desde Connect: ${message.content.substring(0, 30)}...`,
        description: message.content,
        source: 'CHAT',
        channelId: message.channelId,
        entityType: message.attributions?.[0]?.entityType,
        entityId: message.attributions?.[0]?.entityId
      })
    });
    if (res.ok) {
      alert('Ticket creado con éxito.');
    } else {
      throw new Error();
    }
  } catch (e) {
    alert('Error al crear el ticket.');
  }
};

interface MessageFeedProps {
  channelId: string;
}

export function MessageFeed({ channelId }: MessageFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const getKey = (pageIndex: number, previousPageData: any) => {
    if (previousPageData && !previousPageData.nextCursor) return null;
    if (pageIndex === 0) return `/api/connect/messages?channelId=${channelId}&limit=50`;
    return `/api/connect/messages?channelId=${channelId}&limit=50&cursor=${previousPageData.nextCursor}`;
  };

  const { data, size, setSize, isValidating } = useSWRInfinite(getKey, fetcher, {
    refreshInterval: 5000,
    revalidateFirstPage: true
  });

  const messages = data ? data.map(page => page.messages).flat() : [];
  const isLoadingMore = isValidating && size > 1;

  useEffect(() => {
    // Scroll al final al cargar nuevos mensajes (si no estamos haciendo scroll infinito hacia arriba)
    if (scrollRef.current && !isLoadingMore) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (!data && isValidating) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth bg-[#fdfdfd]"
    >
      {data && data[data.length-1]?.nextCursor && (
        <div className="flex justify-center pb-4">
          <button 
            onClick={() => setSize(size + 1)}
            className="text-[9px] font-black uppercase text-slate-400 hover:text-primary transition-all tracking-widest"
          >
            {isLoadingMore ? 'Cargando...' : 'Cargar mensajes anteriores'}
          </button>
        </div>
      )}

      {messages.map((message, i) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageItem({ message }: { message: any }) {
  const isSystem = message.isSystemMessage;
  const isGemma = message.metadata?.isGemmaSuggestion;

  if (isGemma) {
    return <GemmaSuggestionCard message={message} />;
  }

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-slate-100/80 backdrop-blur-sm border border-slate-200 px-4 py-2 rounded-2xl flex items-center gap-3">
          <div className="h-6 w-6 rounded-lg bg-white flex items-center justify-center shadow-sm">
            <Info className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
            {message.content}
          </span>
          {message.attributions?.map((attr: any) => (
             <Badge key={attr.id} className="bg-primary/10 text-primary border-none text-[8px] font-black uppercase px-2">
                VER {attr.entityType}
             </Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 group relative">
      <Avatar className="h-10 w-10 rounded-2xl shadow-sm border-2 border-white">
        <AvatarImage src={message.sender?.image} />
        <AvatarFallback className="bg-indigo-50 text-indigo-600 font-black text-xs uppercase">
          {message.sender?.name?.substring(0, 2) || '??'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-tight text-slate-900">{message.sender?.name}</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          
          <button 
            onClick={() => handleCreateTicket(message)}
            className="opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-sm hover:border-primary hover:text-primary"
          >
            <LifeBuoy className="w-3 h-3" />
            <span className="text-[8px] font-black uppercase tracking-widest">Ticket</span>
          </button>
        </div>
        
        <div className="bg-white border border-slate-100 p-4 rounded-3xl rounded-tl-none shadow-sm group-hover:shadow-md transition-all">
          <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>

          {/* Atribuciones de Negocio */}
          {message.attributions && message.attributions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-50 flex flex-wrap gap-2">
               {message.attributions.map((attr: any) => (
                 <BusinessAttribution key={attr.id} attr={attr} />
               ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BusinessAttribution({ attr }: { attr: any }) {
  const router = useRouter();
  const icons: any = {
    Invoice: <FileText className="w-3 h-3" />,
    INVOICE: <FileText className="w-3 h-3" />,
    Project: <Box className="w-3 h-3" />,
    PROJECT: <Box className="w-3 h-3" />,
    Deal: <TrendingUp className="w-3 h-3" />,
    DEAL: <TrendingUp className="w-3 h-3" />,
    Lead: <AtSign className="w-3 h-3" />,
    LEAD: <AtSign className="w-3 h-3" />,
    GemmaAlert: <Info className="w-3 h-3" />
  };

  const handleClick = () => {
    const type = attr.entityType.toLowerCase();
    if (type === 'lead') router.push(`/dashboard/crm/leads/${attr.entityId}`);
    if (type === 'invoice') router.push(`/dashboard/finance/invoices/${attr.entityId}`);
    if (type === 'deal') router.push(`/dashboard/crm/deals/${attr.entityId}`);
    if (type === 'project') router.push(`/dashboard/operations/projects/${attr.entityId}`);
  };

  return (
    <div 
      onClick={handleClick}
      className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all group/attr"
    >
      <div className="text-primary group-hover/attr:scale-110 transition-transform">
        {icons[attr.entityType] || <Box className="w-3 h-3" />}
      </div>
      <span className="text-[9px] font-black uppercase text-slate-500 group-hover/attr:text-primary tracking-widest">
        {attr.entityType}: {attr.entityId.substring(0, 8)}
      </span>
    </div>
  );
}

function GemmaSuggestionCard({ message }: { message: any }) {
  const { suggestionId, type, confidence, suggestedActions, evidence } = message.metadata;
  const [isExecuting, setIsExecuting] = useState(false);

  const handleAction = async (actionId: string) => {
    const note = window.prompt('Firma del Operador (Nota para auditoría):');
    if (!note) return;

    setIsExecuting(true);
    try {
      const res = await fetch(`/api/gemma/suggestions/${suggestionId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, operatorNote: note })
      });
      if (!res.ok) throw new Error();
      alert('Acción ejecutada correctamente y sellada en auditoría.');
    } catch (e) {
      alert('Error al ejecutar acción');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex justify-center my-6">
      <div className="w-full max-w-lg bg-white border-2 border-indigo-100 rounded-[2rem] overflow-hidden shadow-xl shadow-indigo-500/5 relative group transition-all hover:border-primary/30">
        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-all">
          <TrendingUp className="w-20 h-20 text-primary" />
        </div>
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <span className="font-black text-xs">G4</span>
              </div>
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Gemma Insight</h4>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Sugerencia AI de {type?.replace('_', ' ')}</p>
              </div>
            </div>
            <Badge className={cn(
              "font-black text-[9px] uppercase px-3 border-none",
              confidence >= 0.8 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
            )}>
              {Math.round(confidence * 100)}% Confianza
            </Badge>
          </div>

          <p className="text-sm font-bold text-slate-800 leading-relaxed mb-6">
            {message.content}
          </p>

          {/* Evidence */}
          {evidence && evidence.length > 0 && (
            <div className="space-y-2 mb-6">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Evidencia Detectada</p>
              <div className="flex flex-wrap gap-2">
                {evidence.map((ev: any, idx: number) => (
                  <BusinessAttribution key={idx} attr={{ entityType: Object.keys(ev)[0].replace('Id', ''), entityId: Object.values(ev)[0] }} />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {suggestedActions?.map((action: any) => (
              <Button 
                key={action.id}
                disabled={isExecuting}
                onClick={() => handleAction(action.id)}
                className={cn(
                  "flex-1 rounded-2xl h-11 font-black uppercase text-[10px] tracking-widest transition-all",
                  action.critical 
                    ? "bg-primary text-white hover:scale-105 shadow-lg shadow-primary/20" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {action.label}
              </Button>
            ))}
            <Button 
              onClick={() => handleCreateTicket({ 
                content: message.content, 
                channelId: message.channelId,
                attributions: message.attributions 
              })}
              className="rounded-2xl h-11 font-black uppercase text-[10px] tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              Convertir en Ticket
            </Button>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
             <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Gemma v4.0 Active</span>
          </div>
          <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Audit ID: {suggestionId?.substring(0,8)}</span>
        </div>
      </div>
    </div>
  );
}
