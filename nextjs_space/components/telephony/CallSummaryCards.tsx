'use client';

import React from 'react';
import { 
  Phone, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed, 
  Clock, 
  Wallet,
  ArrowUpRight,
  TrendingUp,
  CreditCard
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StatsData {
  total: number;
  incoming: number;
  outgoing: number;
  missed: number;
  avgDuration: number;
  balance?: string;
  currency?: string;
}

export function CallSummaryCards({ stats, balanceLoading }: { stats: StatsData | null, balanceLoading: boolean }) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const cards = [
    {
      title: 'Todas las llamadas',
      value: stats?.total || 0,
      icon: Phone,
      color: 'blue',
      description: 'Total de interacciones',
    },
    {
      title: 'Minutos restantes',
      value: stats?.balance ? `${stats.balance} ${stats.currency || 'USD'}` : '0.00 USD',
      icon: Wallet,
      color: 'indigo',
      description: 'Saldo disponible Zadarma',
      action: (
        <Button variant="link" className="text-blue-600 p-0 h-auto text-xs font-bold" asChild>
          <a href="https://my.zadarma.com/pay/" target="_blank">Comprar minutos</a>
        </Button>
      ),
      loading: balanceLoading
    },
    {
      title: 'Llamadas entrantes',
      value: stats?.incoming || 0,
      percentage: stats?.total ? Math.round((stats.incoming / stats.total) * 100) : 0,
      icon: PhoneIncoming,
      color: 'emerald',
      description: 'del total de llamadas',
    },
    {
      title: 'Llamadas salientes',
      value: stats?.outgoing || 0,
      percentage: stats?.total ? Math.round((stats.outgoing / stats.total) * 100) : 0,
      icon: PhoneOutgoing,
      color: 'violet',
      description: 'del total de llamadas',
    },
    {
      title: 'Llamadas perdidas',
      value: stats?.missed || 0,
      percentage: stats?.total ? Math.round((stats.missed / stats.total) * 100) : 0,
      icon: PhoneMissed,
      color: 'rose',
      description: 'de las llamadas recibidas',
    },
    {
      title: 'Duración media',
      value: formatDuration(stats?.avgDuration || 0),
      icon: Clock,
      color: 'orange',
      description: 'En llamadas atendidas',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {cards.map((card, index) => (
        <Card key={index} className="overflow-hidden border-none shadow-sm bg-white/50 backdrop-blur-sm hover:shadow-md transition-all duration-300">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div className={cn(
                "p-2 rounded-xl bg-opacity-10",
                card.color === 'blue' && "bg-blue-500 text-blue-600",
                card.color === 'indigo' && "bg-indigo-500 text-indigo-600",
                card.color === 'emerald' && "bg-emerald-500 text-emerald-600",
                card.color === 'violet' && "bg-violet-500 text-violet-600",
                card.color === 'rose' && "bg-rose-500 text-rose-600",
                card.color === 'orange' && "bg-orange-500 text-orange-600",
              )}>
                <card.icon size={20} />
              </div>
              {card.action}
            </div>
            
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{card.title}</p>
              <div className="flex items-baseline gap-2">
                <h3 className={cn(
                  "text-2xl font-bold tracking-tight text-slate-900",
                  card.loading && "animate-pulse bg-slate-200 text-transparent rounded"
                )}>
                  {card.value}
                </h3>
                {card.percentage !== undefined && (
                  <span className="text-[10px] font-bold text-slate-400">
                    {card.percentage}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 truncate">{card.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
