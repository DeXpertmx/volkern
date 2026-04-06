
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
  User
} from 'lucide-react';
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
}

export default function TenantsManagement() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Tenants</h1>
          <p className="text-gray-500 mt-1">Administra todos los clientes white-label</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus size={16} className="mr-2" />
          Crear Tenant
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <Input
                  placeholder="Buscar por nombre, slug o dominio..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="suspendido">Suspendido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los planes</SelectItem>
                <SelectItem value="starter">🟢 Starter</SelectItem>
                <SelectItem value="growth">🔵 Growth</SelectItem>
                <SelectItem value="pro">🟣 Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tenants List */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : tenants.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No se encontraron tenants</p>
            </CardContent>
          </Card>
        ) : (
          tenants.map((tenant) => (
            <Card key={tenant.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{tenant.nombre}</h3>
                      {getStatusBadge(tenant.estado)}
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {tenant.plan}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <p className="text-sm text-gray-500">Slug</p>
                        <p className="font-medium">{tenant.slug}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">MRR</p>
                        <p className="font-medium">
                          ${tenant.mrr.toLocaleString()} {tenant.moneda}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Usuarios</p>
                        <p className="font-medium">{tenant._count.users}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Leads</p>
                        <p className="font-medium">{tenant._count.leads}</p>
                      </div>
                    </div>
                    {tenant.dominio && (
                      <p className="text-sm text-gray-500 mt-2">
                        Dominio: <span className="text-blue-600">{tenant.dominio}</span>
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      Creado: {new Date(tenant.fechaCreacion).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/admin/tenants/${tenant.id}`)}>
                        <Eye size={16} className="mr-2" />
                        Ver Detalles
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleImpersonate(tenant.id)}
                        className="text-amber-600 focus:text-amber-700 focus:bg-amber-50"
                      >
                        <User size={16} className="mr-2" />
                        Suplantar Tenant
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOperation(tenant.id, 'extend_trial', { days: 14 })}>
                        <Calendar size={16} className="mr-2" />
                        Extender Trial
                      </DropdownMenuItem>
                      {tenant.estado === 'activo' || tenant.estado === 'trial' ? (
                        <DropdownMenuItem onClick={() => handleOperation(tenant.id, 'suspend')}>
                          <Pause size={16} className="mr-2" />
                          Suspender
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handleOperation(tenant.id, 'reactivate')}>
                          <Play size={16} className="mr-2" />
                          Reactivar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                <Select name="plan" defaultValue="starter">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">🟢 Starter - €49/mes</SelectItem>
                    <SelectItem value="growth">🔵 Growth - €99/mes</SelectItem>
                    <SelectItem value="pro">🟣 Pro - €199/mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="estado">Estado</Label>
                <Select name="estado" defaultValue="trial">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="activo">Activo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="moneda">Moneda</Label>
                <Select name="moneda" defaultValue="EUR">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MXN">MXN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="COP">COP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="trialDays">Días de Trial</Label>
                <Input id="trialDays" name="trialDays" type="number" defaultValue="14" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Tenant</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
