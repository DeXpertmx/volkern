'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { 
  User, Briefcase, Lock, Settings, Mail, Phone, MapPin, 
  CreditCard, Calendar, GraduationCap, Shield, Save, 
  Camera, Plus, Trash2, Clock, Globe, Heart
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'

interface EmployeeExpedientProps {
  employeeId: string
  onClose?: () => void
}

export function EmployeeExpedient({ employeeId, onClose }: EmployeeExpedientProps) {
  const [employee, setEmployee] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('curriculum')
  const [staff, setStaff] = useState<any[]>([])

  useEffect(() => {
    fetchEmployee()
    fetchStaff()
  }, [employeeId])

  const fetchStaff = async () => {
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data = await res.json()
        setStaff(data.users || [])
      }
    } catch (e) {
      console.error('Error fetching staff')
    }
  }

  const fetchEmployee = async () => {
    try {
      const res = await fetch(`/api/erp/hr/employees/${employeeId}`)
      if (res.ok) {
        const data = await res.json()
        setEmployee(data)
      }
    } catch (e) {
      toast.error('Error al cargar el expediente')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (field: string, value: any) => {
    setEmployee((prev: any) => ({ ...prev, [field]: value }))
  }

  const saveChanges = async () => {
    setSaving(true)
    try {
      // Sanitizar datos para Prisma
      const { user, manager, subordinates, ...cleanData } = employee
      
      // Asegurar que los JSON sean arrays válidos si vienen como strings
      if (typeof cleanData.experience === 'string') {
        try { cleanData.experience = JSON.parse(cleanData.experience) } catch(e) { cleanData.experience = [] }
      }
      if (typeof cleanData.skills === 'string') {
        try { cleanData.skills = JSON.parse(cleanData.skills) } catch(e) { cleanData.skills = [] }
      }
      
      // Eliminar campos técnicos que no deben ir en el PATCH
      delete cleanData.id
      delete cleanData.tenantId
      delete cleanData.createdAt
      delete cleanData.updatedAt

      const res = await fetch(`/api/erp/hr/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanData)
      })
      if (res.ok) {
        toast.success('Expediente actualizado correctamente')
        fetchEmployee() // Recargar para ver cambios
      } else {
        const error = await res.json()
        console.error('[SAVE_ERROR]', error)
        toast.error(`Error: ${error.details || error.error || 'No se pudo guardar'}`)
      }
    } catch (e) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const generateBadge = async () => {
    try {
      const configRes = await fetch('/api/erp/hr/config')
      const hrConfig = configRes.ok ? await configRes.json() : {}
      const badgeSettings = hrConfig.badge || {
        primaryColor: [15, 23, 42],
        secondaryColor: [59, 130, 246],
        showQr: true,
        showDepartment: true,
        layout: 'portrait'
      }

      // Función helper para convertir hex a RGB
      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        return [r, g, b]
      }

      const pColor = typeof badgeSettings.primaryColor === 'string' ? hexToRgb(badgeSettings.primaryColor) : [15, 23, 42]
      const sColor = typeof badgeSettings.secondaryColor === 'string' ? hexToRgb(badgeSettings.secondaryColor) : [59, 130, 246]

      const { jsPDF } = await import(/* webpackChunkName: "jspdf" */ 'jspdf')
      const isLandscape = badgeSettings.layout === 'landscape'
      const doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [54, 86]
      })

      const w = isLandscape ? 86 : 54
      const h = isLandscape ? 54 : 86

      // Fondo Header
      doc.setFillColor(pColor[0], pColor[1], pColor[2])
      doc.rect(0, 0, w, isLandscape ? 15 : 20, 'F')
      
      // Texto Header
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.text('VOLKERN ERP', w/2, 8, { align: 'center' })
      doc.setFontSize(6)
      doc.text('ID OFICIAL DE COLABORADOR', w/2, 12, { align: 'center' })

      // Foto Placeholder / Avatar
      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(w/2 - 12, 25, 24, 24, 3, 3, 'FD')

      // Cuerpo
      doc.setTextColor(15, 23, 42)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(employee.fullName.toUpperCase(), w/2, 55, { align: 'center' })
      
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(employee.jobTitle || 'Colaborador', w/2, 60, { align: 'center' })
      
      if (badgeSettings.showDepartment) {
        doc.setFontSize(6)
        doc.setTextColor(100, 116, 139)
        doc.text(`${employee.department || 'GENERAL'}`, w/2, 64, { align: 'center' })
      }

      doc.setFontSize(5)
      doc.text(`ID: ${employee.employeeId || '----'}`, w/2, 68, { align: 'center' })

      // QR Placeholder
      if (badgeSettings.showQr) {
        doc.setDrawColor(sColor[0], sColor[1], sColor[2])
        doc.rect(w/2 - 5, h - 15, 10, 10)
      }

      // Footer Accent
      doc.setFillColor(sColor[0], sColor[1], sColor[2])
      doc.rect(0, h - 2, w, 2, 'F')

      doc.save(`Badge_${employee.fullName.replace(/\s+/g, '_')}.pdf`)
      toast.success('Credencial generada con tu plantilla personalizada')
    } catch (e) {
      console.error(e)
      toast.error('Error al generar la credencial')
    }
  }

  const generateOrgChart = () => {
    // Para simplificar, mostramos un mensaje con la jerarquía actual
    const managerName = employee.manager?.fullName || 'Sin Gerente'
    const subCount = employee.subordinates?.length || 0
    toast.info(`Jerarquía: Reporta a ${managerName}. Tiene ${subCount} subordinados directos.`, {
      description: 'El organigrama visual completo se está renderizando en el Hub de RRHH.',
      duration: 5000
    })
  }

  if (loading) {
    return <div className="p-20 text-center animate-pulse font-bold">Abriendo Expediente Maestro...</div>
  }

  if (!employee) {
    return (
      <div className="p-20 text-center">
        <p className="text-red-500 font-bold">No se pudo cargar el expediente.</p>
        <Button onClick={onClose} className="mt-4 rounded-xl">Cerrar</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      {/* Header Premium */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <Avatar className="h-32 w-32 rounded-3xl shadow-2xl border-4 border-white ring-1 ring-slate-100">
              <AvatarImage src={employee.user?.image} />
              <AvatarFallback className="bg-primary text-white text-4xl font-black">
                {employee.fullName?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <button className="absolute -bottom-2 -right-2 p-2 bg-white rounded-xl shadow-lg border border-slate-100 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-slate-300">#{employee.employeeId || '----'}</span>
              <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900">{employee.fullName}</h1>
            </div>
            <p className="text-xl font-bold text-primary/80 uppercase tracking-tight">{employee.jobTitle}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className="rounded-lg border-slate-200 text-slate-500 font-bold px-3 py-1">
                <Globe className="w-3 h-3 mr-1.5" /> {employee.department}
              </Badge>
              {employee.isDepartmentAdmin && (
                <Badge className="bg-emerald-500/10 text-emerald-600 border-none rounded-lg font-bold px-3 py-1">
                  <Shield className="w-3 h-3 mr-1.5" /> GERENTE
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 min-w-[200px]">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-500 bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <Mail className="w-4 h-4 text-primary" />
            <span>{employee.email || employee.user?.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-500 bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <Phone className="w-4 h-4 text-primary" />
            <span>{employee.mobilePhone || 'Sin teléfono'}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onClose && (
          <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold">
            Cerrar
          </Button>
        )}
        <Button onClick={saveChanges} disabled={saving} className="rounded-2xl h-12 px-8 premium-gradient-primary shadow-xl shadow-primary/20 font-black uppercase text-xs">
          {saving ? 'Guardando...' : <><Save className="w-4 h-4 mr-2" /> Guardar Expediente</>}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white p-1 rounded-2xl shadow-lg border border-slate-100 h-14 w-full justify-start overflow-x-auto">
          <TabsTrigger value="curriculum" className="rounded-xl font-bold uppercase text-[10px] px-6 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            <GraduationCap className="w-4 h-4 mr-2" /> Currículum
          </TabsTrigger>
          <TabsTrigger value="trabajo" className="rounded-xl font-bold uppercase text-[10px] px-6 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            <Briefcase className="w-4 h-4 mr-2" /> Info de Trabajo
          </TabsTrigger>
          <TabsTrigger value="privada" className="rounded-xl font-bold uppercase text-[10px] px-6 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            <Lock className="w-4 h-4 mr-2" /> Info Privada
          </TabsTrigger>
          <TabsTrigger value="ajustes" className="rounded-xl font-bold uppercase text-[10px] px-6 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            <Settings className="w-4 h-4 mr-2" /> Ajustes
          </TabsTrigger>
        </TabsList>

        {/* Tab: Currículum */}
        <TabsContent value="curriculum">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="rounded-[2rem] border-none shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Experiencia Laboral</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="rounded-lg text-primary font-bold">
                      <Plus className="w-4 h-4 mr-1" /> Agregar
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-3xl">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-black uppercase tracking-tight">Añadir Experiencia</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>Empresa</Label>
                        <Input id="exp-company" placeholder="Ej: Google" className="rounded-xl" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Puesto</Label>
                        <Input id="exp-position" placeholder="Ej: Senior Developer" className="rounded-xl" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Duración</Label>
                        <Input id="exp-duration" placeholder="Ej: 2020 - 2023" className="rounded-xl" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button className="rounded-xl premium-gradient-primary font-bold uppercase text-[10px]" onClick={() => {
                        const company = (document.getElementById('exp-company') as HTMLInputElement).value
                        const position = (document.getElementById('exp-position') as HTMLInputElement).value
                        const duration = (document.getElementById('exp-duration') as HTMLInputElement).value
                        if (company && position) {
                          const currentExp = Array.isArray(employee.experience) ? employee.experience : []
                          handleUpdate('experience', [...currentExp, { company, position, duration }])
                          toast.success('Experiencia añadida localmente. No olvides guardar.')
                        }
                      }}>
                        Añadir a Lista
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-4">
                {employee.experience && Array.isArray(employee.experience) && employee.experience.length > 0 ? (
                  employee.experience.map((exp: any, idx: number) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-start">
                      <div>
                        <p className="font-bold text-slate-900">{exp.position}</p>
                        <p className="text-xs text-primary font-bold">{exp.company}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{exp.duration}</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-400 hover:text-red-600 h-8 w-8 p-0"
                        onClick={() => {
                          const newExp = [...employee.experience]
                          newExp.splice(idx, 1)
                          handleUpdate('experience', newExp)
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center py-10">
                    <p className="text-xs font-bold text-slate-400 uppercase">Sin historial registrado</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-none shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Habilidades & Certificaciones</CardTitle>
                <div className="flex gap-2">
                  <Input 
                    id="new-skill-input"
                    placeholder="Nueva habilidad..." 
                    className="h-8 text-xs rounded-lg w-32"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value
                        if (val) {
                          const currentSkills = Array.isArray(employee.skills) ? employee.skills : []
                          handleUpdate('skills', [...currentSkills, val])
                          e.currentTarget.value = ''
                        }
                      }
                    }}
                  />
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0 text-primary"
                    onClick={() => {
                      const input = document.getElementById('new-skill-input') as HTMLInputElement
                      if (input && input.value) {
                        const currentSkills = Array.isArray(employee.skills) ? employee.skills : []
                        handleUpdate('skills', [...currentSkills, input.value])
                        input.value = ''
                      }
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(employee.skills) && employee.skills.map((skill: string, idx: number) => (
                    <Badge key={idx} className="bg-slate-100 text-slate-600 border-none rounded-lg px-3 py-1 font-bold group">
                      {skill}
                      <button 
                        className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          const newSkills = [...employee.skills]
                          newSkills.splice(idx, 1)
                          handleUpdate('skills', newSkills)
                        }}
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </Badge>
                  ))}
                  {(!employee.skills || employee.skills.length === 0) && (
                    <p className="text-xs text-slate-400 font-bold uppercase italic">Sin habilidades registradas</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Info de Trabajo */}
        <TabsContent value="trabajo">
          <Card className="rounded-[2rem] border-none shadow-xl">
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary">Ubicación & Logística</h3>
                  <div className="grid gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Dirección Laboral</Label>
                      <Input 
                        placeholder="Oficina Central / Planta A" 
                        className="rounded-xl border-slate-100 h-11" 
                        value={employee.workLocation || ''}
                        onChange={(e) => handleUpdate('workLocation', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Zona Horaria</Label>
                      <Select defaultValue="America/Mexico_City">
                        <SelectTrigger className="rounded-xl h-11 border-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/Mexico_City">America/Mexico_City (GMT-6)</SelectItem>
                          <SelectItem value="Europe/Madrid">Europe/Madrid (GMT+1)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary">Estructura Organizacional</h3>
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-xl shadow-sm">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">Gerente Responsable</p>
                          <Select 
                            value={employee.managerId || 'none'} 
                            onValueChange={(val) => handleUpdate('managerId', val === 'none' ? null : val)}
                          >
                            <SelectTrigger className="h-8 border-none bg-transparent p-0 font-bold text-sm shadow-none focus:ring-0">
                              <SelectValue placeholder="Sin asignar" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="none">Sin asignar</SelectItem>
                              {staff.filter(s => s.employee?.id && s.employee.id !== employee.id).map((member) => (
                                <SelectItem key={member.employee.id} value={member.employee.id}>
                                  {member.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="text-center py-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Sin posición jerárquica definida</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4 rounded-xl border-slate-200 text-xs font-bold"
                        onClick={generateOrgChart}
                      >
                        Generar Organigrama
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Info Privada */}
        <TabsContent value="privada">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="rounded-[2.5rem] border-none shadow-xl">
              <CardContent className="p-8 space-y-8">
                <div className="space-y-6">
                  <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                    <Heart className="w-4 h-4" /> Contacto Privado
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Dirección Particular</Label>
                      <Input className="rounded-xl h-11 border-slate-100" placeholder="Calle, Número, Col..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Email Personal</Label>
                      <Input className="rounded-xl h-11 border-slate-100" value={employee.privateEmail || ''} onChange={(e) => handleUpdate('privateEmail', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Celular Privado</Label>
                      <Input className="rounded-xl h-11 border-slate-100" value={employee.privatePhone || ''} onChange={(e) => handleUpdate('privatePhone', e.target.value)} />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Cuenta Bancaria (IBAN/CLABE)</Label>
                      <Input className="rounded-xl h-11 border-slate-100 font-mono text-xs" value={employee.bankAccount || ''} onChange={(e) => handleUpdate('bankAccount', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary">Contacto de Emergencia</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Nombre Contacto</Label>
                      <Input className="rounded-xl h-11 border-slate-100" value={employee.emergencyContactName || ''} onChange={(e) => handleUpdate('emergencyContactName', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Teléfono Emergencia</Label>
                      <Input className="rounded-xl h-11 border-slate-100" value={employee.emergencyContactPhone || ''} onChange={(e) => handleUpdate('emergencyContactPhone', e.target.value)} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2.5rem] border-none shadow-xl">
              <CardContent className="p-8 space-y-8">
                <div className="space-y-6">
                  <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                    <Shield className="w-4 h-4" /> Ciudadanía & Legal
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Nacionalidad</Label>
                      <Input className="rounded-xl h-11 border-slate-100" value={employee.nationality || ''} onChange={(e) => handleUpdate('nationality', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">ID / RFC</Label>
                      <Input className="rounded-xl h-11 border-slate-100 font-bold" value={employee.identificationNumber || ''} onChange={(e) => handleUpdate('identificationNumber', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">CURP</Label>
                      <Input className="rounded-xl h-11 border-slate-100 font-bold" value={employee.curp || ''} onChange={(e) => handleUpdate('curp', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">NSS (Seguridad Social)</Label>
                      <Input className="rounded-xl h-11 border-slate-100 font-bold" value={employee.socialSecurityNumber || ''} onChange={(e) => handleUpdate('socialSecurityNumber', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Género</Label>
                      <Select value={employee.gender} onValueChange={(v) => handleUpdate('gender', v)}>
                        <SelectTrigger className="rounded-xl h-11 border-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MASCULINO">Masculino</SelectItem>
                          <SelectItem value="FEMENINO">Femenino</SelectItem>
                          <SelectItem value="OTRO">Otro / Prefiero no decir</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Fecha de Nacimiento</Label>
                      <Input type="date" className="rounded-xl h-11 border-slate-100" />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary">Educación</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Nivel de Certificado</Label>
                      <Input className="rounded-xl h-11 border-slate-100" placeholder="Licenciatura, Master..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Campo de Estudio</Label>
                      <Input className="rounded-xl h-11 border-slate-100" placeholder="Administración, Ing..." />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Ajustes */}
        <TabsContent value="ajustes">
          <Card className="rounded-[2rem] border-none shadow-xl max-w-2xl mx-auto">
            <CardContent className="p-8 space-y-10">
              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">Estado de Colaborador</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Tipo de Empleado</Label>
                    <Select defaultValue="EMPLOYEE">
                      <SelectTrigger className="rounded-xl h-11 border-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMPLOYEE">Empleado de Plantilla</SelectItem>
                        <SelectItem value="STUDENT">Becario / Estudiante</SelectItem>
                        <SelectItem value="TRAINEE">En Capacitación</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Usuario Relacionado</Label>
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600">
                      <User className="w-4 h-4" />
                      {employee.user?.email || 'Sin usuario'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">Asistencia & Punto de Venta</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Código NIP (Punch)</Label>
                    <Input 
                      type="password" 
                      maxLength={6} 
                      placeholder="****" 
                      className="rounded-xl h-11 border-slate-100 text-center font-black tracking-widest" 
                      value={employee.pinCode || ''}
                      onChange={(e) => handleUpdate('pinCode', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">ID de Credencial</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="BADGE-0000" 
                        className="rounded-xl h-11 border-slate-100" 
                        value={employee.badgeId || ''}
                        onChange={(e) => handleUpdate('badgeId', e.target.value)}
                      />
                      <Button 
                        variant="outline" 
                        className="rounded-xl"
                        onClick={generateBadge}
                      >
                        Generar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                <div>
                  <p className="font-bold text-red-600 text-sm">Baja de Empleado</p>
                  <p className="text-[10px] text-red-500 font-medium">Inhabilitar todos los accesos del colaborador.</p>
                </div>
                <Button variant="destructive" className="rounded-xl font-bold uppercase text-[10px]">Ejecutar Baja</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
