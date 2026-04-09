
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Users,
  Target,
  BookOpen,
  GraduationCap,
  Calendar,
  DollarSign,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  Gift
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function TenantDetail() {
  const router = useRouter();
  const params = useParams();
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAssignPlanDialog, setShowAssignPlanDialog] = useState(false);
  const [assignPlanForm, setAssignPlanForm] = useState({
    planId: 'starter',
    withBilling: false,
    mrr: 0,
    reason: ''
  });
  const [assigningPlan, setAssigningPlan] = useState(false);
  const [modulesData, setModulesData] = useState<any>(null);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);

  useEffect(() => {
    if (params?.id) {
      loadTenant();
    }
  }, [params?.id]);

  const loadTenant = async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${params?.id}`);
      if (res.ok) {
        const data = await res.json();
        setTenant(data);
      } else {
        toast.error('Tenant no encontrado');
        router.push('/admin/tenants');
      }
    } catch (error) {
      console.error('Error loading tenant:', error);
      toast.error('Error al cargar tenant');
    } finally {
      setLoading(false);
    }
  };

  const loadModules = async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${params?.id}/modules`);
      if (res.ok) {
        const data = await res.json();
        setModulesData(data);
      }
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  };

  useEffect(() => {
    if (params?.id && tenant) {
      loadModules();
    }
  }, [params?.id, tenant]);

  const handleToggleModule = async (moduleId: string, currentActive: boolean) => {
    setTogglingModule(moduleId);
    try {
      const res = await fetch(`/api/admin/tenants/${params?.id}/modules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, habilitado: !currentActive })
      });
      if (res.ok) {
        toast.success(`Módulo ${!currentActive ? 'activado' : 'desactivado'}`);
        loadModules();
      } else {
        toast.error('Error al actualizar módulo');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setTogglingModule(null);
    }
  };

  const handleChangePlan = async (newPlan: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${params?.id}/modules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan })
      });
      if (res.ok) {
        toast.success(`Plan cambiado a ${newPlan}`);
        loadTenant();
        loadModules();
      } else {
        toast.error('Error al cambiar plan');
      }
    } catch {
      toast.error('Error de conexión');
    }
  };

  const handleAssignPlan = async () => {
    try {
      setAssigningPlan(true);
      
      const res = await fetch(`/api/admin/tenants/${params?.id}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'assign_plan',
          params: assignPlanForm
        })
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        setShowAssignPlanDialog(false);
        loadTenant(); // Reload tenant data
        
        // Reset form
        setAssignPlanForm({
          planId: 'starter',
          withBilling: false,
          mrr: 0,
          reason: ''
        });
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al asignar plan');
      }
    } catch (error) {
      console.error('Error assigning plan:', error);
      toast.error('Error al asignar plan');
    } finally {
      setAssigningPlan(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!tenant) {
    return <div>Tenant no encontrado</div>;
  }

  const getStatusBadge = (estado: string) => {
    const badges: Record<string, { color: string; icon: any; label: string }> = {
      activo: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Activo' },
      trial: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Trial' },
      suspendido: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Suspendido' },
      cancelado: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Cancelado' }
    };

    const badge = badges[estado] || badges.activo;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        <Icon size={14} />
        {badge.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft size={16} className="mr-2" />
          Volver
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{tenant.nombre}</h1>
              {getStatusBadge(tenant.estado)}
              <Badge variant="outline">{tenant.plan}</Badge>
            </div>
            <p className="text-gray-500 mt-1">{tenant.slug}</p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Usuarios</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{tenant._count.users}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <Users className="text-blue-600" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Leads</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{tenant._count.leads}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <Target className="text-green-600" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Cursos</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{tenant._count.cursos}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <BookOpen className="text-purple-600" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">MRR</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  ${tenant.mrr.toLocaleString()}
                </p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <DollarSign className="text-orange-600" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Information */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="plans">Planes y Facturación</TabsTrigger>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="subscriptions">Suscripciones</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Información del Tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-500">Nombre</p>
                  <p className="text-base font-medium mt-1">{tenant.nombre}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Slug</p>
                  <p className="text-base font-medium mt-1">{tenant.slug}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Dominio</p>
                  <p className="text-base font-medium mt-1">{tenant.dominio || 'No configurado'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Email de Facturación</p>
                  <p className="text-base font-medium mt-1">{tenant.billingEmail || 'No configurado'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Moneda</p>
                  <p className="text-base font-medium mt-1">{tenant.moneda}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">MRR</p>
                  <p className="text-base font-medium mt-1">{tenant.mrr.toLocaleString()}€</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Fecha de Creación</p>
                  <p className="text-base font-medium mt-1">
                    {new Date(tenant.fechaCreacion).toLocaleDateString('es-MX')}
                  </p>
                </div>
                {tenant.fechaTrialFin && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Trial Expira</p>
                    <p className="text-base font-medium mt-1">
                      {new Date(tenant.fechaTrialFin).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans">
          <div className="space-y-6">
            {/* Current Plan */}
            <Card>
              <CardHeader>
                <CardTitle>Plan Actual</CardTitle>
                <CardDescription>
                  Gestiona el plan y la facturación del tenant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Plan</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-lg font-bold capitalize">{tenant.plan}</p>
                      {(tenant.configuracion as any)?.cortesia && (
                        <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                          <Gift size={12} className="mr-1" />
                          Cortesía
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Estado</p>
                    <p className="text-lg font-bold mt-1">{getStatusBadge(tenant.estado)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">MRR</p>
                    <p className="text-lg font-bold mt-1">
                      {tenant.mrr.toLocaleString()}€
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {tenant.stripeCustomerId ? 'Stripe Customer' : 'Sin Stripe'}
                    </p>
                    <p className="text-sm font-medium mt-1">
                      {tenant.stripeCustomerId ? (
                        <Badge variant="default">
                          <CreditCard size={12} className="mr-1" />
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No conectado</Badge>
                      )}
                    </p>
                  </div>
                </div>

                {(tenant.configuracion as any)?.cortesia && (
                  <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-sm font-medium text-purple-900 mb-1">Plan de Cortesía</p>
                    <p className="text-sm text-purple-700">
                      Razón: {(tenant.configuracion as any)?.cortesiaReason}
                    </p>
                    <p className="text-xs text-purple-600 mt-1">
                      Asignado: {new Date((tenant.configuracion as any)?.cortesiaAssignedAt).toLocaleString('es-MX')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assign New Plan */}
            <Card>
              <CardHeader>
                <CardTitle>Asignar Nuevo Plan</CardTitle>
                <CardDescription>
                  Cambia el plan del tenant con o sin facturación
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-3">
                      <CreditCard className="text-blue-600 mt-1" size={20} />
                      <div>
                        <p className="font-medium text-blue-900">Con Facturación (Stripe)</p>
                        <p className="text-sm text-blue-700 mt-1">
                          Crea o actualiza una suscripción en Stripe. El tenant será cobrado mensualmente.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-start gap-3">
                      <Gift className="text-purple-600 mt-1" size={20} />
                      <div>
                        <p className="font-medium text-purple-900">Sin Facturación (Cortesía)</p>
                        <p className="text-sm text-purple-700 mt-1">
                          Asigna el plan manualmente sin crear suscripción. Ideal para demos, VIPs o acuerdos especiales.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={() => setShowAssignPlanDialog(true)}
                    className="w-full"
                    size="lg"
                  >
                    Asignar Plan
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Plan Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Límites del Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Usuarios</p>
                    <p className="text-2xl font-bold mt-1">
                      {tenant.limites?.usuarios === -1 ? '∞' : tenant.limites?.usuarios || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Leads</p>
                    <p className="text-2xl font-bold mt-1">
                      {tenant.limites?.leads === -1 ? '∞' : tenant.limites?.leads || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Emails/mes</p>
                    <p className="text-2xl font-bold mt-1">
                      {tenant.limites?.emails_per_month === -1 ? '∞' : tenant.limites?.emails_per_month || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Storage (GB)</p>
                    <p className="text-2xl font-bold mt-1">
                      {tenant.limites?.storage_gb === -1 ? '∞' : tenant.limites?.storage_gb || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Usuarios ({tenant.users?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tenant.users && tenant.users.length > 0 ? (
                  tenant.users.map((user: any) => (
                    <div key={user.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{user.name || user.email}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={user.estado === 'activo' ? 'default' : 'secondary'}>
                          {user.role?.nombre || 'Sin rol'}
                        </Badge>
                        <p className="text-xs text-gray-500 mt-1">{user.estado}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">No hay usuarios</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Suscripciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tenant.subscriptions && tenant.subscriptions.length > 0 ? (
                  tenant.subscriptions.map((sub: any) => (
                    <div key={sub.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{sub.plan?.nombre || 'Plan Desconocido'}</p>
                        <Badge variant={sub.estado === 'activa' ? 'default' : 'secondary'}>
                          {sub.estado}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Inicio</p>
                          <p>{new Date(sub.fechaInicio).toLocaleDateString('es-MX')}</p>
                        </div>
                        {sub.fechaRenovacion && (
                          <div>
                            <p className="text-gray-500">Renovación</p>
                            <p>{new Date(sub.fechaRenovacion).toLocaleDateString('es-MX')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">No hay suscripciones</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          {modulesData ? (
            <div className="space-y-6">
              {/* Plan actual y cambio rápido */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Plan Actual: <span className="capitalize text-blue-600">{modulesData.plan}</span></span>
                    <div className="flex gap-2">
                      {['starter', 'growth', 'pro'].map(p => (
                        <Button
                          key={p}
                          size="sm"
                          variant={modulesData.plan === p ? 'default' : 'outline'}
                          onClick={() => handleChangePlan(p)}
                          className="capitalize"
                        >
                          {p === 'starter' ? '🟢 Starter — 49€' : p === 'growth' ? '🔵 Growth — 99€' : '🟣 Pro — 199€'}
                        </Button>
                      ))}
                    </div>
                  </CardTitle>
                  <CardDescription>
                    Cambia el plan o activa/desactiva módulos individuales. Los módulos incluidos en el plan están marcados.
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Módulos por grupo */}
              {(() => {
                const groups = new Map<string, any[]>();
                modulesData.modules.forEach((mod: any) => {
                  if (!groups.has(mod.group)) groups.set(mod.group, []);
                  groups.get(mod.group)!.push(mod);
                });

                return Array.from(groups.entries()).map(([group, mods]) => (
                  <Card key={group}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{group}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {mods.map((mod: any) => (
                          <div
                            key={mod.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              mod.active
                                ? 'bg-green-50 border-green-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-lg flex-shrink-0">{mod.icon}</span>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{mod.label}</p>
                                <p className="text-xs text-gray-500 truncate">{mod.description}</p>
                                {mod.status === 'override_on' && (
                                  <Badge variant="outline" className="text-xs mt-1 bg-blue-50 text-blue-700">Add-on / Override</Badge>
                                )}
                                {mod.status === 'override_off' && (
                                  <Badge variant="outline" className="text-xs mt-1 bg-red-50 text-red-700">Desactivado por admin</Badge>
                                )}
                                {mod.razon && <p className="text-xs text-gray-400 mt-0.5">{mod.razon}</p>}
                              </div>
                            </div>
                            <Switch
                              checked={mod.active}
                              disabled={togglingModule === mod.id}
                              onCheckedChange={() => handleToggleModule(mod.id, mod.active)}
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ));
              })()}

              {/* Add-ons */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">💡 Add-ons Disponibles</CardTitle>
                  <CardDescription>Add-ons que puedes activar para este tenant.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {modulesData.addons?.map((addon: any) => (
                      <div key={addon.id} className="p-4 border rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{addon.icon}</span>
                          <p className="font-medium text-sm">{addon.nombre}</p>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{addon.descripcion}</p>
                        <p className="text-sm font-semibold text-blue-600">{addon.precio}€ / {addon.intervalo}</p>
                        {addon.modulosDesbloqueados && (
                          <p className="text-xs text-gray-400 mt-1">
                            Desbloquea: {addon.modulosDesbloqueados.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-gray-500 text-center">Cargando módulos...</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Assign Plan Dialog */}
      <Dialog open={showAssignPlanDialog} onOpenChange={setShowAssignPlanDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Asignar Plan al Tenant</DialogTitle>
            <DialogDescription>
              Selecciona el plan y el tipo de facturación para {tenant?.nombre}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Plan Selection */}
            <div>
              <Label htmlFor="planId">Plan *</Label>
              <Select
                value={assignPlanForm.planId}
                onValueChange={(value) =>
                  setAssignPlanForm({ ...assignPlanForm, planId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">🟢 Starter</span>
                      <span className="text-sm text-gray-500">- €49/mes</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="growth">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">🔵 Growth</span>
                      <span className="text-sm text-gray-500">- €99/mes</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pro">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">🟣 Pro</span>
                      <span className="text-sm text-gray-500">- €199/mes</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Billing Type */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-start gap-3 flex-1">
                  <CreditCard className={`mt-1 ${assignPlanForm.withBilling ? 'text-blue-600' : 'text-gray-400'}`} size={20} />
                  <div>
                    <p className="font-medium">Con Facturación (Stripe)</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Crea o actualiza suscripción en Stripe
                    </p>
                  </div>
                </div>
                <Switch
                  checked={assignPlanForm.withBilling}
                  onCheckedChange={(checked) =>
                    setAssignPlanForm({ ...assignPlanForm, withBilling: checked })
                  }
                />
              </div>

              {!assignPlanForm.withBilling && (
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-start gap-2 mb-3">
                    <Gift className="text-purple-600 mt-0.5" size={18} />
                    <p className="font-medium text-purple-900">Plan de Cortesía</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="mrr" className="text-purple-900">
                        MRR Manual (opcional)
                      </Label>
                      <Input
                        id="mrr"
                        type="number"
                        placeholder="0"
                        value={assignPlanForm.mrr}
                        onChange={(e) =>
                          setAssignPlanForm({
                            ...assignPlanForm,
                            mrr: parseFloat(e.target.value) || 0
                          })
                        }
                        className="mt-1"
                      />
                      <p className="text-xs text-purple-600 mt-1">
                        Para seguimiento interno, no afecta facturación
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              <Label htmlFor="reason">
                Razón de la asignación {!assignPlanForm.withBilling && '*'}
              </Label>
              <Textarea
                id="reason"
                placeholder={
                  assignPlanForm.withBilling
                    ? 'Opcional: Motivo del cambio de plan'
                    : 'Ej: Demo para cliente potencial, Acuerdo VIP, Cliente Beta...'
                }
                value={assignPlanForm.reason}
                onChange={(e) =>
                  setAssignPlanForm({ ...assignPlanForm, reason: e.target.value })
                }
                rows={3}
                className="mt-1"
              />
              {!assignPlanForm.withBilling && (
                <p className="text-xs text-gray-500 mt-1">
                  Requerido para planes de cortesía
                </p>
              )}
            </div>

            {/* Summary */}
            <div className="p-4 bg-gray-50 rounded-lg border">
              <p className="font-medium text-gray-900 mb-2">Resumen</p>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>
                  • Plan: <span className="font-medium capitalize">{assignPlanForm.planId}</span>
                </li>
                <li>
                  • Tipo:{' '}
                  <span className="font-medium">
                    {assignPlanForm.withBilling ? 'Con facturación (Stripe)' : 'Sin facturación (Cortesía)'}
                  </span>
                </li>
                {!assignPlanForm.withBilling && assignPlanForm.mrr > 0 && (
                  <li>
                    • MRR Manual: <span className="font-medium">${assignPlanForm.mrr}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAssignPlanDialog(false)}
              disabled={assigningPlan}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAssignPlan}
              disabled={
                assigningPlan ||
                (!assignPlanForm.withBilling && !assignPlanForm.reason.trim())
              }
            >
              {assigningPlan ? 'Asignando...' : 'Asignar Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
