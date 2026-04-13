'use client';

import React from 'react';
import { 
  User, 
  Users, 
  MessageSquare, 
  AtSign, 
  Mail, 
  Clock, 
  Archive, 
  AlertCircle,
  Plus,
  Hash,
  ChevronDown,
  Inbox,
  ArrowLeft,
  Bot,
  PhoneCall
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface SidebarFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export function SidebarFilters({ activeFilter, onFilterChange }: SidebarFiltersProps) {
  const router = useRouter();
  const sections = [
    { id: 'me', name: 'Asignadas a mí', icon: User, count: 32 },
    { id: 'favorites', name: 'Favoritas', icon: Clock },
    { id: 'all', name: 'Todas', icon: Inbox },
    { id: 'mentions', name: 'Mis menciones', icon: AtSign },
    { id: 'unread', name: 'No leídas', icon: MessageSquare },
    { id: 'scheduled', name: 'Programados', icon: Clock },
    { id: 'spam', name: 'Spam', icon: AlertCircle },
  ];

  const categories = [
    { id: 'users', name: 'Usuarios (Equipo)', icon: Users, path: '/dashboard/equipo' },
    { id: 'channels', name: 'Canales (Inbox)', icon: Hash, path: '/dashboard/integraciones' },
    { id: 'attributes', name: 'Atributos', icon: Plus, path: '/dashboard/configuracion' },
  ];

  const modules = [
    { id: 'telefonia', name: 'Telefonía Central', icon: PhoneCall, path: '/dashboard/telefonia' },
    { id: 'chatbot', name: 'Chatbot (Flows)', icon: Bot, path: '/dashboard/chatbot' },
    { id: 'live-chat', name: 'Chat en Vivo', icon: MessageSquare, path: '/dashboard/live-chat' },
  ];

  return (
    <div className="w-64 border-r bg-slate-50 flex flex-col h-full overflow-hidden shrink-0">
      <div className="p-4 border-b bg-white/50 backdrop-blur-sm">
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start gap-2 hover:bg-slate-100 transition-all font-bold p-0 h-auto"
          onClick={() => router.push('/dashboard')}
        >
          <img src="/volkern-logo.png" alt="Volkern" className="h-8 object-contain" />
        </Button>
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        {/* Main Filters */}
        <div className="space-y-1">
          {sections.map((item) => (
            <button
              key={item.id}
              onClick={() => onFilterChange(item.id)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                activeFilter === item.id 
                  ? "bg-white text-blue-600 shadow-sm font-bold" 
                  : "text-slate-600 hover:bg-slate-200/50"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon size={18} className={activeFilter === item.id ? "text-blue-600" : "text-slate-400"} />
                <span>{item.name}</span>
              </div>
              {item.count !== undefined && (
                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Modules */}
        <div className="pt-4 border-t border-slate-100">
          <div className="px-3 mb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Módulos de Comunicación
          </div>
          <div className="space-y-1">
            {modules.map((mod) => (
              <button
                key={mod.id}
                onClick={() => router.push(mod.path)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <mod.icon size={16} />
                <span className="font-medium">{mod.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Groups */}
        <div className="pt-4 border-t border-slate-100">
           <div className="px-3 mb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Administración Central
          </div>
          <div className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => router.push(cat.path)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <cat.icon size={16} />
                  <span className="font-medium">{cat.name}</span>
                </div>
                <ArrowLeft size={12} className="rotate-135 opacity-50" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Section */}
      <div className="p-4 border-t bg-slate-100/50">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Gestión</div>
        <button 
          onClick={() => router.push('/dashboard/configuracion')}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-200/50 hover:text-blue-600 transition-colors font-medium">
          <div className="flex items-center gap-3">
            <Clock size={16} />
            <span>Configuraciones</span>
          </div>
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}
