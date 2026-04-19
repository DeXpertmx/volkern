'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, History, Eye, Ban, ShieldAlert, FileText, UserCheck, Search, Activity } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";

export default function MarketingGovernancePage() {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [suppressions, setSuppressions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [aRes, sRes] = await Promise.all([
        fetch('/api/marketing/audit'),
        fetch('/api/marketing/compliance/suppressions')
      ]);
      if (aRes.ok) setAuditLogs(await aRes.json());
      if (sRes.ok) setSuppressions(await sRes.json());
    } catch (error) {
      toast({ title: "Error", description: "No se pudo cargar la gobernanza.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-8 space-y-8 bg-slate-50/30 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center">
            <ShieldCheck className="w-8 h-8 mr-3 text-indigo-600" />
            Gobernanza de Marketing
          </h1>
          <p className="text-muted-foreground mt-1">Auditoría, Seguridad y Cumplimiento Normativo (GDPR/Opt-out).</p>
        </div>
        <div className="flex space-x-3">
           <Badge variant="outline" className="bg-white px-4 py-1.5 border-slate-200 shadow-sm text-slate-600 font-bold">
             <Activity className="w-3 h-3 mr-2 text-emerald-500" />
             ESTADO: PROTEGIDO
           </Badge>
        </div>
      </div>

      <Tabs defaultValue="audit" className="space-y-6">
        <TabsList className="bg-white border p-1 rounded-xl shadow-sm">
          <TabsTrigger value="audit" className="rounded-lg px-6"><History className="w-4 h-4 mr-2" /> Auditoría</TabsTrigger>
          <TabsTrigger value="compliance" className="rounded-lg px-6"><Ban className="w-4 h-4 mr-2" /> Compliance</TabsTrigger>
          <TabsTrigger value="security" className="rounded-lg px-6"><ShieldAlert className="w-4 h-4 mr-2" /> Seguridad</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="space-y-6">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-white border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Registro de Auditoría Forense</CardTitle>
                <CardDescription>Seguimiento detallado de cada acción humana e IA.</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input 
                  placeholder="Buscar acciones..." 
                  className="pl-9 h-9 text-xs" 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="pl-6">Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Usuario/IA</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right pr-6">Detalles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="pl-6 text-xs font-medium text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-tighter">
                          {log.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold text-sm">{log.action}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <div className={`p-1 rounded ${log.userId ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                            {log.userId ? <UserCheck className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                          </div>
                          <span className="text-xs">{log.user?.name || (log.category === 'AI' ? 'Gemma 4' : 'System')}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} border-none`}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {auditLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-slate-400 italic">
                        No se encontraron registros de auditoría.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-none shadow-sm bg-rose-50/50 border-rose-100 border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-rose-700 flex items-center">
                  <Ban className="w-4 h-4 mr-2" /> LISTA DE EXCLUSIÓN
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-rose-900">{suppressions.length}</p>
                <p className="text-xs text-rose-600/70 mt-1">Contactos que no recibirán comunicaciones.</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500 flex items-center">
                  <FileText className="w-4 h-4 mr-2" /> OPT-OUT RATIO
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-900">1.2%</p>
                <p className="text-xs text-slate-500 mt-1">Tendencia estable en los últimos 30 días.</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Gestión de Consentimiento Global</CardTitle>
              <CardDescription>Bajas por canal y supresiones manuales.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Email</TableHead>
                    <TableHead>Fecha de Baja</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right pr-6">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppressions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6 font-medium">{s.email}</TableCell>
                      <TableCell className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{s.source}</Badge>
                      </TableCell>
                      <TableCell className="text-xs italic">{s.reason || 'Sin motivo especificado'}</TableCell>
                      <TableCell className="text-right pr-6">
                        <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">Eliminar</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {suppressions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center text-slate-400 italic">
                        La lista de exclusión está vacía.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <Card className="border-none shadow-sm">
                <CardHeader>
                   <CardTitle className="text-lg flex items-center">
                     <ShieldCheck className="w-5 h-5 mr-2 text-indigo-600" />
                     Estado de Credenciales
                   </CardTitle>
                   <CardDescription>Tokens OAuth y secretos en Volkern Vault.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                   {[
                     { platform: 'LinkedIn', status: 'Active', expiry: 'En 45 días', color: 'bg-emerald-500' },
                     { platform: 'YouTube', status: 'Active', expiry: 'En 12 días', color: 'bg-emerald-500' },
                     { platform: 'TikTok', status: 'Expired', expiry: 'Ayer', color: 'bg-rose-500' }
                   ].map(p => (
                     <div key={p.platform} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center space-x-3">
                           <div className={`w-2 h-2 rounded-full ${p.color}`} />
                           <span className="font-bold">{p.platform}</span>
                        </div>
                        <div className="text-right">
                           <p className="text-xs font-bold uppercase tracking-tight text-slate-400">{p.status}</p>
                           <p className="text-[10px] text-slate-500">Expira: {p.expiry}</p>
                        </div>
                     </div>
                   ))}
                </CardContent>
             </Card>

             <Card className="border-none shadow-sm bg-slate-900 text-white">
                <CardHeader>
                   <CardTitle className="text-white">Políticas de Gobernanza Activas</CardTitle>
                   <CardDescription className="text-slate-400">Restricciones de seguridad por rol y tenant.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                   {[
                     "Aprobación Humana requerida para posts sociales.",
                     "Límite de 1000 emails por hora para este tenant.",
                     "Vault Lock activo: Solo el rol OWNER puede ver credenciales.",
                     "Audit Integrity: Logs inmutables con hash SHA-256."
                   ].map((policy, i) => (
                     <div key={i} className="flex items-start space-x-3 border-b border-white/10 pb-3 last:border-0">
                        <UserCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <span className="text-slate-200">{policy}</span>
                     </div>
                   ))}
                </CardContent>
             </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
