
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Activity, User, Calendar, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

interface AuditLog {
  id: string
  fechaCreacion: Date
  accion: string
  entidad: string
  entidadId: string
  descripcion: string
  user: {
    id: string
    name: string | null
    email: string
  }
  ipAddress?: string | null
}

export function AuditLogsViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([])

  useEffect(() => {
    fetchLogs()
  }, [])

  useEffect(() => {
    if (searchTerm) {
      const filtered = logs.filter(log =>
        log.accion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entidad.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredLogs(filtered)
    } else {
      setFilteredLogs(logs)
    }
  }, [searchTerm, logs])

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/audit-logs')
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
        setFilteredLogs(data.logs || [])
      } else {
        toast.error('Error al cargar logs')
      }
    } catch (error) {
      console.error('Error fetching logs:', error)
      toast.error('Error al cargar logs')
    } finally {
      setLoading(false)
    }
  }

  const getActionBadgeColor = (action: string) => {
    if (action.includes('crear') || action.includes('create')) return 'bg-green-500'
    if (action.includes('editar') || action.includes('update') || action.includes('assign')) return 'bg-blue-500'
    if (action.includes('eliminar') || action.includes('delete')) return 'bg-red-500'
    return 'bg-gray-500'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Cargando logs...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center">
            <Activity className="h-8 w-8 mr-3 text-primary" />
            Logs de Auditoría
          </h1>
          <p className="text-muted-foreground">
            Historial completo de acciones realizadas en el sistema
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Registro de Actividades</CardTitle>
              <CardDescription>
                {filteredLogs.length} {filteredLogs.length === 1 ? 'registro' : 'registros'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar en logs..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={fetchLogs}>
                Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha y Hora</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Detalles</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No se encontraron registros
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm">
                            <div>{format(new Date(log.fechaCreacion), 'dd MMM yyyy', { locale: es })}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(log.fechaCreacion), 'HH:mm:ss')}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm">
                            <div>{log.user.name || 'Sin nombre'}</div>
                            <div className="text-xs text-muted-foreground">{log.user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getActionBadgeColor(log.accion)}>
                          {log.accion}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm">
                            <div>{log.entidad}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {log.entidadId.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="text-sm truncate" title={log.descripcion}>
                          {log.descripcion}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground font-mono">
                          {log.ipAddress || '-'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
