'use client';

import React from 'react';
import { Hash, Lock, Plus, MessageSquare, Star, AtSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';

interface ChannelSidebarProps {
  channels: any[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
}

export function ChannelSidebar({ channels, activeChannelId, onSelectChannel }: ChannelSidebarProps) {
  const { data: session } = useSession();
  const publicChannels = channels.filter(c => c.type === 'public' || c.type === 'system');
  const privateChannels = channels.filter(c => c.type === 'private');
  const projectChannels = channels.filter(c => c.type === 'project' || c.type === 'deal');

  const userInitial = session?.user?.name?.charAt(0) || 'U';
  const userName = session?.user?.name || 'Usuario';
  const userRole = (session?.user as any)?.roleName || 'Miembro';

  const canCreateChannels = ['Admin', 'Owner', 'Operator', 'Superadmin'].includes(userRole);

  return (
    <aside className="flex w-64 min-h-0 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      {/* Header Sidebar */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h1 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2">
            Volkern <span className="text-primary font-black italic">Connect</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Workspace Activo</span>
          </div>
        </div>
        {canCreateChannels && (
          <button className="h-8 w-8 rounded-xl bg-primary text-white flex items-center justify-center hover:scale-105 transition-all active:scale-95 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navegación de Canales */}
      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-3 scrollbar-hide">
        
        {/* Canales Institucionales */}
        <div className="space-y-3">
          <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] px-3 flex justify-between items-center">
            Institucional
            <Star className="w-2.5 h-2.5" />
          </h3>
          <div className="space-y-1">
            {publicChannels.map(channel => (
              <ChannelItem 
                key={channel.id}
                channel={channel}
                isActive={activeChannelId === channel.id}
                onClick={() => onSelectChannel(channel.id)}
              />
            ))}
          </div>
        </div>

        {/* Canales de Operación (Proyectos/Deals) */}
        {projectChannels.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] px-3 flex justify-between items-center">
              Operaciones
              <AtSign className="w-2.5 h-2.5" />
            </h3>
            <div className="space-y-1">
              {projectChannels.map(channel => (
                <ChannelItem 
                  key={channel.id}
                  channel={channel}
                  isActive={activeChannelId === channel.id}
                  onClick={() => onSelectChannel(channel.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Mensajes Directos */}
        <div className="space-y-3">
          <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] px-3 flex justify-between items-center">
            Privado
            <Lock className="w-2.5 h-2.5" />
          </h3>
          <div className="space-y-1">
            {privateChannels.map(channel => (
              <ChannelItem 
                key={channel.id}
                channel={channel}
                isActive={activeChannelId === channel.id}
                onClick={() => onSelectChannel(channel.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Perfil Usuario (Inferior) */}
      <div className="mt-auto border-t border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-white text-[10px] font-black uppercase">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-white uppercase truncate">{userName}</p>
            <p className="text-[8px] font-bold text-slate-500 uppercase">{userRole}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ChannelItem({ channel, isActive, onClick }: { channel: any, isActive: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all group",
        isActive 
          ? "bg-primary text-white shadow-lg shadow-primary/20" 
          : "text-slate-400 hover:bg-slate-800 hover:text-white"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "w-6 h-6 rounded-lg flex items-center justify-center",
          isActive ? "bg-white/20" : "bg-slate-800 group-hover:bg-slate-700"
        )}>
          {channel.type === 'private' ? <Lock className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
        </div>
        <span className="text-[11px] font-black uppercase truncate tracking-tight">
          {channel.name}
        </span>
      </div>
      
      {channel.unreadCount > 0 && !isActive && (
        <Badge className="bg-primary border-none text-[8px] font-black px-1.5 h-4 min-w-[16px] flex items-center justify-center">
          {channel.unreadCount}
        </Badge>
      )}
    </button>
  );
}
