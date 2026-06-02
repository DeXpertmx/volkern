'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Users,
  Plus,
  TrendingUp,
  Database,
  Calculator,
  Building2,
  Mail,
  ShieldCheck,
  MoreVertical,
  Power,
  PowerOff,
  Trash2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  List,
  Receipt,
  BookOpen,
} from 'lucide-react'
import { motion } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Slot {
  id: string
  nombre: string
  slug: string
  plan: string
  estado: string
  fechaCreacion: string
  enabledModules: string[]
  billingEmail?: string | null
  _count?: {
    leads: number
    users: number
  }
}

interface SlotLimit {
  allowed: boolean
  current: number
  max: number
  message?: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingConfigPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [slotLimit, setSlotLimit] = useState<SlotLimit>({ allowed: false, current: 0, max: 0 })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<{ id: string; action: 'activate' | 'deactivate'; name: string } | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const rawTab = searchParams.get('tab')
  const activeTab = rawTab && ['all', 'accounting', 'agency'].includes(rawTab)
    ? (rawTab as 'all' | 'accounting' | 'agency')
    : 'accounting'

  const setActiveTab = (tab: 'all' | 'accounting' | 'agency') => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'all') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  // ─── Derived data ───────────────────────────────────────────────────────────

  const filteredSlots = activeTab === 'all'
    ? slots
    : slots.filter(s =>
        activeTab === 'accounting'
          ? s.plan === 'accounting-slot'
          : s.plan === 'agency-slot'
      )

  // ─── Fetch slots ────────────────────────────────────────────────────────────

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch('/api/slots')
      if (res.ok) {
        const data = await res.json()
        setSlots(data)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al cargar clientes')
      }
    } catch (error) {
      console.error('Error fetching slots:', error)
      toast.error('Error de conexión al cargar clientes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSlots()
  }, [fetchSlots])

  // ─── Compute stats ─────────────────────────────────────────────────────────

  const totalSlots = slots.length
  const activeSlots = slots.filter(s => s.estado === 'activo').length
  const totalLeads = slots.reduce((acc, s) => acc + (s._count?.leads || 0), 0)
  const totalUsers = slots.reduce((acc, s) => acc + (s._count?.users || 0), 0)
  const usagePercent = slotLimit.max > 0 ? Math.round((totalSlots / slotLimit.max) * 100) : 0

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleActivate = async (slotId: string) => {
    try {
      const res = await fetch(`/api/slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate' }),
      })
      if (res.ok) {
        toast.success('Cliente activado correctamente')
        fetchSlots()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al activar cliente')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handleDeactivate = async (slotId: string) => {
    try {
      const res = await fetch(`/api/slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      })
      if (res.ok) {
        toast.success('Cliente desactivado correctamente')
        fetchSlots()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al desactivar cliente')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handleDelete = async (slotId: string) => {
    try {
      const res = await fetch(`/api/slots/${slotId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Cliente eliminado correctamente')
        setConfirmDelete(null)
        fetchSlots()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al eliminar cliente')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handleImpersonate = async (slotId: string, slotName: string) => {
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: slotId, action: 'start' }),
      })
      if (res.ok) {
        toast.success(`Accediendo al despacho de ${slotName}...`)
        window.location.href = '/dashboard'
      } else {
        toast.error('No se pudo iniciar suplantación')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-8 p-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-56 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-44" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic flex items-center gap-3">
            <Calculator className="h-7 w-7 text-emerald-500" />
            Clientes de Despacho
          </h1>
          <p className="text-muted-foreground">
            Administra las empresas cliente de tu despacho contable. Cada cliente tiene su propio entorno fiscal y contable aislado.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 hover:scale-105 transition-all">
          <Plus className="mr-2 h-4 w-4" /> Nueva Empresa Cliente
        </Button>
      </motion.div>

      {/* ── Stats Cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-emerald-600">
              <Building2 className="h-4 w-4" /> Empresas Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{activeSlots} / {slotLimit.max > 0 ? slotLimit.max : 'N/A'}</div>
            <p className="text-[10px] text-muted-foreground mt-2 uppercase font-bold tracking-widest">
              {usagePercent}% de capacidad usada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" /> Usuarios Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Contactos en todos los clientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-500" /> Movimientos Contables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{totalLeads.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Facturas y apuntes registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-orange-500" /> Bases de Datos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{totalSlots} Activas</div>
            <p className="text-xs text-muted-foreground mt-1">Silos fiscales aislados por cliente</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Filtro por tipo ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'accounting' | 'agency')}>
        <div className="flex items-center justify-between">
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs font-bold uppercase flex items-center gap-1.5">
              <List className="h-3.5 w-3.5" />
              Todos ({slots.length})
            </TabsTrigger>
            <TabsTrigger value="accounting" className="text-xs font-bold uppercase flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Contabilidad ({slots.filter(s => s.plan === 'accounting-slot').length})
            </TabsTrigger>
            <TabsTrigger value="agency" className="text-xs font-bold uppercase flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Agencia ({slots.filter(s => s.plan === 'agency-slot').length})
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="icon" onClick={fetchSlots} className="h-8 w-8">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Slot Table ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-xl font-bold uppercase tracking-tight">
                  {activeTab === 'all' ? 'Empresas Cliente' : activeTab === 'accounting' ? 'Clientes Contabilidad' : 'Clientes Agencia'}
                </CardTitle>
                <CardDescription>
                  {filteredSlots.length === 0
                    ? activeTab === 'all'
                      ? 'Aún no tienes empresas cliente. Crea tu primer cliente para empezar.'
                      : `No hay empresas de tipo ${activeTab === 'accounting' ? 'contabilidad' : 'agencia'}. Cambia de filtro o crea una nueva.`
                    : `${filteredSlots.length} empresa${filteredSlots.length !== 1 ? 's' : ''} cliente registrada${filteredSlots.length !== 1 ? 's' : ''}`}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {filteredSlots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-4 rounded-full bg-accent mb-4">
                    {activeTab === 'agency' ? (
                      <Building2 className="h-10 w-10 text-muted-foreground" />
                    ) : (
                      <Calculator className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                  <h3 className="text-lg font-bold mb-2">
                    {activeTab === 'all'
                      ? 'No tienes empresas cliente'
                      : `No hay empresas de ${activeTab === 'accounting' ? 'contabilidad' : 'agencia'}`}
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-xs mb-6">
                    {activeTab === 'all'
                      ? 'Da de alta una empresa cliente para gestionar su contabilidad, facturación e impuestos de forma aislada.'
                      : `Cambia de filtro o crea una nueva empresa de tipo ${activeTab === 'accounting' ? 'contabilidad' : 'agencia'}.`}
                  </p>
                  <Button onClick={() => setIsCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-500">
                    <Plus className="mr-2 h-4 w-4" /> Crear Empresa
                  </Button>
                </div>
              ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-bold uppercase text-[10px]">Empresa</TableHead>
                      <TableHead className="font-bold uppercase text-[10px]">Estado</TableHead>
                      <TableHead className="font-bold uppercase text-[10px]">Plan</TableHead>
                      <TableHead className="font-bold uppercase text-[10px]">Movimientos</TableHead>
                      <TableHead className="font-bold uppercase text-[10px]">Usuarios</TableHead>
                      <TableHead className="font-bold uppercase text-[10px]">Módulos</TableHead>
                      <TableHead className="text-right font-bold uppercase text-[10px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSlots.map((slot) => (
                      <TableRow key={slot.id} className="hover:bg-accent/5 transition-colors">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm tracking-tight">{slot.nombre}</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-mono">
                              {slot.slug}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={slot.estado === 'activo' ? 'success' : slot.estado === 'inactivo' ? 'secondary' : 'destructive'}
                            className="uppercase text-[9px] font-black"
                          >
                            {slot.estado === 'activo' ? 'Activo' : slot.estado === 'inactivo' ? 'Inactivo' : 'Eliminado'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          <Badge variant="outline" className="text-[9px] font-bold uppercase">
                            {slot.plan?.replace('-', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{slot._count?.leads || 0}</TableCell>
                        <TableCell className="font-mono text-sm">{slot._count?.users || 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {slot.enabledModules?.slice(0, 3).map(mod => (
                              <Badge
                                key={mod}
                                variant="outline"
                                className="text-[9px] p-0 px-1.5 border-emerald-500/20 text-emerald-600 bg-emerald-500/5 uppercase"
                              >
                                {mod}
                              </Badge>
                            ))}
                            {(slot.enabledModules?.length || 0) > 3 && (
                              <Badge variant="outline" className="text-[9px] p-0 px-1.5">
                                +{slot.enabledModules!.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 hover:bg-emerald-500/10 hover:text-emerald-600 transition-all group"
                              onClick={() => handleImpersonate(slot.id, slot.nombre)}
                            >
                              <ShieldCheck className="mr-1 h-3 w-3 transition-transform group-hover:scale-125" />
                              <span className="text-[10px] font-bold uppercase tracking-tighter hidden sm:inline">
                                Acceder
                              </span>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                {slot.estado === 'activo' ? (
                                  <DropdownMenuItem
                                    className="text-xs font-medium"
                                    onClick={() => setConfirmToggle({ id: slot.id, action: 'deactivate', name: slot.nombre })}
                                  >
                                    <PowerOff className="mr-2 h-3.5 w-3.5 text-amber-500" />
                                    Desactivar
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-xs font-medium"
                                    onClick={() => setConfirmToggle({ id: slot.id, action: 'activate', name: slot.nombre })}
                                  >
                                    <Power className="mr-2 h-3.5 w-3.5 text-green-500" />
                                    Activar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-xs font-medium"
                                  onClick={() => handleImpersonate(slot.id, slot.nombre)}
                                >
                                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                  Acceder al despacho
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-xs font-medium text-destructive"
                                  onClick={() => setConfirmDelete(slot.id)}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
      </Tabs>

      {/* ── Create Slot Modal ── */}
      <CreateSlotModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false)
          fetchSlots()
        }}
      />

      {/* ── Confirm Toggle Dialog ── */}
      <AlertDialog open={!!confirmToggle} onOpenChange={() => setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmToggle?.action === 'activate' ? (
                <Power className="h-5 w-5 text-green-500" />
              ) : (
                <PowerOff className="h-5 w-5 text-amber-500" />
              )}
              {confirmToggle?.action === 'activate' ? 'Activar empresa cliente' : 'Desactivar empresa cliente'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.action === 'activate'
                ? `¿Estás seguro de activar "${confirmToggle?.name}"? La empresa podrá acceder nuevamente al sistema.`
                : `¿Estás seguro de desactivar "${confirmToggle?.name}"? La empresa no podrá acceder hasta que la actives de nuevo.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmToggle?.action === 'activate') {
                  handleActivate(confirmToggle.id)
                } else {
                  handleDeactivate(confirmToggle.id)
                }
                setConfirmToggle(null)
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Delete Dialog ── */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Eliminar empresa cliente
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la empresa y todos sus datos contables y fiscales asociados.
              La empresa perderá el acceso al sistema. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Create Slot Modal Component ──────────────────────────────────────────────

function CreateSlotModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    client_name: '',
    admin_email: '',
    modules: ['CONTABILIDAD'] as string[],
  })

  const AVAILABLE_MODULES = [
    { id: 'CONTABILIDAD', label: 'Contabilidad Core', default: true },
    { id: 'FACTURACION', label: 'Facturación' },
    { id: 'CONCILIACION', label: 'Conciliación Bancaria' },
    { id: 'IMPUESTOS', label: 'Impuestos' },
    { id: 'NOMINAS', label: 'Nóminas' },
    { id: 'CLIENTES', label: 'Clientes' },
    { id: 'PROVEEDORES', label: 'Proveedores' },
    { id: 'REPORTES', label: 'Reportes P&L' },
    { id: 'ANALYTICS', label: 'Analytics' },
    { id: 'CRM', label: 'CRM' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.client_name.trim()) {
      toast.error('El nombre de la empresa es requerido')
      return
    }
    if (!formData.admin_email.trim()) {
      toast.error('El email del administrador es requerido')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: formData.client_name.trim(),
          admin_email: formData.admin_email.trim(),
          modules_enabled: formData.modules,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Empresa "${formData.client_name}" creada con éxito`)
        setFormData({ client_name: '', admin_email: '', modules: ['CONTABILIDAD'] })
        onSuccess()
      } else {
        toast.error(data.error || 'Error al crear empresa')
      }
    } catch {
      toast.error('Error de conexión al servidor')
    } finally {
      setLoading(false)
    }
  }

  const toggleModule = (moduleId: string) => {
    setFormData(prev => ({
      ...prev,
      modules: prev.modules.includes(moduleId)
        ? prev.modules.filter(m => m !== moduleId)
        : [...prev.modules, moduleId],
    }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] border-emerald-500/20 bg-background/95 backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-emerald-500" /> Nueva Empresa Cliente
            </DialogTitle>
            <DialogDescription>
              Crea un entorno contable y fiscal aislado para tu cliente. Heredará la marca de tu despacho automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Building2 className="h-3 w-3" /> Razón Social / Nombre de la Empresa
              </Label>
              <Input
                id="name"
                placeholder="Ej. Comercializadora del Sur, S.A. de C.V."
                value={formData.client_name}
                onChange={e => setFormData({ ...formData, client_name: e.target.value })}
                required
                className="bg-accent/30 border-emerald-500/10 focus-visible:ring-emerald-500"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Mail className="h-3 w-3" /> Email del Administrador
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@empresa-cliente.com"
                value={formData.admin_email}
                onChange={e => setFormData({ ...formData, admin_email: e.target.value })}
                required
                className="bg-accent/30 border-emerald-500/10 focus-visible:ring-emerald-500"
              />
            </div>

            <div className="grid gap-3">
              <Label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-1">
                <ShieldCheck className="h-3 w-3" /> Módulos Habilitados
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_MODULES.map(mod => (
                  <div
                    key={mod.id}
                    className={`flex items-center space-x-2 p-3 rounded-lg border transition-colors cursor-pointer ${
                      formData.modules.includes(mod.id)
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-accent/20 border-border hover:bg-accent/30'
                    } ${mod.default ? 'opacity-80' : ''}`}
                    onClick={() => !mod.default && toggleModule(mod.id)}
                  >
                    <Checkbox
                      id={`mod-${mod.id}`}
                      checked={formData.modules.includes(mod.id)}
                      onCheckedChange={() => toggleModule(mod.id)}
                      disabled={mod.default}
                    />
                    <Label
                      htmlFor={`mod-${mod.id}`}
                      className={`text-sm font-bold uppercase cursor-pointer ${mod.default ? 'text-muted-foreground' : ''}`}
                    >
                      {mod.label}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Contabilidad Core siempre está habilitado. Los módulos adicionales dependen del plan del cliente.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 hover:scale-105 transition-all" disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Creando...
                </>
              ) : (
                'Crear Empresa Cliente'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
