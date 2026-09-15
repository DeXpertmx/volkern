'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Shield, ShieldCheck, ShieldAlert, Plus, Save, Trash2, ChevronRight, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'

interface Role {
  id: string
  nombre: string
  descripcion: string | null
  permisos: any
}

const MODULES = [
  { id: 'leads', name: 'Leads / Prospectos', icon: 'Users' },
  { id: 'citas', name: 'Agenda / Citas', icon: 'Calendar' },
  { id: 'ventas', name: 'Ventas / Pedidos', icon: 'ShoppingCart' },
  { id: 'finanzas', name: 'Finanzas / Facturación', icon: 'Receipt' },
  { id: 'rrhh', name: 'Recursos Humanos / Nóminas', icon: 'Users' },
  { id: 'produccion', name: 'Producción / Fábrica', icon: 'Factory' },
  { id: 'inventario', name: 'Inventario / Almacén', icon: 'Package' },
  { id: 'marketing', name: 'Marketing / Web', icon: 'Send' },
  { id: 'equipo', name: 'Gestión de Equipo', icon: 'UserCog' },
  { id: 'configuracion', name: 'Configuración Sistema', icon: 'Settings' },
  // Hospitality se reparte en las cuatro áreas de trabajo de una propiedad
  // real. Si no estuvieran aquí, la API las exige pero nadie podría concederlas.
  { id: 'hospitality_reservas', name: 'Hospitality · Reservas y planning', icon: 'CalendarDays' },
  { id: 'hospitality_operaciones', name: 'Hospitality · Operaciones (limpieza y check-in/out)', icon: 'Sparkles' },
  { id: 'hospitality_mantenimiento', name: 'Hospitality · Mantenimiento', icon: 'Wrench' },
  { id: 'hospitality_integraciones', name: 'Hospitality · Integraciones y conectividad', icon: 'Plug' },
  { id: 'hospitality_finanzas', name: 'Hospitality · Finanzas y reportes', icon: 'Receipt' },
  { id: 'hospitality_comunicaciones', name: 'Hospitality · Comunicaciones al huésped', icon: 'Send' },
  { id: 'hospitality_automatizaciones', name: 'Hospitality · Automatizaciones', icon: 'Zap' },
]

const ACTIONS = [
  { id: 'ver', name: 'Ver' },
  { id: 'crear', name: 'Crear' },
  { id: 'editar', name: 'Editar' },
  // Cancelar no es eliminar: la reserva cancelada sigue existiendo con su
  // historial. Es una acción propia y solo la usa Hospitality.
  { id: 'cancelar', name: 'Cancelar' },
  { id: 'eliminar', name: 'Eliminar' },
  { id: 'exportar', name: 'Exportar' },
  { id: 'gestionar', name: 'Gestionar' },
]


export function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isNewRole, setIsNewRole] = useState(false)

  // Edit states
  const [editNombre, setEditNombre] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPerms, setEditPerms] = useState<any>({})

  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/roles')
      if (res.ok) {
        const data = await res.json()
        setRoles(data)
        if (data.length > 0 && !selectedRole) {
          handleSelectRole(data[0])
        }
      }
    } catch (e) {
      toast.error('Error al cargar roles')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectRole = (role: Role) => {
    setSelectedRole(role)
    setEditNombre(role.nombre)
    setEditDesc(role.descripcion || '')
    setEditPerms(role.permisos || {})
    setIsNewRole(false)
  }

  const handleTogglePermission = (moduleId: string, actionId: string, checked: boolean) => {
    setEditPerms((prev: any) => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] || {}),
        [actionId]: checked
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = isNewRole ? '/api/roles' : `/api/roles/${selectedRole?.id}`
      const method = isNewRole ? 'POST' : 'PATCH'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: editNombre,
          descripcion: editDesc,
          permisos: editPerms
        })
      })

      if (res.ok) {
        toast.success(isNewRole ? 'Rol creado' : 'Permisos actualizados')
        fetchRoles()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar')
      }
    } catch (e) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateNew = () => {
    setSelectedRole(null)
    setEditNombre('')
    setEditDesc('')
    setEditPerms({})
    setIsNewRole(true)
  }

  if (loading) return <div className="p-20 text-center font-bold animate-pulse">Cargando Matrix de Permisos...</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight">Roles & Permisos</h1>
          <p className="text-slate-500 font-medium text-sm flex items-center gap-2 mt-1">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Control de soberanía y niveles de acceso por módulo.
          </p>
        </div>
        <Button 
          onClick={handleCreateNew}
          className="rounded-2xl font-black uppercase text-[10px] h-12 px-6 shadow-xl shadow-primary/10"
        >
          <Plus className="w-4 h-4 mr-2" /> Nuevo Rol
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar de Roles */}
        <div className="space-y-4">
          <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">Perfiles de Usuario</Label>
          <div className="space-y-2">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => handleSelectRole(role)}
                className={`w-full text-left p-4 rounded-3xl border transition-all flex items-center justify-between group ${
                  selectedRole?.id === role.id 
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xl scale-[1.02]' 
                    : 'bg-white border-slate-100 text-slate-600 hover:border-primary/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${selectedRole?.id === role.id ? 'bg-white/10' : 'bg-slate-50'}`}>
                    <Shield className={`w-4 h-4 ${selectedRole?.id === role.id ? 'text-white' : 'text-slate-400'}`} />
                  </div>
                  <div>
                    <p className="font-bold text-sm uppercase tracking-tight">{role.nombre}</p>
                    {role.nombre === 'Superadmin' && <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[8px] h-4">SISTEMA</Badge>}
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform ${selectedRole?.id === role.id ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Matrix de Permisos */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedRole?.id || 'new'}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="border-none shadow-2xl rounded-[2.5rem] bg-white overflow-hidden">
                <CardHeader className="p-8 border-b bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div className="space-y-4 w-full max-w-md">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nombre del Rol</Label>
                        <Input 
                          value={editNombre} 
                          onChange={e => setEditNombre(e.target.value)}
                          placeholder="Ej: Director Comercial"
                          disabled={selectedRole?.nombre === 'Superadmin'}
                          className="h-12 rounded-2xl border-slate-200 font-bold text-lg"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Descripción</Label>
                        <Input 
                          value={editDesc} 
                          onChange={e => setEditDesc(e.target.value)}
                          placeholder="Breve descripción de las responsabilidades..."
                          disabled={selectedRole?.nombre === 'Superadmin'}
                          className="h-10 rounded-xl border-slate-100 text-xs font-medium text-slate-500"
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <Button 
                        onClick={handleSave}
                        disabled={saving || selectedRole?.nombre === 'Superadmin'}
                        className="rounded-2xl font-black uppercase text-[10px] h-12 px-10 premium-gradient-primary shadow-xl shadow-primary/20"
                      >
                        {saving ? 'Guardando...' : <><Save className="w-4 h-4 mr-2" /> Guardar Matrix</>}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {selectedRole?.nombre === 'Superadmin' ? (
                    <div className="p-20 text-center space-y-4">
                      <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <Lock className="w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 uppercase">Acceso Total de Sistema</h3>
                      <p className="text-slate-500 font-medium max-w-xs mx-auto">El rol Superadmin tiene permisos absolutos por defecto y no puede ser modificado por seguridad forense.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow className="border-none">
                          <TableHead className="w-[300px] font-black uppercase text-[10px] text-slate-400 py-6 px-8">Módulo / Función</TableHead>
                          {ACTIONS.map(action => (
                            <TableHead key={action.id} className="text-center font-black uppercase text-[10px] text-slate-400 py-6">
                              {action.name}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {MODULES.map(module => (
                          <TableRow key={module.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <TableCell className="py-6 px-8">
                              <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-2xl bg-white border shadow-sm text-slate-400">
                                  <Shield className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 text-sm tracking-tight">{module.name}</p>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">v1.0 Security Check</p>
                                </div>
                              </div>
                            </TableCell>
                            {ACTIONS.map(action => (
                              <TableCell key={action.id} className="text-center py-6">
                                <Switch 
                                  checked={editPerms[module.id]?.[action.id] || false}
                                  onCheckedChange={(checked) => handleTogglePermission(module.id, action.id, checked)}
                                  className="mx-auto"
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
