import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface QueueStatusCardProps {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  className?: string;
}

export function QueueStatusCard({ name, counts, className }: QueueStatusCardProps) {
  const isHealthy = counts.failed === 0;
  
  return (
    <Card className={cn("border-l-4", isHealthy ? "border-l-emerald-500" : "border-l-amber-500", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider">{name.replace('-', ' ')}</CardTitle>
        <Badge variant={isHealthy ? "outline" : "destructive"} className="animate-pulse">
          {isHealthy ? "Operativo" : "Revisar"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">En espera</p>
              <p className="text-sm font-semibold">{counts.waiting}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Activos</p>
              <p className="text-sm font-semibold">{counts.active}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">Completados</p>
              <p className="text-sm font-semibold">{counts.completed}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <AlertCircle className={cn("w-4 h-4", counts.failed > 0 ? "text-rose-500" : "text-muted-foreground")} />
            <div>
              <p className="text-xs text-muted-foreground">Fallidos</p>
              <p className={cn("text-sm font-semibold", counts.failed > 0 && "text-rose-600")}>{counts.failed}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
