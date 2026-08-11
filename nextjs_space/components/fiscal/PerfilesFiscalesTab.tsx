'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, User, Building, CheckCircle2, AlertCircle } from 'lucide-react';

interface PerfilFiscal {
  id: string;
  leadId: string | null;
  contactId: string | null;
  // Support both frontend and API field names
  identificadorFiscal?: string;
  idFiscal?: string;
  tipoIdentificador?: string;
  tipoIdFiscal?: string;
  razonSocial: string;
  regimenFiscal: string | null;
  pais: string;
  direccionFiscal: string | null;
  codigoPostal?: string | null;
  codigoPostalFiscal?: string | null;
  ciudad?: string | null;
  ciudadFiscal?: string | null;
  estadoProvincia?: string | null;
  estadoFiscal?: string | null;
  esExentoImpuestos?: boolean;
  exentoImpuestos?: boolean;
  idIntracomunitario: string | null;
  lead?: { nombre: string; email: string };
  contact?: { nombre: string; email: string };
}

interface Lead {
  id: string;
  nombre: string;
  email: string;
}

interface Contact {
  id: string;
  nombre: string;
  email: string;
}

const PAISES = [
  { code: 'ES', name: 'España', idType: 'CIF/NIF' },
  { code: 'MX', name: 'México', idType: 'RFC' },
  { code: 'US', name: 'Estados Unidos', idType: 'EIN' },
  { code: 'CL', name: 'Chile', idType: 'RUT' },
  { code: 'AR', name: 'Argentina', idType: 'CUIT' },
  { code: 'CO', name: 'Colombia', idType: 'NIT' },
  { code: 'PE', name: 'Perú', idType: 'RUC' },
  { code: 'BR', name: 'Brasil', idType: 'CNPJ' },
  { code: 'GB', name: 'Reino Unido', idType: 'VAT' },
  { code: 'DE', name: 'Alemania', idType: 'USt-IdNr' },
  { code: 'FR', name: 'Francia', idType: 'SIREN' }
];

interface Props {
  onUpdate: () => void;
}

export default function PerfilesFiscalesTab({ onUpdate }: Props) {
  const [perfiles, setPerfiles] = useState<PerfilFiscal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState<PerfilFiscal | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [validating, setValidating] = useState(false);

  const [formData, setFormData] = useState({
    entityType: 'lead' as 'lead' | 'contact',
    leadId: '',
    contactId: '',
    identificadorFiscal: '',
    tipoIdentificador: 'CIF/NIF',
    razonSocial: '',
    nombreComercial: '',
    regimenFiscal: '',
    pais: 'ES',
    direccionFiscal: '',
    codigoPostal: '',
    ciudad: '',
    estadoProvincia: '',
    esExentoImpuestos: false,
    idIntracomunitario: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const paisConfig = PAISES.find(p => p.code === formData.pais);
    if (paisConfig) {
      setFormData(prev => ({ ...prev, tipoIdentificador: paisConfig.idType }));
    }
    setValidationResult(null);
  }, [formData.pais]);

  const fetchData = async () => {
    try {
      const [perfilesRes, leadsRes, contactsRes] = await Promise.all([
        fetch('/api/configuracion/fiscal/perfiles'),
        fetch('/api/leads?limit=1000'),
        fetch('/api/contacts?limit=1000')
      ]);

      if (perfilesRes.ok) {
        const data = await perfilesRes.json();
        setPerfiles(data.perfiles || []);
      }
      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setLeads(data.leads || data);
      }
      if (contactsRes.ok) {
        const data = await contactsRes.json();
        setContacts(data.contacts || data);
      }
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const validateFiscalId = async () => {
    if (!formData.identificadorFiscal || !formData.pais) return;

    setValidating(true);
    try {
      const res = await fetch('/api/configuracion/fiscal/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validateId',
          pais: formData.pais,
          identificador: formData.identificadorFiscal
        })
      });

      const data = await res.json();
      setValidationResult({
        valid: data.valid,
        message: data.valid ? 'Identificador válido' : data.error || 'Formato inválido'
      });
    } catch (error) {
      setValidationResult({ valid: false, message: 'Error de validación' });
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.identificadorFiscal || !formData.razonSocial) {
      toast.error('Identificador fiscal y razón social son requeridos');
      return;
    }

    if (formData.entityType === 'lead' && !formData.leadId) {
      toast.error('Selecciona un lead');
      return;
    }
    if (formData.entityType === 'contact' && !formData.contactId) {
      toast.error('Selecciona un contacto');
      return;
    }

    try {
      const url = editingPerfil
        ? `/api/configuracion/fiscal/perfiles/${editingPerfil.id}`
        : '/api/configuracion/fiscal/perfiles';
      const method = editingPerfil ? 'PATCH' : 'POST';

      // Map frontend field names to API/schema field names
      const payload = {
        leadId: formData.entityType === 'lead' ? formData.leadId : null,
        contactId: formData.entityType === 'contact' ? formData.contactId : null,
        idFiscal: formData.identificadorFiscal,
        tipoIdFiscal: formData.tipoIdentificador,
        razonSocial: formData.razonSocial,
        regimenFiscal: formData.regimenFiscal || null,
        pais: formData.pais,
        direccionFiscal: formData.direccionFiscal || null,
        codigoPostalFiscal: formData.codigoPostal || null,
        ciudadFiscal: formData.ciudad || null,
        estadoFiscal: formData.estadoProvincia || null,
        exentoImpuestos: formData.esExentoImpuestos,
        idIntracomunitario: formData.idIntracomunitario || null
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingPerfil ? 'Perfil actualizado' : 'Perfil creado');
        setDialogOpen(false);
        resetForm();
        fetchData();
        onUpdate();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este perfil fiscal?')) return;

    try {
      const res = await fetch(`/api/configuracion/fiscal/perfiles/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('Perfil eliminado');
        fetchData();
        onUpdate();
      } else {
        toast.error('Error al eliminar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleEdit = (perfil: PerfilFiscal) => {
    setEditingPerfil(perfil);
    // Map API field names to frontend form field names
    setFormData({
      entityType: perfil.leadId ? 'lead' : 'contact',
      leadId: perfil.leadId || '',
      contactId: perfil.contactId || '',
      identificadorFiscal: perfil.idFiscal || perfil.identificadorFiscal || '',
      tipoIdentificador: perfil.tipoIdFiscal || perfil.tipoIdentificador || 'RFC',
      razonSocial: perfil.razonSocial || '',
      nombreComercial: '',
      regimenFiscal: perfil.regimenFiscal || '',
      pais: perfil.pais || 'MX',
      direccionFiscal: perfil.direccionFiscal || '',
      codigoPostal: perfil.codigoPostalFiscal || perfil.codigoPostal || '',
      ciudad: perfil.ciudadFiscal || perfil.ciudad || '',
      estadoProvincia: perfil.estadoFiscal || perfil.estadoProvincia || '',
      esExentoImpuestos: perfil.exentoImpuestos || perfil.esExentoImpuestos || false,
      idIntracomunitario: perfil.idIntracomunitario || ''
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingPerfil(null);
    setValidationResult(null);
    setFormData({
      entityType: 'lead',
      leadId: '',
      contactId: '',
      identificadorFiscal: '',
      tipoIdentificador: 'CIF/NIF',
      razonSocial: '',
      nombreComercial: '',
      regimenFiscal: '',
      pais: 'ES',
      direccionFiscal: '',
      codigoPostal: '',
      ciudad: '',
      estadoProvincia: '',
      esExentoImpuestos: false,
      idIntracomunitario: ''
    });
  };

  const getPaisName = (code: string) => PAISES.find(p => p.code === code)?.name || code;

  const filteredPerfiles = perfiles.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    const idFiscal = p.idFiscal || p.identificadorFiscal || '';
    return p.razonSocial?.toLowerCase().includes(searchLower) ||
           idFiscal.toLowerCase().includes(searchLower) ||
           p.lead?.nombre.toLowerCase().includes(searchLower) ||
           p.contact?.nombre.toLowerCase().includes(searchLower);
  });

  const isEUCountry = (code: string) => ['ES', 'DE', 'FR', 'IT', 'PT', 'GB'].includes(code);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Perfiles Fiscales de Clientes</CardTitle>
            <CardDescription>
              Configura los datos fiscales de leads y contactos para facturación
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Perfil
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{editingPerfil ? 'Editar Perfil' : 'Nuevo Perfil Fiscal'}</DialogTitle>
                <DialogDescription>
                  Configura los datos fiscales del cliente para facturación
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2">
                  <h4 className="font-medium mb-3 text-sm text-muted-foreground">Asociar a</h4>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Entidad</Label>
                  <Select 
                    value={formData.entityType} 
                    onValueChange={(v: 'lead' | 'contact') => setFormData({ ...formData, entityType: v, leadId: '', contactId: '' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contacto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.entityType === 'lead' ? (
                  <div className="space-y-2">
                    <Label>Lead *</Label>
                    <Select value={formData.leadId} onValueChange={(v) => setFormData({ ...formData, leadId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar lead" />
                      </SelectTrigger>
                      <SelectContent>
                        {leads.map(l => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.nombre} ({l.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Contacto *</Label>
                    <Select value={formData.contactId} onValueChange={(v) => setFormData({ ...formData, contactId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar contacto" />
                      </SelectTrigger>
                      <SelectContent>
                        {contacts.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nombre} ({c.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="col-span-2 border-t pt-4 mt-2">
                  <h4 className="font-medium mb-3 text-sm text-muted-foreground">Datos Fiscales</h4>
                </div>

                <div className="space-y-2">
                  <Label>País</Label>
                  <Select value={formData.pais} onValueChange={(v) => setFormData({ ...formData, pais: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAISES.map(p => (
                        <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{formData.tipoIdentificador} *</Label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.identificadorFiscal}
                      onChange={(e) => {
                        setFormData({ ...formData, identificadorFiscal: e.target.value.toUpperCase() });
                        setValidationResult(null);
                      }}
                      placeholder={formData.pais === 'MX' ? 'XAXX010101000' : formData.pais === 'ES' ? 'B12345678' : 'Identificador fiscal'}
                      className="flex-1"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={validateFiscalId}
                      disabled={validating || !formData.identificadorFiscal}
                    >
                      {validating ? '...' : 'Validar'}
                    </Button>
                  </div>
                  {validationResult && (
                    <p className={`text-xs flex items-center gap-1 ${validationResult.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {validationResult.valid ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                      {validationResult.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Razón Social *</Label>
                  <Input
                    value={formData.razonSocial}
                    onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                    placeholder="Nombre legal del cliente"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Nombre Comercial</Label>
                  <Input
                    value={formData.nombreComercial}
                    onChange={(e) => setFormData({ ...formData, nombreComercial: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Régimen Fiscal</Label>
                  <Input
                    value={formData.regimenFiscal}
                    onChange={(e) => setFormData({ ...formData, regimenFiscal: e.target.value })}
                    placeholder="Régimen fiscal aplicable"
                  />
                </div>

                {isEUCountry(formData.pais) && (
                  <div className="space-y-2">
                    <Label>ID Intracomunitario (VAT)</Label>
                    <Input
                      value={formData.idIntracomunitario}
                      onChange={(e) => setFormData({ ...formData, idIntracomunitario: e.target.value.toUpperCase() })}
                      placeholder="ES12345678X"
                    />
                  </div>
                )}

                <div className="col-span-2 border-t pt-4 mt-2">
                  <h4 className="font-medium mb-3 text-sm text-muted-foreground">Dirección Fiscal</h4>
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Dirección</Label>
                  <Textarea
                    value={formData.direccionFiscal}
                    onChange={(e) => setFormData({ ...formData, direccionFiscal: e.target.value })}
                    placeholder="Calle, número, colonia..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ciudad</Label>
                  <Input
                    value={formData.ciudad}
                    onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Estado/Provincia</Label>
                  <Input
                    value={formData.estadoProvincia}
                    onChange={(e) => setFormData({ ...formData, estadoProvincia: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Código Postal</Label>
                  <Input
                    value={formData.codigoPostal}
                    onChange={(e) => setFormData({ ...formData, codigoPostal: e.target.value })}
                  />
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <Switch
                    checked={formData.esExentoImpuestos}
                    onCheckedChange={(checked) => setFormData({ ...formData, esExentoImpuestos: checked })}
                  />
                  <Label>Exento de Impuestos</Label>
                </div>
              </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit}>
                  {editingPerfil ? 'Actualizar' : 'Crear'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, razón social o identificador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Razón Social</TableHead>
                <TableHead>Identificador</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : filteredPerfiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No hay perfiles fiscales configurados
                  </TableCell>
                </TableRow>
              ) : (
                filteredPerfiles.map((perfil) => (
                  <TableRow key={perfil.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {perfil.lead ? (
                          <>
                            <User className="h-4 w-4 text-blue-500" />
                            <div>
                              <p className="font-medium">{perfil.lead.nombre}</p>
                              <p className="text-xs text-muted-foreground">{perfil.lead.email}</p>
                            </div>
                          </>
                        ) : perfil.contact ? (
                          <>
                            <Building className="h-4 w-4 text-green-500" />
                            <div>
                              <p className="font-medium">{perfil.contact.nombre}</p>
                              <p className="text-xs text-muted-foreground">{perfil.contact.email}</p>
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sin asociar</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{perfil.razonSocial}</p>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {perfil.tipoIdFiscal || perfil.tipoIdentificador}: {perfil.idFiscal || perfil.identificadorFiscal}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getPaisName(perfil.pais)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(perfil.exentoImpuestos || perfil.esExentoImpuestos) && (
                          <Badge variant="secondary" className="text-xs">Exento</Badge>
                        )}
                        {perfil.idIntracomunitario && (
                          <Badge variant="secondary" className="text-xs">UE</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(perfil)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(perfil.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
