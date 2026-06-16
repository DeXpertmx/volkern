'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, Clock, AlertTriangle, CheckCircle2, XCircle, 
  FileText, DollarSign, Users, Calendar, TrendingUp, 
  Search, Filter, Ban, Eye, ArrowRight, Loader2,
  Wallet, Building2, UserCheck, Percent, Wrench, QrCode
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface ApprovalRequest {
  id: string;
  userId: string;
  tenantId: string;
  intent: string;
  params: any;
  originalMessage: string;
  status: string;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  approverNote: string | null;
}

interface Stats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
  approvalRate: number;
  pendingByCategory: { category: string; count: number; label: string }[];
}

interface WorkflowRule {
  id: string;
  name: string;
  category: string;
  description: string;
  condition: string;
  requiredRole: string;
  priority: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  EXPENSE: { label: 'Gastos', icon: Wallet, color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
  DEAL: { label: 'Ventas', icon: TrendingUp, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  CONTRACT: { label: 'Contratos', icon: FileText, color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
  VACATION: { label: 'Vacaciones', icon: Calendar, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  BUDGET: { label: 'Presupuesto', icon: DollarSign, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  DISCOUNT: { label: 'Descuentos', icon: Percent, color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
  PRODUCTION: { label: 'Producción', icon: Wrench, color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' },
  QUALITY: { label: 'Calidad', icon: QrCode, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' },
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'text-slate-500 bg-slate-100',
  MEDIUM: 'text-amber-600 bg-amber-50',
  HIGH: 'text-orange-600 bg-orange-50',
  CRITICAL: 'text-rose-600 bg-rose-50',
};

function getCategoryMeta(category?: string) {
  return CATEGORY_META[category || ''] || { label: category || 'Otro', icon: ShieldCheck, color: 'text-slate-500 bg-slate-100 border-slate-200' };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function AprobacionesPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [dialogMode, setDialogMode] = useState<'approve' | 'reject' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  useEffect(() => {
    fetchData('pending');
  }, []);

  const fetchData = async (type: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aprobaciones?type=${type}`);
      const json = await res.json();
      if (json.success) {
        setRequests(json.data || []);
        if (json.stats) setStats(json.stats);
        if (json.rules) setRules(json.rules);
      }
    } catch (error) {
      toast.error('Error al cargar solicitudes');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    fetchData(tab);
    setSelectedRequest(null);
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedRequest) return;
    if (action === 'reject' && !actionNote.trim()) {
      toast.error('Debes escribir un motivo de rechazo');
      return;
    }

    setProcessingAction(action);
    try {
      const res = await fetch(`/api/aprobaciones/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: actionNote }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        setDialogMode(null);
        setSelectedRequest(null);
        setActionNote('');
        fetchData(activeTab);
      } else {
        toast.error(json.error || 'Error al procesar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleQuickApprove = async (requestId: string) => {
    setProcessingAction('approve');
    try {
      const res = await fetch(`/api/aprobaciones/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', note: '' }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        fetchData(activeTab);
      } else {
        toast.error(json.error || 'Error');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setProcessingAction(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    const params = r.params || {};
    const searchStr = `${params.title || ''} ${params.description || ''} ${r.originalMessage || ''} ${params.ruleName || ''}`.toLowerCase();
    return searchStr.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-primary font-black uppercase tracking-[0.2em] text-[10px]">
            <ShieldCheck className="w-4 h-4" />
            Control de Acceso
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase">
            Aprobaciones <span className="text-primary italic">Obligatorias</span>
          </h1>
          <p className="text-slate-500 font-medium max-w-xl">
            Workflows predefinidos con aprobación por roles. Ninguna acción crítica se ejecuta sin supervisión.
          </p>
        </div>
      </div>

      {/* ─── Stats Grid ──────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Pendientes', value: stats.pending, color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
            { label: 'Aprobadas', value: stats.approved, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
            { label: 'Rechazadas', value: stats.rejected, color: 'text-rose-600', bg: 'bg-rose-50', icon: XCircle },
            { label: 'Total', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-50', icon: ShieldCheck },
            { label: 'Tasa Aprobación', value: `${stats.approvalRate}%`, color: 'text-purple-600', bg: 'bg-purple-50', icon: TrendingUp },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <Card key={i} className="border-none shadow-sm rounded-2xl">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-black">{stat.value}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Pending by Category ────────────────────────────────── */}
      {stats && stats.pendingByCategory.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider self-center mr-2">Pendientes por área:</span>
          {stats.pendingByCategory.map((cat, i) => {
            const meta = getCategoryMeta(cat.category);
            return (
              <Badge key={i} variant="outline" className="rounded-full px-3 py-1 gap-1.5 border-slate-200">
                <meta.icon className="w-3 h-3" />
                {cat.label}: <span className="font-black">{cat.count}</span>
              </Badge>
            );
          })}
        </div>
      )}

      {/* ─── Tabs ────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList className="rounded-2xl bg-slate-100 p-1 h-auto">
            <TabsTrigger value="pending" className="rounded-xl data-[state=active]:bg-white font-bold text-xs px-5 py-2 gap-2">
              <Clock className="w-4 h-4" />
              Pendientes {stats && `(${stats.pending})`}
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl data-[state=active]:bg-white font-bold text-xs px-5 py-2 gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Historial
            </TabsTrigger>
            <TabsTrigger value="rules" className="rounded-xl data-[state=active]:bg-white font-bold text-xs px-5 py-2 gap-2">
              <ShieldCheck className="w-4 h-4" />
              Reglas
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar solicitudes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl pl-10 h-10 border-slate-200 text-sm"
            />
          </div>
        </div>

        {/* ═══ PENDING TAB ═══ */}
        <TabsContent value="pending" className="mt-0 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-1">¡Todo al día!</h3>
              <p className="text-slate-500">No hay solicitudes de aprobación pendientes.</p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredRequests.map((req, i) => {
                const params = req.params || {};
                const meta = getCategoryMeta(params.category);
                const Icon = meta.icon;
                const isPending = req.status === 'pending';

                return (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card className={cn(
                      "border-none shadow-sm rounded-2xl hover:shadow-md transition-all duration-300",
                      isPending && "border-l-4 border-l-amber-400"
                    )}>
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row items-start gap-5">
                          {/* Icon */}
                          <div className={`w-14 h-14 rounded-2xl ${meta.color.split(' ').slice(1).join(' ')} border flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-7 h-7 ${meta.color.split(' ')[0]}`} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <Badge className={cn("rounded-full px-3 py-0.5 text-[10px] font-bold uppercase", meta.color)}>
                                {meta.label}
                              </Badge>
                              {params.priority && (
                                <Badge className={cn("rounded-full px-3 py-0.5 text-[10px] font-bold uppercase", PRIORITY_STYLES[params.priority] || '')}>
                                  {params.priority}
                                </Badge>
                              )}
                              <span className="text-[10px] text-slate-400 font-medium ml-auto">
                                {timeAgo(req.requestedAt)}
                              </span>
                            </div>

                            <h3 className="text-lg font-bold text-slate-900 mb-1">
                              {params.title || req.intent}
                            </h3>
                            <p className="text-sm text-slate-500 mb-3 line-clamp-2">
                              {params.description || req.originalMessage}
                            </p>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 font-medium">
                              {params.ruleName && <span>Regla: {params.ruleName}</span>}
                              {params.requiredRole && (
                                <span className="flex items-center gap-1">
                                  <UserCheck className="w-3 h-3" />
                                  Requiere: {params.requiredRole}
                                </span>
                              )}
                              {params.amount && (
                                <span className="flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" />
                                  {params.amount?.toLocaleString()} {params.currency || 'EUR'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          {isPending && (
                            <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 w-full sm:w-auto">
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold text-xs h-10 px-5"
                                onClick={() => { setSelectedRequest(req); setDialogMode('reject'); setActionNote(''); }}
                              >
                                <XCircle className="w-4 h-4 mr-1.5" />
                                Rechazar
                              </Button>
                              <Button
                                size="sm"
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-10 px-5 shadow-sm"
                                onClick={() => handleQuickApprove(req.id)}
                                disabled={processingAction !== null}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                Aprobar
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </TabsContent>

        {/* ═══ HISTORY TAB ═══ */}
        <TabsContent value="history" className="mt-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500 font-medium">No hay historial de aprobaciones</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req, i) => {
                const params = req.params || {};
                const meta = getCategoryMeta(params.category);
                const Icon = meta.icon;
                const isApproved = req.status === 'approved';

                return (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-start gap-4 p-5 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-xl ${isApproved ? 'bg-emerald-50' : 'bg-rose-50'} flex items-center justify-center flex-shrink-0`}>
                      {isApproved ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-slate-900">{params.title || req.intent}</span>
                        <Badge variant="outline" className={cn("rounded-full px-2.5 text-[10px] font-bold", isApproved ? "border-emerald-200 text-emerald-600" : "border-rose-200 text-rose-600")}>
                          {isApproved ? 'Aprobado' : 'Rechazado'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">{params.description}</p>
                      {req.approverNote && (
                        <p className="text-xs text-slate-400 italic mt-1">"{req.approverNote}"</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatDate(req.resolvedAt || req.requestedAt)}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("rounded-full text-[10px] font-bold", meta.color)}>
                      <Icon className="w-3 h-3 mr-1" />
                      {meta.label}
                    </Badge>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ RULES TAB ═══ */}
        <TabsContent value="rules" className="mt-0">
          <div className="grid md:grid-cols-2 gap-4">
            {rules.map((rule, i) => {
              const meta = getCategoryMeta(rule.category);
              const Icon = meta.icon;
              return (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="p-6 bg-white border border-slate-100 rounded-2xl hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl ${meta.color.split(' ').slice(1).join(' ')} border flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-6 h-6 ${meta.color.split(' ')[0]}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-900">{rule.name}</h3>
                        <Badge className={cn("rounded-full px-2.5 text-[10px] font-bold", PRIORITY_STYLES[rule.priority] || '')}>
                          {rule.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 mb-3">{rule.description}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="rounded-full text-[10px] font-bold border-slate-200 text-slate-600">
                          {rule.condition}
                        </Badge>
                        <Badge variant="outline" className="rounded-full text-[10px] font-bold border-blue-200 text-blue-600">
                          <UserCheck className="w-3 h-3 mr-1" />
                          {rule.requiredRole}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Reject Dialog ───────────────────────────────── */}
      <Dialog open={dialogMode === 'reject'} onOpenChange={(open) => { if (!open) { setDialogMode(null); setSelectedRequest(null); } }}>
        {selectedRequest && dialogMode === 'reject' && (
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-500" />
                Rechazar Solicitud
              </DialogTitle>
              <DialogDescription>
                <span className="font-bold">{selectedRequest.params?.title}</span>
                <br />
                {selectedRequest.params?.description}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex gap-4 text-sm">
                <span className="text-slate-500">Categoría:</span>
                <span className="font-bold">{getCategoryMeta(selectedRequest.params?.category).label}</span>
                <span className="text-slate-500 ml-auto">Prioridad:</span>
                <Badge className={cn("rounded-full text-[10px] font-bold", PRIORITY_STYLES[selectedRequest.params?.priority] || '')}>
                  {selectedRequest.params?.priority}
                </Badge>
              </div>

              <Textarea
                placeholder="Motivo del rechazo (requerido)..."
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                className="rounded-xl min-h-[100px] border-slate-200"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setDialogMode(null); setSelectedRequest(null); }} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                onClick={() => handleAction('reject')}
                disabled={processingAction !== null}
                className="rounded-xl font-bold bg-rose-600 hover:bg-rose-500"
              >
                {processingAction === 'reject' ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <XCircle className="w-4 h-4 mr-1.5" />
                )}
                Rechazar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}


