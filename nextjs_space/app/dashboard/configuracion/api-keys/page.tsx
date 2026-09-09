'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Power,
  PowerOff,
  AlertCircle,
  CheckCircle2,
  Code,
  ExternalLink,
  Loader2,
  Calendar,
  Shield
} from 'lucide-react';
import { AVAILABLE_SCOPES } from '@/lib/api-keys';

interface OpenApiEndpoint {
  method: string;
  path: string;
  summary?: string;
  tag?: string;
  scopes: string[];
}

interface ApiKey {
  id: string;
  nombre: string;
  descripcion: string | null;
  prefix: string;
  scopes: string[];
  activo: boolean;
  expiraEn: Date | null;
  ultimoUso: Date | null;
  totalUsos: number;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [endpoints, setEndpoints] = useState<OpenApiEndpoint[] | null>(null);
  const [endpointsLoading, setEndpointsLoading] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    scopes: [] as string[],
    expiraEn: ''
  });  useEffect(() => {
    fetchApiKeys();
    fetchEndpoints();
  }, []);

  // Carga los endpoints DERIVADOS del spec OpenAPI (fuente única de verdad que
  // alimenta también /api/docs y /api/openapi.json). Si el spec cambia, la
  // tabla se actualiza sola — no hay lista estática que mantener.
  const fetchEndpoints = async () => {
    try {
      setEndpointsLoading(true);
      const res = await fetch('/api/openapi/endpoints');
      if (res.ok) {
        const data = await res.json();
        setEndpoints(data.endpoints || []);
      } else {
        setEndpoints([]);
      }
    } catch (err) {
      console.error('Error al cargar endpoints:', err);
      setEndpoints([]);
    } finally {
      setEndpointsLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/api-keys');
      const data = await response.json();
      
      if (response.ok) {
        setApiKeys(data.apiKeys);
      } else {
        toast.error('Error al cargar API keys');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      if (!formData.nombre) {
        toast.error('El nombre es requerido');
        return;
      }

      if (formData.scopes.length === 0) {
        toast.error('Debe seleccionar al menos un scope');
        return;
      }

      setCreatingKey(true);
      
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          expiraEn: formData.expiraEn || undefined
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('API key creada exitosamente');
        setNewlyCreatedKey(data.apiKey.key);
        setNewKeyDialogOpen(true);
        setDialogOpen(false);
        resetForm();
        fetchApiKeys();
      } else {
        toast.error(data.error || 'Error al crear API key');
        console.error('Error del servidor:', data);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar la API key "${nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/api-keys/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('API key eliminada');
        fetchApiKeys();
      } else {
        toast.error('Error al eliminar API key');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar API key');
    }
  };

  const handleToggleActive = async (apiKey: ApiKey) => {
    try {
      const response = await fetch(`/api/api-keys/${apiKey.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !apiKey.activo })
      });

      if (response.ok) {
        toast.success(apiKey.activo ? 'API key desactivada' : 'API key activada');
        fetchApiKeys();
      } else {
        toast.error('Error al actualizar API key');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al actualizar API key');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copiado al portapapeles');
    
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      descripcion: '',
      scopes: [],
      expiraEn: ''
    });
  };

  const toggleScope = (scope: string) => {
    setFormData(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter(s => s !== scope)
        : [...prev.scopes, scope]
    }));
  };

  const selectAllScopes = () => {
    setFormData(prev => ({
      ...prev,
      scopes: [...AVAILABLE_SCOPES]
    }));
  };

  const clearAllScopes = () => {
    setFormData(prev => ({
      ...prev,
      scopes: []
    }));
  };

  const getScopeCategory = (scope: string) => {
    return scope.split(':')[0];
  };

  const groupedScopes = AVAILABLE_SCOPES.reduce((acc, scope) => {
    const category = getScopeCategory(scope);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(scope);
    return acc;
  }, {} as Record<string, string[]>);

  const formatDate = (date: Date | null) => {
    if (!date) return 'Nunca';
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isExpired = (expiraEn: Date | null) => {
    if (!expiraEn) return false;
    return new Date(expiraEn) < new Date();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las claves de API para integraciones externas
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva API Key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Nueva API Key</DialogTitle>
              <DialogDescription>
                Genera una nueva clave de API con permisos específicos
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Nombre */}
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  placeholder="Ej: Integración n8n, Webhook Zapier"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>

              {/* Descripción */}
              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea
                  id="descripcion"
                  placeholder="Describe el uso de esta API key"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={3}
                />
              </div>

              {/* Fecha de expiración */}
              <div className="space-y-2">
                <Label htmlFor="expiraEn">Fecha de Expiración (Opcional)</Label>
                <Input
                  id="expiraEn"
                  type="datetime-local"
                  value={formData.expiraEn}
                  onChange={(e) => setFormData({ ...formData, expiraEn: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">
                  Si no se especifica, la clave no expirará
                </p>
              </div>

              {/* Scopes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Permisos (Scopes) *</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectAllScopes}
                    >
                      Seleccionar Todos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearAllScopes}
                    >
                      Limpiar
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-lg p-4 max-h-96 overflow-y-auto">
                  {Object.entries(groupedScopes).map(([category, scopes]) => (
                    <div key={category} className="space-y-2">
                      <h4 className="font-semibold text-sm capitalize">{category}</h4>
                      {scopes.map((scope) => (
                        <div key={scope} className="flex items-center space-x-2">
                          <Checkbox
                            id={scope}
                            checked={formData.scopes.includes(scope)}
                            onCheckedChange={() => toggleScope(scope)}
                          />
                          <label
                            htmlFor={scope}
                            className="text-sm font-mono cursor-pointer"
                          >
                            {scope}
                          </label>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <p className="text-sm text-muted-foreground">
                  Seleccionados: {formData.scopes.length} de {AVAILABLE_SCOPES.length}
                </p>
              </div>

              {/* Security Warning */}
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  <strong>Importante:</strong> La API key solo se mostrará una vez.
                  Guárdala en un lugar seguro.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creatingKey}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={creatingKey}>
                {creatingKey ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  'Crear API Key'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* New Key Display Dialog */}
      <Dialog open={newKeyDialogOpen} onOpenChange={setNewKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>✅ API Key Creada Exitosamente</DialogTitle>
            <DialogDescription>
              Guarda esta clave en un lugar seguro. No podrás verla de nuevo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Esta es la única vez que verás la API key completa.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Tu Nueva API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={newlyCreatedKey || ''}
                  readOnly
                  type={showKey ? 'text' : 'password'}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => newlyCreatedKey && copyToClipboard(newlyCreatedKey, 'new-key')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h4 className="font-semibold text-sm">Uso con cURL:</h4>
              <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                {`curl -X GET https://volkern.app/api/leads \\
  -H "X-API-Key: ${newlyCreatedKey?.substring(0, 20)}..." \\
  -H "Content-Type: application/json"`}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => {
              setNewKeyDialogOpen(false);
              setNewlyCreatedKey(null);
            }}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Keys List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : apiKeys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay API keys configuradas</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crea tu primera API key para comenzar a integrar con herramientas externas
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Primera API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {apiKeys.map((apiKey) => (
            <Card key={apiKey.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{apiKey.nombre}</CardTitle>
                      {apiKey.activo ? (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          Inactiva
                        </Badge>
                      )}
                      {isExpired(apiKey.expiraEn) && (
                        <Badge variant="destructive">
                          Expirada
                        </Badge>
                      )}
                    </div>
                    {apiKey.descripcion && (
                      <CardDescription>{apiKey.descripcion}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleToggleActive(apiKey)}
                      title={apiKey.activo ? 'Desactivar' : 'Activar'}
                    >
                      {apiKey.activo ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDelete(apiKey.id, apiKey.nombre)}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  {/* Prefix */}
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Prefijo</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {apiKey.prefix}...
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(apiKey.prefix, apiKey.id)}
                      >
                        {copiedId === apiKey.id ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Último uso */}
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Último Uso</p>
                    <p className="text-sm font-medium">{formatDate(apiKey.ultimoUso)}</p>
                  </div>

                  {/* Total usos */}
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Usos</p>
                    <p className="text-sm font-medium">{apiKey.totalUsos.toLocaleString()}</p>
                  </div>

                  {/* Expiración */}
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Expira</p>
                    <p className={`text-sm font-medium ${
                      isExpired(apiKey.expiraEn) ? 'text-destructive' : ''
                    }`}>
                      {apiKey.expiraEn ? formatDate(apiKey.expiraEn) : 'Sin expiración'}
                    </p>
                  </div>
                </div>

                {/* Scopes */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Permisos ({apiKey.scopes.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {apiKey.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="font-mono text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Created by */}
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Creada por {apiKey.user.name || apiKey.user.email} el {formatDate(apiKey.createdAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Documentation Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Documentación de Uso
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('/api/docs', '_blank')}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                API Docs interactiva (Swagger)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('/api/partner', '_blank')}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Partner API v1 (guía completa)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open('/openapi.json', '_blank')}
                className="flex items-center gap-2"
              >
                <Code className="h-4 w-4" />
                Descargar spec JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Autenticación con API Key</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Puedes usar tu API key de dos formas:
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium">1. Header X-API-Key (Recomendado)</p>
                <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
{`curl -X GET https://volkern.app/api/leads \\
  -H "X-API-Key: vk_prod_your_key_here" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
              <div>
                <p className="text-sm font-medium">2. Authorization Bearer</p>
                <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
{`curl -X GET https://volkern.app/api/leads \\
  -H "Authorization: Bearer vk_prod_your_key_here" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Endpoints Disponibles</h4>
              <p className="text-xs text-muted-foreground">
                Tabla generada desde el spec OpenAPI ({endpoints?.length ?? '—'} endpoints con API Key)
              </p>
            </div>

            {endpointsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !endpoints || endpoints.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
                No se pudieron cargar los endpoints. Abre la{' '}
                <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                  documentación interactiva
                </a>{' '}
                para verlos todos.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[480px] overflow-auto">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0">
                      <TableRow>
                        <TableHead className="w-20 text-xs font-semibold">Método</TableHead>
                        <TableHead className="text-xs font-semibold">Endpoint</TableHead>
                        <TableHead className="hidden md:table-cell text-xs font-semibold">Descripción</TableHead>
                        <TableHead className="text-xs font-semibold">Scopes requeridos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {endpoints.map((ep) => (
                        <TableRow key={`${ep.method}-${ep.path}`} className="hover:bg-muted/30">
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`font-mono text-[10px] px-2 py-0.5 border ${
                                ep.method === 'GET'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : ep.method === 'POST'
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : ep.method === 'DELETE'
                                  ? 'border-red-200 bg-red-50 text-red-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}
                            >
                              {ep.method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs font-mono break-all">{ep.path}</code>
                            {ep.tag && (
                              <span className="ml-2 hidden lg:inline text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                {ep.tag}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {ep.summary || '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {ep.scopes && ep.scopes.length > 0 ? (
                                ep.scopes.map((scope) => (
                                  <Badge key={scope} variant="secondary" className="font-mono text-[10px]">
                                    {scope}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-[10px] text-muted-foreground">según permisos</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-2">
              La tabla se genera automáticamente desde la especificación OpenAPI. Para ejemplos,
              parámetros y respuestas de cada endpoint, abre la{' '}
              <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                documentación interactiva (Swagger)
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
