'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { apiFetch } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { 
  FileText, 
  Plus, 
  ExternalLink, 
  Copy, 
  Trash2, 
  Eye, 
  BarChart3,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'

interface WebForm {
  id: string
  name: string
  config: any
  pageId: string | null
  createdAt: string
  page?: { id: string; titulo: string; slug: string } | null
  _count?: { submissions: number }
}

export default function FormulariosPage() {
  const { data: session } = useSession()
  const [forms, setForms] = useState<WebForm[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewFormDialog, setShowNewFormDialog] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', tallyFormId: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchForms()
  }, [])

  const fetchForms = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/forms')
      if (res.ok) {
        const data = await res.json()
        setForms(data.forms || [])
      } else {
        toast.error('Error al cargar formularios')
      }
    } catch (e) {
      console.error('Error fetching forms:', e)
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateForm = async () => {
    if (!newForm.name.trim() || !newForm.tallyFormId.trim()) {
      toast.error('Nombre y Tally Form ID son requeridos')
      return
    }

    setCreating(true)
    try {
      const res = await apiFetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newForm.name.trim(),
          tallyFormId: newForm.tallyFormId.trim(),
        }),
      })

      if (res.ok) {
        toast.success('Formulario registrado exitosamente')
        setShowNewFormDialog(false)
        setNewForm({ name: '', tallyFormId: '' })
        await fetchForms()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al crear formulario')
      }
    } catch (e) {
      toast.error('Error de conexión')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteForm = async (formId: string, formName: string) => {
    if (!confirm(`¿Eliminar "${formName}"? Las submissions anteriores se conservarán.`)) return

    try {
      const res = await apiFetch(`/api/forms/${formId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Formulario eliminado')
        await fetchForms()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al eliminar')
      }
    } catch (e) {
      toast.error('Error de conexión')
    }
  }

  const getTallyFormUrl = (tallyFormId: string) => {
    return `https://tally.so/r/${tallyFormId}`
  }

  const getTallyEmbedCode = (tallyFormId: string) => {
    return `<iframe src="https://tally.so/embed/${tallyFormId}" width="100%" height="600" frameborder="0" marginheight="0" marginwidth="0" title="Tally Form"></iframe>`
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado al portapapeles`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Cargando formularios...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">Formularios</h2>
          </div>
          <p className="text-muted-foreground mt-1">
            Gestiona formularios tipo Typeform creados con Tally
          </p>
        </div>
        <Dialog open={showNewFormDialog} onOpenChange={setShowNewFormDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Registrar Formulario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Formulario Tally</DialogTitle>
              <DialogDescription>
                Conecta un formulario de Tally.so con tu CRM. Las submissions crearán leads automáticamente.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); handleCreateForm() }} className="space-y-4">
              <div>
                <Label htmlFor="formName">Nombre interno *</Label>
                <Input
                  id="formName"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="Ej: Landing Page Contacto"
                />
              </div>
              <div>
                <Label htmlFor="tallyFormId">Tally Form ID *</Label>
                <Input
                  id="tallyFormId"
                  value={newForm.tallyFormId}
                  onChange={(e) => setNewForm({ ...newForm, tallyFormId: e.target.value })}
                  placeholder="Ej: 3xXXXX o wrXXXX"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  El ID está en la URL del formulario: tally.so/r/<strong>3xXXXX</strong>
                </p>
              </div>
              <div className="bg-muted/30 border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Configuración requerida en Tally:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>En Tally, ve a Settings → Webhooks</li>
                  <li>Agrega: <code className="bg-muted px-1 rounded">{window.location.origin}/api/webhooks/tally</code></li>
                  <li>Asegúrate de marcar &ldquo;Send responses&rdquo;</li>
                </ol>
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? 'Registrando...' : 'Registrar Formulario'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty state */}
      {forms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay formularios registrados</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
              Conecta formularios de Tally.so con tu CRM. Las submissions crearán leads automáticamente en tu pipeline de ventas.
            </p>
            <Button onClick={() => setShowNewFormDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Registrar Primer Formulario
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Formularios Registrados</CardTitle>
            <CardDescription>
              {forms.length} formulario{forms.length !== 1 ? 's' : ''} conectado{forms.length !== 1 ? 's' : ''} con Tally
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tally Form ID</TableHead>
                  <TableHead>Submissions</TableHead>
                  <TableHead>Landing Page</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form) => {
                  const tallyFormId = form.config?.tallyFormId || ''
                  return (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium">{form.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {tallyFormId}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {form._count?.submissions || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {form.page ? (
                          <span className="text-sm truncate max-w-[150px] block">
                            {form.page.titulo}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(form.createdAt).toLocaleDateString('es-MX')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open(getTallyFormUrl(tallyFormId), '_blank')}
                            title="Abrir formulario en Tally"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => copyToClipboard(getTallyEmbedCode(tallyFormId), 'Código embed')}
                            title="Copiar código embed"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteForm(form.id, form.name)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Instructions card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            ¿Cómo funciona?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span><strong>1. Crea un formulario</strong> en <a href="https://tally.so" target="_blank" rel="noopener noreferrer" className="text-primary underline">Tally.so</a> (gratis, sin límites)</span>
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span><strong>2. Regístralo aquí</strong> con el Tally Form ID</span>
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span><strong>3. Configura el webhook</strong> en Tally apuntando a <code className="bg-muted px-1 rounded text-xs">{window.location.origin}/api/webhooks/tally</code></span>
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span><strong>4. Embebe el form</strong> en tus landing pages del CMS usando el código embed o el componente TallyEmbed</span>
          </p>
          <p className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <span>Cada submission crea automáticamente un <strong>Lead</strong> en el CRM con los datos del formulario</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
