'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { ChannelSidebar } from './ChannelSidebar';
import { MessageFeed } from './MessageFeed';
import { MessageComposer } from './MessageComposer';
import { cn } from '@/lib/utils';
import { Loader2, Hash, Lock, Volume2, Settings, Users, Search, Star } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function ConnectLayout() {
  const { data: channels, mutate: mutateChannels, error } = useSWR('/api/connect/channels', fetcher, {
    refreshInterval: 5000 // Polling cada 5s para el MVP
  });
  
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const isChannelsArray = Array.isArray(channels);
  const channelsArray = isChannelsArray ? channels : [];
  const apiError = channels && !isChannelsArray ? (channels as any).error : null;

  useEffect(() => {
    if (isChannelsArray && channelsArray.length > 0 && !activeChannelId) {
      // Por defecto abrir el canal General
      const general = channelsArray.find((c: any) => c.name === 'General');
      setActiveChannelId(general?.id || channelsArray[0].id);
    }
  }, [channelsArray, isChannelsArray, activeChannelId]);

  const activeChannel = channelsArray.find((c: any) => c.id === activeChannelId);

  const togglePin = async () => {
    if (!activeChannelId) return;
    try {
      const isCurrentlyPinned = activeChannel?.isPinned;
      await fetch(`/api/connect/channels/${activeChannelId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: !isCurrentlyPinned })
      });
      mutateChannels();
    } catch (e) {
      console.error('Error toggling pin:', e);
    }
  };

  if (error || apiError) return <div className="p-10 text-center text-red-500 font-bold uppercase tracking-widest text-xs">{error?.message || apiError || 'Error al cargar Volkern Connect'}</div>;
  if (!channels) return (
    <div className="flex h-[calc(100vh-120px)] items-center justify-center bg-slate-50/30 rounded-3xl border-2 border-dashed border-slate-200">
      <Loader2 className="w-10 h-10 animate-spin text-primary/30" />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Sidebar de Canales */}
      <ChannelSidebar 
        channels={channelsArray} 
        activeChannelId={activeChannelId} 
        onSelectChannel={setActiveChannelId} 
      />

      {/* Feed de Mensajes */}
      <div className="flex min-w-0 flex-1 flex-col bg-slate-50/60 dark:bg-slate-950/40">
        {activeChannel ? (
          <>
            {/* Header del Canal */}
            <header className="flex h-[4.5rem] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                  {activeChannel.type === 'private' ? <Lock className="w-5 h-5" /> : <Hash className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                    {activeChannel.name}
                    {activeChannel.isLocked && <Lock className="w-3 h-3 text-slate-400" />}
                    <button 
                      onClick={togglePin}
                      className={cn(
                        "ml-2 transition-all hover:scale-110 active:scale-95",
                        activeChannel.isPinned ? "text-amber-400" : "text-slate-200 hover:text-amber-200"
                      )}
                    >
                      <Star className={cn("w-4 h-4", activeChannel.isPinned ? "fill-current" : "")} />
                    </button>
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {activeChannel.type === 'system' ? 'Canal Institucional' : 'Canal de Equipo'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative group mr-4">
                  <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 group-hover:text-primary transition-colors" />
                  <input 
                    type="text" 
                    placeholder="BUSCAR EN CANAL..." 
                    className="h-9 w-48 rounded-lg border border-slate-200 bg-slate-50 pl-9 text-[9px] font-black uppercase tracking-widest transition-all focus:bg-white focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900"
                  />
                </div>
                <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800">
                  <Users className="w-4 h-4" />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Area de Mensajes */}
            <MessageFeed channelId={activeChannelId!} />

            {/* Composer */}
            <MessageComposer 
              channelId={activeChannelId!} 
              onMessageSent={() => {
                mutateChannels(); // Refrescar para ver el último mensaje en el sidebar
              }}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-30">
            <Volume2 className="w-20 h-20 mb-4" />
            <h3 className="text-xl font-black uppercase tracking-tighter">Selecciona un canal para conectar</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-2">La comunicación operativa ocurre aquí.</p>
          </div>
        )}
      </div>
    </div>
  );
}
