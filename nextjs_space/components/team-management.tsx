
'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { UserPlus, Mail, Phone, Clock, Shield, Pencil, Trash2, FileText, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { EmployeeExpedient } from '@/components/hr/EmployeeExpedient'

interface User {
  id: string
  name: string | null
  email: string
  role: {
    id: string
    nombre: string
  }
  employee?: {
    id: string
    employeeId: string
    department: string
    jobTitle: string
  }
  estado: string
  telefono?: string | null
  timezone?: string | null
  image?: string | null
  createdAt: string
}

interface Role {
  id: string
  nombre: string
  descripcion: string | null
}

export function TeamManagement() {
  const { data: session } = useSession() || {}
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [viewingExpedientId, setViewingExpedientId] = useState<string | null>(null)

  // Form states
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('')
  const [inviteDepartment, setInviteDepartment] = useState('')
  const [isDeptAdmin, setIsDeptAdmin] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const DEPARTMENTS = [
    { id: 'VENTAS', name: 'Ventas' },
    { id: 'FINANZAS', name: 'Finanzas / Contabilidad' },
    { id: 'RRHH', name: 'Recursos Humanos' },
    { id: 'PRODUCCION', name: 'Producción' },
    { id: 'INVENTARIO', name: 'Inventario / Almacén' },
    { id: 'SOPORTE', name: 'Soporte al Cliente' },
  ]

  // Edit form states
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editTimezone, setEditTimezone] = useState('')
  const [editActive, setEditActive] = useState(true)

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/roles')
      if (response.ok) {
        const data = await response.json()
        // La API retorna el array directamente, no envuelto
        setRoles(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Error fetching roles:', error)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          roleId: inviteRole || undefined,
          department: inviteDepartment,
          isDepartmentAdmin: isDeptAdmin,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Usuario invitado exitosamente con auto-perfilado')
        setInviteOpen(false)
        setInviteEmail('')
        setInviteName('')
        setInviteRole('')
        setInviteDepartment('')
        setIsDeptAdmin(false)
        fetchUsers()
      } else {
        toast.error(data.error || 'Error al invitar usuario')
      }
    } catch (error) {
      console.error('Error inviting user:', error)
      toast.error('Error al invitar usuario')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (user: User) => {
    setSelectedUser(user)
    setEditName(user.name || '')
    setEditRole(user.role?.id || '')
    setEditPhone(user.telefono || '')
    setEditTimezone(user.timezone || 'America/Mexico_City')
    setEditActive(user.estado === 'activo')
    setEditOpen(true)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    setSubmitting(true)

    try {
      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          roleId: editRole,
          telefono: editPhone,
          timezone: editTimezone,
          estado: editActive ? 'activo' : 'inactivo',
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Usuario actualizado exitosamente')
        setEditOpen(false)
        setSelectedUser(null)
        fetchUsers()
      } else {
        toast.error(data.error || 'Error al actualizar usuario')
      }
    } catch (error) {
      console.error('Error updating user:', error)
      toast.error('Error al actualizar usuario')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (userId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este usuario?')) return

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Usuario eliminado exitosamente')
        fetchUsers()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Error al eliminar usuario')
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      toast.error('Error al eliminar usuario')
    }
  }

  const getRoleBadgeColor = (roleName: string | undefined) => {
    if (!roleName) return 'bg-gray-500'
    const lower = roleName.toLowerCase()
    if (lower === 'superadmin') return 'bg-red-500'
    if (lower === 'admin') return 'bg-orange-500'
    if (lower === 'sales agent' || lower === 'agente de ventas') return 'bg-blue-500'
    if (lower === 'support' || lower === 'soporte') return 'bg-green-500'
    if (lower === 'instructor') return 'bg-purple-500'
    return 'bg-gray-500'
  }

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return email.slice(0, 2).toUpperCase()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Cargando equipo...</div>
      </div>
    )
  }

  if (viewingExpedientId) {
    return (
      <div className="space-y-6">
        <Button 
          variant="ghost" 
          onClick={() => setViewingExpedientId(null)}
          className="rounded-xl font-bold mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-2" /> Volver al Listado
        </Button>
        <EmployeeExpedient 
          employeeId={viewingExpedientId} 
          onClose={() => setViewingExpedientId(null)} 
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipo</h1>
          <p className="text-muted-foreground">
            Gestiona tu equipo y expedientes profesionales
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl h-11 px-6 shadow-lg shadow-primary/10">
              <UserPlus className="mr-2 h-4 w-4" />
              Invitar Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-3xl">
            <form onSubmit={handleInvite}>
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Invitar Nuevo Usuario</DialogTitle>
                <DialogDescription className="font-medium text-slate-500">
                  Envía una invitación para unirse a tu equipo con perfilado automático.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nombre completo</Label>
                  <Input
                    id="name"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Juan Pérez"
                    className="rounded-xl h-11 border-slate-100"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="juan@ejemplo.com"
                    className="rounded-xl h-11 border-slate-100"
                    required
                  />
                </div>
                
                <div className="grid gap-2 border-t pt-4 mt-2">
                  <Label className="text-[10px] font-bold uppercase text-primary">Perfilado por Departamento</Label>
                  <div className="grid gap-2">
                    <Label htmlFor="dept">Departamento</Label>
                    <Select value={inviteDepartment} onValueChange={setInviteDepartment}>
                      <SelectTrigger className="rounded-xl h-11 border-slate-100">
                        <SelectValue placeholder="Seleccionar departamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 mt-2 p-3 bg-slate-50 rounded-xl border">
                    <Switch 
                      id="dept-admin" 
                      checked={isDeptAdmin} 
                      onCheckedChange={setIsDeptAdmin} 
                    />
                    <div className="grid gap-0.5">
                      <Label htmlFor="dept-admin" className="font-bold text-sm">Administrador del Área</Label>
                      <p className="text-[10px] text-muted-foreground">Otorga permisos totales de gestión en este departamento.</p>
                    </div>
                  </div>
                </div>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">O asignar Rol específico</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="role">Rol Directo (Opcional)</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="rounded-xl h-11 border-slate-100">
                      <SelectValue placeholder="Seleccionar rol manual" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl h-11"
                  onClick={() => setInviteOpen(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-xl h-11 px-8 premium-gradient-primary shadow-xl shadow-primary/20 font-black uppercase text-[10px]" disabled={submitting}>
                  {submitting ? 'Enviando...' : 'Enviar Invitación'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-[2rem] border-none shadow-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle>Miembros del Equipo</CardTitle>
          <CardDescription>
            {users.length} {users.length === 1 ? 'miembro' : 'miembros'} en total
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="px-8 py-4">Usuario</TableHead>
                <TableHead>Rol & Departamento</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right px-8">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 rounded-xl shadow-sm">
                        <AvatarImage src={user.image || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                          {getInitials(user.name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-bold text-slate-900">{user.name || 'Sin nombre'}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge className={getRoleBadgeColor(user.role?.nombre)}>
                        <Shield className="mr-1 h-3 w-3" />
                        {user.role?.nombre || 'Sin rol'}
                      </Badge>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                        {user.employee?.department || 'GENERAL'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 text-xs">
                      {user.telefono && (
                        <div className="flex items-center gap-1 text-muted-foreground font-medium">
                          <Phone className="h-3 w-3 text-primary" />
                          {user.telefono}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-muted-foreground font-medium">
                        <Clock className="h-3 w-3 text-primary" />
                        {user.timezone || 'America/Mexico_City'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      "rounded-lg px-2 py-0.5 font-bold uppercase text-[9px]",
                      user.estado === 'activo' ? "border-emerald-200 text-emerald-600" : "border-slate-200 text-slate-400"
                    )}>
                      {user.estado === 'activo' ? 'Activo' : user.estado === 'invitado' ? 'Invitado' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right px-8">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-slate-100 hover:bg-slate-50 font-bold text-xs"
                        onClick={() => user.employee?.id && setViewingExpedientId(user.employee.id)}
                        disabled={!user.employee?.id}
                      >
                        <FileText className="mr-2 h-4 w-4 text-primary" />
                        Expediente
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl h-9 w-9 p-0 hover:bg-slate-100"
                        onClick={() => handleEdit(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl h-9 w-9 p-0 hover:bg-red-50 text-red-500"
                        onClick={() => handleDelete(user.id)}
                        disabled={user.email === session?.user?.email}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>Editar Usuario</DialogTitle>
              <DialogDescription>
                Actualiza la información y permisos del usuario
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nombre completo</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-role">Rol</Label>
                <Select value={editRole} onValueChange={setEditRole} required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Teléfono</Label>
                <Input
                  id="edit-phone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+52 123 456 7890"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-timezone">Zona horaria</Label>
                <Select value={editTimezone} onValueChange={setEditTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Mexico_City">Ciudad de México (GMT-6)</SelectItem>
                    <SelectItem value="Europe/Madrid">Madrid (GMT+1)</SelectItem>
                    <SelectItem value="Europe/Lisbon">Lisboa (GMT+0)</SelectItem>
                    <SelectItem value="America/Bogota">Bogotá (GMT-5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="edit-active">Usuario activo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
