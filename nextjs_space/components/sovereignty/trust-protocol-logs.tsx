'use client'

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { History, ShieldAlert, Bot, User, CheckCircle, Clock, ShieldCheck } from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  triggeredBy: string;
  details: string;
  status: string;
}

export function TrustProtocolLogs({ category }: { category?: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const url = category ? `/api/v1/sovereignty/audit-logs?category=${category}` : '/api/v1/sovereignty/audit-logs';
        const response = await fetch(url);
        const data = await response.json();
        if (data.success) setLogs(data.logs);
      } catch (e) {
        console.error('Error fetching logs:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, []);

  if (isLoading) return <div className="h-64 flex items-center justify-center bg-muted/20 rounded-lg animate-pulse">Consultando protocolo de confianza...</div>;

  return (
    <Card className="h-full flex flex-col border-primary/20 bg-background/50 backdrop-blur-sm overflow-hidden">
      <CardHeader className="drag-handle shrink-0">
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Trust Protocol Audit
        </CardTitle>
        <CardDescription>Registro forense de integridad y acciones del sistema</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-thin">
        <div className="space-y-4 pb-4">
          {logs.map((log, i) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`p-3 rounded-lg border flex gap-3 items-start ${
                log.level === 'URGENT' ? 'bg-destructive/5 border-destructive/20' : 'bg-muted/30 border-muted'
              }`}
            >
              {/* Avatar Logic */}
              <div className="mt-1">
                {log.triggeredBy === 'SYSTEM_BOT' ? (
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 shadow-lg shadow-primary/20">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold truncate max-w-[200px]">
                    {log.triggeredBy === 'SYSTEM_BOT' ? 'Volkern Finance Engine' : 'Administrator'}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <p className="text-sm font-medium mb-1">
                  {log.message.includes('Recuperación Proactiva') 
                    ? 'Recuperado automáticamente vía Verifactu Engine' 
                    : log.message}
                </p>
                
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 ${
                      log.level === 'URGENT' ? 'bg-destructive/20 text-destructive' : 'bg-primary/10 text-primary'
                    }`}>
                      {log.level === 'URGENT' ? <ShieldAlert className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                      {log.level}
                    </div>
                    <span className="text-[10px] text-muted-foreground italic truncate">
                      {log.details.replace('[SIGNATURE]', '').replace('[DIGITAL_CMD]', '')}
                    </span>
                  </div>

                  {log.message.includes('[SIGNATURE]') && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-amber-500/20 transition-all"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Descargar Acta Firmada
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          {logs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
              <History className="h-8 w-8 opacity-20" />
              <p className="text-sm">Sin incidencias de integridad registradas</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
