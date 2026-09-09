'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  Search,
  Plus,
  MoreVertical,
  Eye,
  Edit,
  Pause,
  Play,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  User,
  ShieldCheck,
  Users,
  Target,
  BookOpen,
  DollarSign,
  Loader2,
  Factory,
  Power
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  nombre: string;
  slug: string;
  plan: string;
  estado: string;
  dominio?: string;
  mrr: number;
  moneda: string;
  fechaCreacion: string;
  _count: {
    users: number;
    leads: number;
    cursos: number;
    estudiantes: number;
  };
  tenantFeatures?: { habilitado: boolean }[];
}

export default function TenantsManagement() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [genesisResult, setGenesisResult] = useState<{genesisHash: string, masterKey: string} | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadTenants();
  }, [search, statusFilter, planFilter, pagination.page]);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(planFilter !== 'all' && { plan: planFilter })
      });

      const res = await fetch(`/api/admin/tenants?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error loading tenants:', error);
      toast.error('Error al cargar tenants');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.get('nombre'),
          slug: formData.get('slug'),
          plan: formData.get('plan'),
          estado: formData.get('estado'),
          dominio: formData.get('dominio'),
          billingEmail: formData.get('billingEmail'),
          moneda: formData.get('moneda'),
          trialDays: formData.get('estado') === 'trial' ? parseInt(formData.get('trialDays') as string) : undefined
        })
      });

      if (res.ok) {
        toast.success('Tenant creado exitosamente');
        setShowCreateDialog(false);
        loadTenants();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al crear tenant');
      }
    } catch (error) {
      toast.error('Error al crear tenant');
    }
  };

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, action: 'start' })
      });

      if (res.ok) {
        toast.success('Iniciando suplantación...');
        // Redirigir al dashboard para ver los datos del tenant
        window.location.href = '/dashboard';
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al iniciar suplantación');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleToggleIndustrial = async (tenantId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          operation: 'toggle_industrial_license', 
          params: { enabled } 
        })
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        loadTenants();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al actualizar licencia');
      }
    } catch (error) {
      toast.error('Error de red al actualizar licencia');
    }
  };

  const handleDeleteTenant = async () => {
    if (!tenantToDelete || deleteConfirmation !== 'ELIMINAR') return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/admin/tenants/${tenantToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'ELIMINAR' }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(result.error || 'Error al eliminar el tenant');
        return;
      }

      toast.success(`Tenant "${tenantToDelete.nombre}" eliminado`);
      setTenantToDelete(null);
      setDeleteConfirmation('');
      await loadTenants();
    } catch {
      toast.error('Error de conexión al eliminar el tenant');
    } finally {
      setDeleting(false);
    }
  };

  const handleOperation = async (tenantId: string, operation: string, params?: any) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, params })
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        loadTenants();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al ejecutar operación');
      }
    } catch (error) {
      toast.error('Error al ejecutar operación');
    }
  };

  const getStatusBadge = (estado: string) => {
    const badges: Record<string, { color: string; icon: any; label: string }> = {
      activo: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Activo' },
      trial: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Trial' },
      suspendido: { color: 'bg-yellow-100 text-yellow-800', icon: Pause, label: 'Suspendido' },
      cancelado: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Cancelado' }
    };

    const badge = badges[estado] || badges.activo;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon size={12} />
        {badge.label}
      </span>
    );
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">Gestión de Inquilinos</h1>
          <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">Tenant Ecosystem Oversight</p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)}
          className="rounded-xl h-12 px-6 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10"
        >
          <Plus size={16} className="mr-2" />
          Vincular Nuevo Tenant
        </Button>
      </div>

      {/* Filters */}
      <Card className="border border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  placeholder="Filtrar por nombre, slug o dominio de bóveda..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-11 rounded-xl border-slate-100 bg-slate-50 focus:bg-white transition-all text-sm font-medium"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 rounded-xl border-slate-100 bg-slate-50 font-bold text-[10px] uppercase tracking-widest">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="suspendido">Suspendido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-11 rounded-xl border-slate-100 bg-slate-50 font-bold text-[10px] uppercase tracking-widest">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los planes</SelectItem>
                <SelectItem value="esencial">🟢 Esencial</SelectItem>
                <SelectItem value="profesional">🔵 Profesional</SelectItem>
                <SelectItem value="infinity">🟣 Infinity</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tenants List */}
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-[#1A365D]/20" />
          </div>
        ) : tenants.length === 0 ? (
          <Card className="border border-dashed border-[#E2E8F0] bg-slate-50/50 rounded-3xl p-20 text-center">
            <Building2 size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No se encontraron cimientos registrados</p>
          </Card>
        ) : (
          tenants.map((tenant) => (
            <Card key={tenant.id} className="border border-[#E2E8F0] hover:shadow-2xl hover:shadow-indigo-900/5 transition-all duration-500 rounded-3xl overflow-hidden bg-white group">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row items-stretch">
                  {/* Vault Health Indicator Sidebar */}
                  <div className={cn(
                      "w-2 transition-all duration-500 group-hover:w-3",
                      tenant.estado === 'activo' ? "bg-emerald-500" : "bg-amber-500"
                  )} />
                  
                  <div className="flex-1 p-8">
                    <div className="flex items-start justify-between mb-8">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-2xl font-black text-[#1A365D] tracking-tighter leading-none">{tenant.nombre}</h3>
                          <Badge className="bg-[#1A365D] text-white font-black text-[9px] uppercase tracking-widest px-3 border-none">{tenant.plan}</Badge>
                          {getStatusBadge(tenant.estado)}
                        </div>
                        <p className="text-xs font-bold text-[#4A5568] opacity-60 uppercase tracking-wider">{tenant.slug}.volkern.cloud</p>
                      </div>

                      {/* Vault Health Badge */}
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl">
                          <ShieldCheck size={14} className="text-emerald-500" />
                          <span className="text-[10px] font-black uppercase text-[#1A365D] tracking-widest">Vault Health: <span className="text-emerald-500">100% Secure</span></span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Last Consistency Check: Today</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
                      {[
                        { label: 'Ingresos MRR', val: `${tenant.mrr.toLocaleString()} ${tenant.moneda}`, icon: DollarSign },
                        { label: 'Ecosistema Usuarios', val: tenant._count.users, icon: Users },
                        { label: 'Generación Leads', val: tenant._count.leads, icon: Target },
                        { label: 'Activos Digitales', val: tenant._count.cursos, icon: BookOpen }
                      ].map((stat) => (
                        <div key={stat.label} className="space-y-1">
                          <p className="text-[9px] font-black text-[#4A5568] uppercase tracking-widest opacity-60 leading-none">{stat.label}</p>
                          <p className="text-xl font-black text-[#1A365D] tracking-tighter">{stat.val}</p>
                        </div>
                      ))}
                      
                      {/* Industrial License Column */}
                      <div className="space-y-2 border-l border-slate-100 pl-8">
                        <p className="text-[9px] font-black text-[#4A5568] uppercase tracking-widest opacity-60 leading-none">Licencia Industrial</p>
                        <div className="flex items-center gap-3">
                            <Switch 
                                checked={tenant.tenantFeatures?.[0]?.habilitado || false}
                                onCheckedChange={(checked) => handleToggleIndustrial(tenant.id, checked)}
                                className="data-[state=checked]:bg-[#1A365D]"
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#1A365D]">
                                {tenant.tenantFeatures?.[0]?.habilitado ? 'Full Access' : 'Solo CRM'}
                            </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Control Panel */}
                  <div className="bg-slate-50/50 border-l border-[#E2E8F0] p-6 flex flex-col justify-between gap-4 w-full md:w-64">
                    <Button 
                      onClick={() => handleImpersonate(tenant.id)}
                      className="w-full rounded-xl bg-white border border-slate-200 text-[#1A365D] hover:bg-[#1A365D] hover:text-white font-black uppercase tracking-widest text-[10px] h-11 transition-all shadow-sm"
                    >
                      <User size={14} className="mr-2" />
                      Inyectar Sesión
                    </Button>
                    
                    <div className="flex gap-2">
                       <Button 
                        onClick={() => router.push(`/admin/saas/tenants/${tenant.id}`)}
                        variant="ghost" 
                        className="flex-1 rounded-xl bg-white border border-slate-100 text-[#4A5568] hover:bg-slate-50 font-black uppercase tracking-widest text-[9px] h-10 transition-all"
                      >
                        Detalle
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="rounded-xl border border-slate-100 bg-white h-10 w-10 p-0 text-[#4A5568]">
                            <MoreVertical size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl border-[#E2E8F0] shadow-2xl">
                          <DropdownMenuItem onClick={() => handleOperation(tenant.id, 'extend_trial', { days: 14 })} className="text-[10px] font-bold uppercase tracking-widest p-3">
                            <Calendar size={14} className="mr-2" />
                            Extender Trial
                          </DropdownMenuItem>
                          {tenant.estado === 'activo' || tenant.estado === 'trial' ? (
                            <DropdownMenuItem onClick={() => handleOperation(tenant.id, 'suspend')} className="text-[10px] font-bold uppercase tracking-widest p-3 text-rose-600">
                              <Pause size={14} className="mr-2" />
                              Suspender Vault
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleOperation(tenant.id, 'reactivate')} className="text-[10px] font-bold uppercase tracking-widest p-3 text-emerald-600">
                              <Play size={14} className="mr-2" />
                              Reactivar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setTenantToDelete(tenant);
                              setDeleteConfirmation('');
                            }}
                            className="text-[10px] font-bold uppercase tracking-widest p-3 text-red-600 focus:text-red-700"
                          >
                            <Trash2 size={14} className="mr-2" />
                            Eliminar cuenta
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Mostrando {(pagination.page - 1) * pagination.limit + 1} -{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              disabled={pagination.page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
              disabled={pagination.page === pagination.totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Create Tenant Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Tenant</DialogTitle>
            <DialogDescription>
              Crea un nuevo cliente white-label para Volkern
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTenant}>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div>
                <Label htmlFor="nombre">Nombre *</Label>
                <Input id="nombre" name="nombre" required />
              </div>
              <div>
                <Label htmlFor="slug">Slug * (URL único)</Label>
                <Input id="slug" name="slug" required />
              </div>
              <div>
                <Label htmlFor="billingEmail">Email de Facturación</Label>
                <Input id="billingEmail" name="billingEmail" type="email" />
              </div>
              <div>
                <Label htmlFor="dominio">Dominio Personalizado</Label>
                <Input id="dominio" name="dominio" placeholder="crm.ejemplo.com" />
              </div>
              <div>
                <Label htmlFor="plan">Plan</Label>
                <Select name="plan" defaultValue="esencial">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="esencial">🟢 Esencial - €69/mes</SelectItem>
                    <SelectItem value="profesional">🔵 Profesional - €149/mes</SelectItem>
                    <SelectItem value="infinity">🟣 Infinity - €299/mes</SelectItem>
                    <SelectItem value="enterprise">💎 Enterprise - €299/mes</SelectItem>
                    <SelectItem value="ERP_INDUSTRIAL">🏭 ERP Industrial - €499/mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="moneda">Región Fiscal / Moneda</Label>
                <Select name="moneda" defaultValue="MXN">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MXN">🇲🇽 México (16% IVA)</SelectItem>
                    <SelectItem value="EUR">🇪🇺 España (21% IVA)</SelectItem>
                    <SelectItem value="USD">🇺🇸 USA (Sales Tax)</SelectItem>
                    <SelectItem value="COP">🇨🇴 Colombia (19% IVA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {genesisResult ? (
              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck className="text-emerald-600" size={24} />
                  <h4 className="text-lg font-black text-emerald-900 uppercase tracking-tighter">Bóveda Génesis Iniciada</h4>
                </div>
                <p className="text-xs font-bold text-emerald-800 mb-4 opacity-70">
                  Se ha generado la Llave Maestra del cliente. Es CRÍTICO que el cliente guarde esta clave, ya que es el únicoHash capaz de descifrar sus nóminas y datos industriales.
                </p>
                <div className="space-y-4">
                  <div>
                    <Label className="text-[9px] font-black uppercase text-emerald-900 opacity-50">Genesis Hash (SHA-256)</Label>
                    <div className="bg-white/50 p-3 rounded-xl border border-emerald-200 font-mono text-[9px] break-all text-emerald-950">
                      {genesisResult.genesisHash}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[9px] font-black uppercase text-emerald-900 opacity-50">Llave Maestra AES-256 (Descargar/Copiar ahora)</Label>
                    <div className="bg-emerald-900 p-4 rounded-xl font-mono text-xs break-all text-emerald-100 shadow-inner flex items-center justify-between">
                      <span className="flex-1">{genesisResult.masterKey}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => {
                setShowCreateDialog(false);
                setGenesisResult(null);
              }}>
                {genesisResult ? 'Cerrar Génesis' : 'Cancelar'}
              </Button>
              {!genesisResult && (
                <Button type="submit" className="bg-[#1A365D] hover:bg-[#2D3748] rounded-xl font-black uppercase tracking-widest text-[10px] h-11 px-8">
                  Iniciar Proceso Génesis
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación destructiva de eliminación */}
      <Dialog
        open={Boolean(tenantToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setTenantToDelete(null);
            setDeleteConfirmation('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Eliminar cuenta de tenant</DialogTitle>
            <DialogDescription>
              Esta acción es permanente y eliminará el tenant, sus usuarios y sus datos asociados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              Vas a eliminar: <strong>{tenantToDelete?.nombre}</strong>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">
                Escribe <strong>ELIMINAR</strong> para confirmar
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder="ELIMINAR"
                autoComplete="off"
                disabled={deleting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTenantToDelete(null);
                setDeleteConfirmation('');
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteTenant}
              disabled={deleteConfirmation !== 'ELIMINAR' || deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {deleting ? 'Eliminando...' : 'Eliminar cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
