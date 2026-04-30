'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Bell, BellRing, Check, Clock, ExternalLink } from 'lucide-react';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function NotificationCenter() {
  const { data: notifications, mutate } = useSWR('/api/notifications', fetcher, {
    refreshInterval: 30000 // Refrescar cada 30 segundos
  });

  const unreadCount = Array.isArray(notifications) 
    ? notifications.filter((n: any) => !n.read).length 
    : 0;

  const markAsRead = async (id?: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, all: !id })
      });
      mutate();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-xl hover:bg-slate-100 transition-all">
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5 text-primary animate-pulse" />
          ) : (
            <Bell className="h-5 w-5 text-slate-500" />
          )}
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 border-2 border-white text-[10px] font-bold rounded-full">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-2xl shadow-2xl border-slate-100 mr-4" align="end">
        <div className="p-4 border-b flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
          <h4 className="font-black text-[11px] uppercase tracking-widest text-slate-500">Notificaciones del Sistema</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => markAsRead()} 
              className="text-[10px] uppercase font-bold text-primary hover:text-primary/80 h-7 px-2"
            >
              Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="h-96">
          {!Array.isArray(notifications) || notifications.length === 0 ? (
            <div className="p-12 text-center">
              <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Bell className="h-6 w-6 text-slate-200" />
              </div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Sin notificaciones</p>
            </div>
          ) : (
            <div className="grid divide-y divide-slate-50">
              {notifications.map((n: any) => (
                <div 
                  key={n.id} 
                  className={`p-4 transition-all hover:bg-slate-50 relative group ${!n.read ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex gap-3">
                    <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${!n.read ? 'bg-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] leading-tight ${!n.read ? 'font-black text-slate-900' : 'font-bold text-slate-600'}`}>{n.title}</p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-3 font-medium">{n.body}</p>
                      
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-300" />
                          <span className="text-[9px] font-black uppercase text-slate-400">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                        
                        {n.actionUrl && (
                          <Link 
                            href={n.actionUrl}
                            className="flex items-center gap-1 text-[9px] font-black uppercase text-primary hover:underline tracking-widest"
                          >
                            Ver <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                    {!n.read && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => markAsRead(n.id)}
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-all rounded-lg bg-white shadow-sm border border-slate-100"
                      >
                        <Check className="h-4 w-4 text-emerald-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-3 border-t bg-slate-50/50 rounded-b-2xl text-center">
           <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Fin del historial</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
