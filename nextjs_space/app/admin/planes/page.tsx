'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Users, Zap, Mail, Database, TrendingUp, DollarSign, CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Edit, RefreshCcw, LayoutGrid, Check, X, ChevronUp, ChevronDown } from 'lucide-react';
import { ALL_MODULES, type CrmModule } from '@/lib/plans';

interface Plan {
  id: string;
  dbId: string;
  nombre: string;
  precio: number;
  moneda: string;
  intervalo: string;
  stripePriceId: string;
  limites: {
    leads: number;
    users: number;
    storage_gb: number;
    courses: number;
    students: number;
    emails_per_month?: number;
    automation_runs?: number;
    whatsapp_messages?: number;
    sms_messages?: number;
  };
  features: string[];
  modules: string[];
  activo: boolean;
  esPublico: boolean;
  esPopular: boolean;
  _count: {
    subscriptions: number;
  };
  mrr: number;
}

export default function PlansManagement() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/plans');
      if (res.ok) {
        const data = await res.json();
        setPlans(data);
      } else {
        toast.error('Error al cargar planes');
      }
    } catch (error) {
      console.error('Error loading plans:', error);
      toast.error('Error al cargar planes');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    const newPlan: Plan = {
      id: '',
      dbId: '',
      nombre: 'Nuevo Plan',
      precio: 0,
      moneda: 'MXN',
      intervalo: 'mensual',
      stripePriceId: '',
      limites: {
        leads: 1000,
        users: 5,
        storage_gb: 10,
        courses: 5,
        students: 100
      },
      features: [],
      modules: ['crm', 'whatsapp'],
      activo: true,
      esPublico: true,
      esPopular: false,
      _count: { subscriptions: 0 },
      mrr: 0
    };
    setEditingPlan(newPlan);
    setIsCreating(true);
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    // 1. Validación local preventiva
    if (!editingPlan.nombre.trim()) {
      toast.error("El nombre del plan no puede estar vacío");
      return;
    }
    
    if (editingPlan.precio < 0) {
      toast.error("El precio no puede ser negativo");
      return;
    }

    setSaving(true);
    try {
      const isNew = !editingPlan.dbId;
      const url = isNew ? '/api/admin/plans' : `/api/admin/plans/${editingPlan.dbId}`;
      const method = isNew ? 'POST' : 'PUT';

      console.log(`[AdminUI] Enviando ${method} a ${url}...`);

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: editingPlan.nombre,
          precio: Number(editingPlan.precio),
          moneda: editingPlan.moneda,
          intervalo: editingPlan.intervalo,
          limiteUsuarios: Number(editingPlan.limites.users),
          limiteLeads: Number(editingPlan.limites.leads),
          limiteStorage: Number(editingPlan.limites.storage_gb),
          limiteCursos: Number(editingPlan.limites.courses),
          limiteEstudiantes: Number(editingPlan.limites.students),
          stripePriceId: editingPlan.stripePriceId,
          activo: editingPlan.activo,
          esPublico: editingPlan.esPublico,
          esPopular: editingPlan.esPopular,
          ui_features: editingPlan.features,
          modules: editingPlan.modules
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(isNew ? 'Plan creado correctamente' : 'Plan actualizado correctamente');
        setEditingPlan(null);
        setIsCreating(false);
        loadPlans();
      } else {
        console.error('[AdminUI] Error del servidor:', data);
        toast.error(data.error || `Error al ${isNew ? 'crear' : 'actualizar'} plan`);
      }
    } catch (error) {
      console.error('[AdminUI] Error de Red:', error);
      toast.error('Error de red al actualizar plan. Revisa la consola.');
    } finally {
      setSaving(false);
    }
  };

  const formatLimit = (limit: number) => {
    if (limit === -1) return '∞ Ilimitado';
    return limit.toLocaleString();
  };

  const totalMRR = plans.reduce((sum, plan) => sum + plan.mrr, 0);
  const totalSubscriptions = plans.reduce((sum, plan) => sum + plan._count.subscriptions, 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <RefreshCcw className="animate-spin text-indigo-600 w-10 h-10" />
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Planes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <CreditCard className="text-indigo-600" />
            Gestión de Planes
          </h1>
          <p className="text-gray-500 mt-1">Configura niveles de servicio, límites y precios del ecosistema.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPlans} className="rounded-xl font-bold">
            <RefreshCcw size={16} className="mr-2" />
            Refrescar
          </Button>
          <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100">
            <Zap size={16} className="mr-2" />
            Nuevo Plan
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" className="rounded-xl font-bold">
                <Info size={16} className="mr-2" />
                Información
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>Sistema de Planes Dinámicos</DialogTitle>
                <DialogDescription>
                  Los planes ahora son dinámicos. Puedes modificar límites y características sin cambiar el código.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-amber-800">
                  <p className="font-bold flex items-center gap-2 mb-1">
                    <Info size={16} />
                    Nota sobre Stripe
                  </p>
                  <p className="text-xs">
                    Para cambiar el cobro real, crea un nuevo "Price" en Stripe y pega el ID en la configuración del plan. Los límites internos se aplicarán instantáneamente tras guardar.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold text-gray-900">Variables Globales:</h4>
                  <div className="grid grid-cols-1 gap-1 font-mono text-[10px]">
                    <span className="p-1 px-2 bg-slate-100 rounded">STRIPE_STARTER: {plans.find(p => p.id === 'starter')?.stripePriceId}</span>
                    <span className="p-1 px-2 bg-slate-100 rounded">STRIPE_GROWTH: {plans.find(p => p.id === 'growth')?.stripePriceId}</span>
                    <span className="p-1 px-2 bg-slate-100 rounded">STRIPE_PRO: {plans.find(p => p.id === 'pro')?.stripePriceId}</span>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-lg rounded-3xl bg-white overflow-hidden group">
          <div className="h-1 bg-green-500" />
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
              MRR Total
              <DollarSign className="w-4 h-4 text-green-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-gray-900">€{totalMRR.toLocaleString()}</div>
            <p className="text-xs font-medium text-gray-400 mt-1">Ingresos recurrentes activos</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg rounded-3xl bg-white overflow-hidden">
          <div className="h-1 bg-indigo-500" />
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
              Suscripciones
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-gray-900">{totalSubscriptions}</div>
            <p className="text-xs font-medium text-gray-400 mt-1">Tenants activos en plataforma</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg rounded-3xl bg-white overflow-hidden">
          <div className="h-1 bg-amber-500" />
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
              Diversificación
              <Zap className="w-4 h-4 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-gray-900">{plans.length}</div>
            <p className="text-xs font-medium text-gray-400 mt-1">Niveles de servicio disponibles</p>
          </CardContent>
        </Card>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <Card key={plan.id} className="border-none shadow-xl rounded-3xl overflow-hidden hover:scale-[1.02] transition-all bg-white group ring-1 ring-gray-100">
            <div className={`h-2 ${plan.id === 'pro' ? 'bg-indigo-600' : 'bg-gray-200'}`} />
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between mb-4">
                <Badge className={`rounded-xl px-3 py-1 font-bold text-[10px] uppercase tracking-wider ${
                   plan.id === 'pro' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {plan.nombre}
                </Badge>
                <div className="flex gap-2 items-center">
                   {plan.esPopular && <Badge className="bg-amber-100 text-amber-700 border-amber-200 rounded-xl font-bold text-[10px]">Populares</Badge>}
                   {!plan.activo && <Badge variant="destructive" className="rounded-xl">Inactivo</Badge>}
                   <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-full hover:bg-indigo-50 text-indigo-600"
                     onClick={() => {
                        setEditingPlan(plan);
                        setIsCreating(false);
                      }}
                    >
                     <Edit size={18} />
                   </Button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-gray-900">€{plan.precio}</span>
                  <span className="text-sm font-bold text-gray-400">/{plan.intervalo}</span>
                </div>
                <p className="text-xs font-bold text-gray-500 flex items-center gap-1">
                  <Users size={12} className="text-indigo-400" />
                  {plan._count.subscriptions} usuarios activos
                </p>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-0">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  Performance & Límites
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl">
                    <span className="text-xs font-bold text-gray-600 flex items-center gap-2">
                      <Users size={14} className="text-blue-500" />
                      Usuarios Max.
                    </span>
                    <span className="text-xs font-black text-gray-900">{formatLimit(plan.limites.users)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl">
                    <span className="text-xs font-bold text-gray-600 flex items-center gap-2">
                      <Zap size={14} className="text-orange-500" />
                      Leads Mensuales
                    </span>
                    <span className="text-xs font-black text-gray-900">{formatLimit(plan.limites.leads)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl">
                    <span className="text-xs font-bold text-gray-600 flex items-center gap-2">
                      <Database size={14} className="text-purple-500" />
                      Almacenamiento
                    </span>
                    <span className="text-xs font-black text-gray-900">{formatLimit(plan.limites.storage_gb)} GB</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                 <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Características Destacadas</h4>
                 <ul className="space-y-2">
                    {plan.features.slice(0, 5).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {f}
                      </li>
                    ))}
                 </ul>
              </div>

              <div className="pt-4 border-t border-gray-50">
                <div className="flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">Stripe Price ID</span>
                      <span className="text-[10px] font-mono text-gray-400 truncate max-w-[150px]">{plan.stripePriceId || 'N/A'}</span>
                   </div>
                   {plan.esPublico ? (
                     <Badge variant="outline" className="text-[9px] font-bold border-green-100 text-green-600 bg-green-50">Público</Badge>
                   ) : (
                     <Badge variant="outline" className="text-[9px] font-bold border-slate-100 text-slate-400 bg-slate-50">Privado</Badge>
                   )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit/Create Plan Modal */}
      <Dialog open={!!editingPlan} onOpenChange={(open) => {
        if (!open) {
          setEditingPlan(null);
          setIsCreating(false);
        }
      }}>
        <DialogContent className="max-w-2xl rounded-3xl p-8 border-none shadow-2xl bg-white overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-gray-900 flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-xl">
                 {isCreating ? <Zap className="w-6 h-6 text-indigo-600" /> : <Edit className="w-6 h-6 text-indigo-600" />}
              </div>
              {isCreating ? 'Crear Nuevo Plan' : `Editar Plan: ${editingPlan?.nombre}`}
            </DialogTitle>
            <DialogDescription className="font-medium text-gray-500">
              {isCreating 
                ? 'Configura un nuevo nivel de servicio para el ecosistema.' 
                : 'Modifica los parámetros de este nivel de servicio. Los cambios afectarán a todos los clientes actuales y nuevos bajo este plan.'}
            </DialogDescription>
          </DialogHeader>

          {editingPlan && (
            <form onSubmit={handleUpdatePlan} className="space-y-8 mt-6">
              {/* Sección Generales */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase text-gray-400">Nombre del Plan</Label>
                  <Input 
                    value={editingPlan.nombre} 
                    onChange={e => setEditingPlan({...editingPlan, nombre: e.target.value})}
                    className="rounded-xl border-gray-100 bg-slate-50 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase text-gray-400">Precio Mensual (€)</Label>
                  <Input 
                    type="number"
                    value={editingPlan.precio} 
                    onChange={e => setEditingPlan({...editingPlan, precio: Number(e.target.value)})}
                    className="rounded-xl border-gray-100 bg-slate-50 font-bold"
                  />
                </div>
              </div>

              {/* Sección Límites */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-indigo-600 flex items-center gap-2">
                  <Zap size={16} />
                  Límites y Capacidades
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-gray-500">Usuarios Max.</Label>
                    <Input 
                      type="number"
                      value={editingPlan.limites.users} 
                      onChange={e => setEditingPlan({...editingPlan, limites: {...editingPlan.limites, users: Number(e.target.value)}})}
                      className="rounded-xl font-bold"
                    />
                    <p className="text-[9px] text-gray-400">-1 para ilimitado</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-gray-500">Leads Totales</Label>
                    <Input 
                      type="number"
                      value={editingPlan.limites.leads} 
                      onChange={e => setEditingPlan({...editingPlan, limites: {...editingPlan.limites, leads: Number(e.target.value)}})}
                      className="rounded-xl font-bold"
                    />
                    <p className="text-[9px] text-gray-400">-1 para ilimitado</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-gray-500">Storage (GB)</Label>
                    <Input 
                      type="number"
                      value={editingPlan.limites.storage_gb} 
                      onChange={e => setEditingPlan({...editingPlan, limites: {...editingPlan.limites, storage_gb: Number(e.target.value)}})}
                      className="rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-gray-500">Cursos</Label>
                    <Input 
                      type="number"
                      value={editingPlan.limites.courses} 
                      onChange={e => setEditingPlan({...editingPlan, limites: {...editingPlan.limites, courses: Number(e.target.value)}})}
                      className="rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-gray-500">Estudiantes</Label>
                    <Input 
                      type="number"
                      value={editingPlan.limites.students} 
                      onChange={e => setEditingPlan({...editingPlan, limites: {...editingPlan.limites, students: Number(e.target.value)}})}
                      className="rounded-xl font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Selección de Módulos (NUEVO) */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-indigo-600 flex items-center gap-2">
                    <LayoutGrid size={16} />
                    Módulos y Funciones Incluidas
                  </h4>
                  <Badge variant="outline" className="text-[10px] bg-indigo-50 border-indigo-100 text-indigo-600">
                    {editingPlan.modules.length} Activos
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  {/* Agrupar módulos por categoría */}
                  {Array.from(new Set(ALL_MODULES.map(m => m.group))).map(group => (
                    <div key={group} className="space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <Label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                          {group}
                        </Label>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 text-[9px] font-bold text-indigo-400 hover:text-indigo-600"
                          onClick={() => {
                            const groupModules = ALL_MODULES.filter(m => m.group === group).map(m => m.id);
                            const allActive = groupModules.every(id => editingPlan.modules.includes(id as any));
                            
                            let newModules;
                            if (allActive) {
                              // Desactivar todos del grupo
                              newModules = editingPlan.modules.filter(id => !groupModules.includes(id as any));
                            } else {
                              // Activar todos del grupo
                              newModules = [...new Set([...editingPlan.modules, ...groupModules])];
                            }
                            setEditingPlan({ ...editingPlan, modules: newModules });
                          }}
                        >
                          Selección Masiva
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {ALL_MODULES.filter(m => m.group === group).map(module => {
                          const isActive = editingPlan.modules.includes(module.id as any);
                          return (
                            <div 
                              key={module.id} 
                              onClick={() => {
                                const newModules = isActive 
                                  ? editingPlan.modules.filter(id => id !== module.id)
                                  : [...editingPlan.modules, module.id];
                                setEditingPlan({ ...editingPlan, modules: newModules });
                              }}
                              className={`
                                cursor-pointer flex items-start gap-3 p-3 rounded-2xl border transition-all
                                ${isActive ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border-gray-100 hover:border-indigo-100'}
                              `}
                            >
                              <div className={`
                                w-8 h-8 rounded-xl flex items-center justify-center text-lg shadow-sm
                                ${isActive ? 'bg-white' : 'bg-slate-50'}
                              `}>
                                {module.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold truncate ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                                  {module.label}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight line-clamp-1">
                                  {module.description}
                                </p>
                              </div>
                              <div className={`
                                w-4 h-4 rounded-full flex items-center justify-center transition-all
                                ${isActive ? 'bg-indigo-600 scale-110' : 'bg-gray-100'}
                              `}>
                                {isActive ? <Check size={10} className="text-white" /> : <X size={8} className="text-gray-300" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stripe Config */}
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                   <div className="p-1.5 bg-indigo-600 rounded-lg">
                      <CreditCard className="w-3.5 h-3.5 text-white" />
                   </div>
                   <h4 className="text-sm font-bold text-gray-900">Configuración Stripe</h4>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-gray-400">Stripe Price ID</Label>
                  <Input 
                    value={editingPlan.stripePriceId} 
                    onChange={e => setEditingPlan({...editingPlan, stripePriceId: e.target.value})}
                    placeholder="price_..."
                    className="rounded-xl font-mono text-sm bg-white border-gray-200"
                  />
                  <p className="text-[9px] text-gray-400">Este ID vincula el plan con el cobro real en Stripe para nuevas suscripciones.</p>
                </div>
              </div>

              {/* Editor de Funciones (Bullet Points) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-indigo-600 flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    Ventajas y Características (Bullet Points)
                  </h4>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-[10px] font-bold rounded-lg"
                    onClick={() => {
                      const newFeatures = [...editingPlan.features, 'Nueva característica'];
                      setEditingPlan({ ...editingPlan, features: newFeatures });
                    }}
                  >
                    + Añadir Viñeta
                  </Button>
                </div>
                <div className="space-y-2">
                  {editingPlan.features.map((feature, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <div className="flex flex-col gap-0.5">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-4 w-7 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30"
                          disabled={idx === 0}
                          onClick={() => {
                            const newFeatures = [...editingPlan.features];
                            [newFeatures[idx], newFeatures[idx - 1]] = [newFeatures[idx - 1], newFeatures[idx]];
                            setEditingPlan({ ...editingPlan, features: newFeatures });
                          }}
                        >
                          <ChevronUp size={12} />
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-4 w-7 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30"
                          disabled={idx === editingPlan.features.length - 1}
                          onClick={() => {
                            const newFeatures = [...editingPlan.features];
                            [newFeatures[idx], newFeatures[idx + 1]] = [newFeatures[idx + 1], newFeatures[idx]];
                            setEditingPlan({ ...editingPlan, features: newFeatures });
                          }}
                        >
                          <ChevronDown size={12} />
                        </Button>
                      </div>
                      <Input 
                        value={feature} 
                        onChange={(e) => {
                          const newFeatures = [...editingPlan.features];
                          newFeatures[idx] = e.target.value;
                          setEditingPlan({ ...editingPlan, features: newFeatures });
                        }}
                        className="rounded-xl border-gray-100 bg-slate-50 text-xs font-medium h-9 flex-1"
                        placeholder="Ej: Acceso a API Premium"
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => {
                          const newFeatures = editingPlan.features.filter((_, i) => i !== idx);
                          setEditingPlan({ ...editingPlan, features: newFeatures });
                        }}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                  {editingPlan.features.length === 0 && (
                    <p className="text-[10px] text-gray-400 italic text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      No hay viñetas personalizadas. Se usarán las automáticas por defecto.
                    </p>
                  )}
                </div>
              </div>

              {/* Switches */}
              <div className="flex flex-wrap gap-8 items-center pt-2">
                 <div className="flex items-center gap-3">
                    <Switch 
                      checked={editingPlan.activo} 
                      onCheckedChange={checked => setEditingPlan({...editingPlan, activo: checked})}
                    />
                    <div className="flex flex-col">
                       <span className="text-xs font-bold text-gray-900">Plan Activo</span>
                       <span className="text-[10px] text-gray-400">Permitir suscripciones nuevas</span>
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                    <Switch 
                      checked={editingPlan.esPublico} 
                      onCheckedChange={checked => setEditingPlan({...editingPlan, esPublico: checked})}
                    />
                    <div className="flex flex-col">
                       <span className="text-xs font-bold text-gray-900">Visible en Landing</span>
                       <span className="text-[10px] text-gray-400">Mostrar en tabla de precios</span>
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                    <Switch 
                      checked={editingPlan.esPopular} 
                      onCheckedChange={checked => setEditingPlan({...editingPlan, esPopular: checked})}
                    />
                    <div className="flex flex-col">
                       <span className="text-xs font-bold text-gray-900 border-b-2 border-amber-200">Plan Más Popular</span>
                       <span className="text-[10px] text-gray-400">Destacar visualmente (Badge)</span>
                    </div>
                 </div>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setEditingPlan(null)}
                  className="rounded-xl font-bold px-6"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-10 shadow-lg shadow-indigo-200"
                >
                  {saving ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isCreating ? 'Crear Plan' : 'Guardar Cambios'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}