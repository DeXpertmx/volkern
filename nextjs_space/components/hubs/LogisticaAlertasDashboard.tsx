'use client';

import {
  AlertTriangle, Wrench, Calendar, Clock,
  Truck, HardDrive, ShieldCheck, Loader2, Navigation,
  Package,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import useSWR from 'swr';
import { motion } from 'framer-motion';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Calendar,
  Wrench,
  HardDrive,
  Truck,
  ShieldCheck,
  Navigation,
  Package,
  AlertTriangle,
};

const ALERT_STYLES: Record<string, { border: string; bg: string; color: string; badge: string; badgeColor: string }> = {
  CRITICAL: {
    border: 'border-red-500/20',
    bg: 'bg-red-500/10',
    color: 'text-red-400',
    badge: 'CRÍTICO',
    badgeColor: 'bg-red-500/20 text-red-400',
  },
  WARNING: {
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/10',
    color: 'text-amber-400',
    badge: 'PENDIENTE',
    badgeColor: 'bg-amber-500/20 text-amber-400',
  },
  INFO: {
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/10',
    color: 'text-blue-400',
    badge: 'INFO',
    badgeColor: 'bg-blue-500/20 text-blue-400',
  },
};

export default function AlertasDashboard() {
  const { data, isLoading } = useSWR('/api/erp/logistics/alerts', fetcher);

  const alerts = data?.alerts || [];
  const summary = data?.summary || { critical: 0, warning: 0, info: 0, total: 0 };

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-foreground dark:text-white">Alertas Logísticas</h1>
              <p className="text-xs font-bold text-muted-foreground dark:text-slate-500 uppercase tracking-widest">Mantenimiento, ITV, capacidad y notificaciones</p>
            </div>
          </div>
        </div>
        <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[10px] font-black uppercase px-3 py-1">
          {isLoading ? '...' : `${summary.critical + summary.warning} Activas`}
        </Badge>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Críticas', value: isLoading ? '...' : summary.critical, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Pendientes', value: isLoading ? '...' : summary.warning, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Informativa', value: isLoading ? '...' : summary.info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
              <CardContent className="p-5 text-center">
                <p className={`text-3xl font-black ${stat.color} tracking-tight`}>{stat.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground dark:text-slate-500 mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight">Todas las Alertas</h3>

        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center p-12 bg-muted/50 dark:bg-slate-800/50 rounded-2xl border border-border dark:border-slate-700">
            <ShieldCheck className="w-10 h-10 text-muted-foreground/40 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground dark:text-slate-500 font-medium">No hay alertas activas. Todo está en orden.</p>
          </div>
        ) : (
          alerts.map((alert: any, i: number) => {
            const Icon = ICON_MAP[alert.icon] || AlertTriangle;
            const styles = ALERT_STYLES[alert.type] || ALERT_STYLES.INFO;
            return (
              <motion.div
                key={alert.id || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className={`border-none shadow-sm bg-card dark:bg-slate-900 border-l-4 ${styles.border}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl ${styles.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-6 h-6 ${styles.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-bold text-foreground dark:text-white text-sm">{alert.title}</h4>
                          <Badge className={`border-none text-[9px] font-black uppercase px-2 py-0.5 ${styles.badgeColor}`}>
                            {styles.badge}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground dark:text-slate-400">{alert.description}</p>
                      </div>
                      <a
                        href={alert.link || '#'}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-xl border border-border text-foreground/80 dark:border-slate-700 dark:text-slate-300 text-[10px] font-black uppercase hover:bg-accent dark:hover:bg-slate-800 transition-colors shrink-0"
                      >
                        Revisar
                      </a>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
