'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Play, History, Settings2, Trash2, Zap, MoreHorizontal, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function AutomationRulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rRes, lRes] = await Promise.all([
        fetch('/api/marketing/automation/rules'),
        fetch('/api/marketing/automation/logs')
      ]);
      if (rRes.ok) setRules(await rRes.json());
      if (lRes.ok) setLogs(await lRes.json());
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar las automatizaciones.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRule = async (id: string, current: boolean) => {
    try {
      const res = await fetch('/api/marketing/automation/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !current })
      });
      if (res.ok) {
        setRules(rules.map(r => r.id === id ? { ...r, isActive: !current } : r));
        toast({ title: "Actualizado", description: `Regla ${!current ? 'activada' : 'desactivada'}.` });
      }
    } catch (error) {
      toast({ title: "Error", description: "No se pudo actualizar la regla.", variant: "destructive" });
    }
  };

  return (
    <div className="p-8 space-y-8 bg-slate-50/30 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Automatización de Marketing</h1>
          <p className="text-muted-foreground mt-1">Configura reglas inteligentes basadas en eventos del ERP.</p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200">
          <Plus className="w-4 h-4 mr-2" /> Nueva Regla
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lista de Reglas */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-white border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Reglas Activas</CardTitle>
                  <CardDescription>Eventos que disparan acciones automáticas</CardDescription>
                </div>
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-100">
                  {rules.length} Reglas
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="pl-6">Nombre / Trigger</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Ejecuciones</TableHead>
                    <TableHead>Última vez</TableHead>
                    <TableHead className="text-right pr-6"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="pl-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Zap className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-sm">{rule.name}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{rule.triggerType.replace('_', ' ')}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch 
                          checked={rule.isActive} 
                          onCheckedChange={() => toggleRule(rule.id, rule.isActive)}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{rule._count?.logs || 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {rule.updatedAt ? new Date(rule.updatedAt).toLocaleDateString() : 'N/A'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><Settings2 className="w-4 h-4 mr-2" /> Editar</DropdownMenuItem>
                            <DropdownMenuItem><Play className="w-4 h-4 mr-2" /> Probar</DropdownMenuItem>
                            <DropdownMenuItem className="text-rose-600"><Trash2 className="w-4 h-4 mr-2" /> Eliminar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        No hay reglas configuradas. ¡Crea tu primera automatización!
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Historial de Ejecución */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center">
                  <History className="w-5 h-5 mr-2 text-slate-400" />
                  Historial Vivo
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={fetchData} className="h-8 w-8 p-0">
                  <Clock className="w-4 h-4" />
                </Button>
              </div>
              <CardDescription>Últimas 50 ejecuciones automáticas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start space-x-3 p-3 rounded-lg border bg-white/50 text-sm">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-grow">
                    <p className="font-bold leading-none mb-1">{log.rule.name}</p>
                    <p className="text-xs text-muted-foreground truncate w-40">Entidad: {log.entityId}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-tighter">
                      {new Date(log.executedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm italic">
                  Esperando eventos...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
