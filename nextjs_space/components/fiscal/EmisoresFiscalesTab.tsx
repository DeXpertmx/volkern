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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Building2, Star, MapPin, Phone, Mail } from 'lucide-react';

interface Emisor {
  id: string;
  razonSocial: string;
  nombreComercial: string | null;
  // Support both frontend and API field names
  identificadorFiscal?: string;
  idFiscal?: string;
  tipoIdentificador?: string;
  tipoIdFiscal?: string;
  regimenFiscal: string | null;
  pais: string;
  direccionFiscal?: string | null;
  direccion?: string | null;
  codigoPostal: string | null;
  ciudad: string | null;
  estadoProvincia: string | null;
  telefono: string | null;
  email: string | null;
  monedaPorDefecto?: string;
  monedaPredeterminada?: string;
  serieFactura: string | null;
  esPrincipal: boolean;
  activo: boolean;
}

const PAISES = [
  { code: 'MX', name: 'México', idType: 'RFC', regime: ['General de Ley', 'Personas Físicas', 'Régimen Simplificado de Confianza'] },
  { code: 'ES', name: 'España', idType: 'CIF/NIF', regime: ['General', 'Simplificado', 'Recargo de Equivalencia'] },
  { code: 'US', name: 'Estados Unidos', idType: 'EIN', regime: ['Corporation', 'LLC', 'Sole Proprietorship'] },
  { code: 'CL', name: 'Chile', idType: 'RUT', regime: ['Primera Categoría', 'Pyme', 'Pro Pyme'] },
  { code: 'AR', name: 'Argentina', idType: 'CUIT', regime: ['Responsable Inscripto', 'Monotributo', 'Exento'] },
  { code: 'CO', name: 'Colombia', idType: 'NIT', regime: ['Ordinario', 'Simple', 'Especial'] },
  { code: 'PE', name: 'Perú', idType: 'RUC', regime: ['General', 'MYPE', 'RUS'] }
];

const MONEDAS = [
  { code: 'MXN', symbol: '$', name: 'Peso Mexicano' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'Dólar Estadounidense' },
  { code: 'CLP', symbol: '$', name: 'Peso Chileno' },
  { code: 'ARS', symbol: '$', name: 'Peso Argentino' },
  { code: 'COP', symbol: '$', name: 'Peso Colombiano' },
  { code: 'PEN', symbol: 'S/', name: 'Sol Peruano' },
  { code: 'GBP', symbol: '£', name: 'Libra Esterlina' }
];

interface Props {
  onUpdate: () => void;
}

export default function EmisoresFiscalesTab({ onUpdate }: Props) {
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmisor, setEditingEmisor] = useState<Emisor | null>(null);

  const [formData, setFormData] = useState({
    razonSocial: '',
    nombreComercial: '',
    identificadorFiscal: '',
    tipoIdentificador: 'RFC',
    regimenFiscal: '',
    pais: 'MX',
    direccionFiscal: '',
    codigoPostal: '',
    ciudad: '',
    estadoProvincia: '',
    telefono: '',
    email: '',
    monedaPorDefecto: 'MXN',
    serieFactura: '',
    esPrincipal: false,
    activo: true
  });

  useEffect(() => {
    fetchEmisores();
  }, []);

  useEffect(() => {
    const paisConfig = PAISES.find(p => p.code === formData.pais);
    if (paisConfig) {
      setFormData(prev => ({
        ...prev,
        tipoIdentificador: paisConfig.idType,
        monedaPorDefecto: MONEDAS.find(m => 
          (formData.pais === 'MX' && m.code === 'MXN') ||
          (formData.pais === 'ES' && m.code === 'EUR') ||
          (formData.pais === 'US' && m.code === 'USD') ||
          (formData.pais === 'CL' && m.code === 'CLP') ||
          (formData.pais === 'AR' && m.code === 'ARS') ||
          (formData.pais === 'CO' && m.code === 'COP') ||
          (formData.pais === 'PE' && m.code === 'PEN')
        )?.code || prev.monedaPorDefecto
      }));
    }
  }, [formData.pais]);

  const fetchEmisores = async () => {
    try {
      const res = await fetch('/api/configuracion/fiscal/emisores');
      if (res.ok) {
        const data = await res.json();
        setEmisores(data.emisores || []);
      }
    } catch (error) {
      toast.error('Error al cargar emisores');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.razonSocial || !formData.identificadorFiscal) {
      toast.error('Razón social e identificador fiscal son requeridos');
      return;
    }

    try {
      const url = editingEmisor
        ? `/api/configuracion/fiscal/emisores/${editingEmisor.id}`
        : '/api/configuracion/fiscal/emisores';
      const method = editingEmisor ? 'PATCH' : 'POST';

      // Map frontend field names to API/schema field names
      const payload = {
        razonSocial: formData.razonSocial,
        nombreComercial: formData.nombreComercial || null,
        pais: formData.pais,
        tipoIdFiscal: formData.tipoIdentificador,
        idFiscal: formData.identificadorFiscal,
        regimenFiscal: formData.regimenFiscal || null,
        direccion: formData.direccionFiscal || '',
        ciudad: formData.ciudad || '',
        estadoProvincia: formData.estadoProvincia || null,
        codigoPostal: formData.codigoPostal || '',
        telefono: formData.telefono || null,
        email: formData.email || '',
        monedaPredeterminada: formData.monedaPorDefecto,
        serieFactura: formData.serieFactura || 'F',
        esPrincipal: formData.esPrincipal,
        activo: formData.activo
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingEmisor ? 'Emisor actualizado' : 'Emisor creado');
        setDialogOpen(false);
        resetForm();
        fetchEmisores();
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
    if (!confirm('¿Eliminar este emisor fiscal?')) return;

    try {
      const res = await fetch(`/api/configuracion/fiscal/emisores/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('Emisor eliminado');
        fetchEmisores();
        onUpdate();
      } else {
        toast.error('Error al eliminar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleEdit = (emisor: any) => {
    setEditingEmisor(emisor);
    // Map API field names to frontend form field names
    setFormData({
      razonSocial: emisor.razonSocial || '',
      nombreComercial: emisor.nombreComercial || '',
      identificadorFiscal: emisor.idFiscal || emisor.identificadorFiscal || '',
      tipoIdentificador: emisor.tipoIdFiscal || emisor.tipoIdentificador || 'RFC',
      regimenFiscal: emisor.regimenFiscal || '',
      pais: emisor.pais || 'MX',
      direccionFiscal: emisor.direccion || emisor.direccionFiscal || '',
      codigoPostal: emisor.codigoPostal || '',
      ciudad: emisor.ciudad || '',
      estadoProvincia: emisor.estadoProvincia || '',
      telefono: emisor.telefono || '',
      email: emisor.email || '',
      monedaPorDefecto: emisor.monedaPredeterminada || emisor.monedaPorDefecto || 'MXN',
      serieFactura: emisor.serieFactura || '',
      esPrincipal: emisor.esPrincipal || false,
      activo: emisor.activo !== false
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingEmisor(null);
    setFormData({
      razonSocial: '',
      nombreComercial: '',
      identificadorFiscal: '',
      tipoIdentificador: 'RFC',
      regimenFiscal: '',
      pais: 'MX',
      direccionFiscal: '',
      codigoPostal: '',
      ciudad: '',
      estadoProvincia: '',
      telefono: '',
      email: '',
      monedaPorDefecto: 'MXN',
      serieFactura: '',
      esPrincipal: false,
      activo: true
    });
  };

  const getPaisName = (code: string) => PAISES.find(p => p.code === code)?.name || code;
  const getRegimenes = () => PAISES.find(p => p.code === formData.pais)?.regime || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Entidades Emisoras</CardTitle>
            <CardDescription>
              Configura las entidades legales que emitirán facturas y documentos fiscales
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Emisor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingEmisor ? 'Editar Emisor' : 'Nueva Entidad Emisora'}</DialogTitle>
                <DialogDescription>
                  Configura los datos fiscales de la entidad que emitirá facturas
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2">
                  <h4 className="font-medium mb-3 text-sm text-muted-foreground">Datos Generales</h4>
                </div>

                <div className="space-y-2">
                  <Label>Razón Social *</Label>
                  <Input
                    value={formData.razonSocial}
                    onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                    placeholder="Mi Empresa S.A. de C.V."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Nombre Comercial</Label>
                  <Input
                    value={formData.nombreComercial}
                    onChange={(e) => setFormData({ ...formData, nombreComercial: e.target.value })}
                    placeholder="Mi Marca"
                  />
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
                  <Input
                    value={formData.identificadorFiscal}
                    onChange={(e) => setFormData({ ...formData, identificadorFiscal: e.target.value.toUpperCase() })}
                    placeholder={formData.pais === 'MX' ? 'XAXX010101000' : 'Identificador fiscal'}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Régimen Fiscal</Label>
                  <Select value={formData.regimenFiscal} onValueChange={(v) => setFormData({ ...formData, regimenFiscal: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar régimen" />
                    </SelectTrigger>
                    <SelectContent>
                      {getRegimenes().map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Moneda por Defecto</Label>
                  <Select value={formData.monedaPorDefecto} onValueChange={(v) => setFormData({ ...formData, monedaPorDefecto: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONEDAS.map(m => (
                        <SelectItem key={m.code} value={m.code}>{m.code} - {m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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

                <div className="space-y-2">
                  <Label>Serie de Factura</Label>
                  <Input
                    value={formData.serieFactura}
                    onChange={(e) => setFormData({ ...formData, serieFactura: e.target.value.toUpperCase() })}
                    placeholder="A, B, FAC..."
                  />
                </div>

                <div className="col-span-2 border-t pt-4 mt-2">
                  <h4 className="font-medium mb-3 text-sm text-muted-foreground">Contacto</h4>
                </div>

                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="+52 55 1234 5678"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="facturacion@miempresa.com"
                  />
                </div>

                <div className="col-span-2 flex items-center gap-6 pt-4 border-t mt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.esPrincipal}
                      onCheckedChange={(checked) => setFormData({ ...formData, esPrincipal: checked })}
                    />
                    <Label>Emisor Principal</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.activo}
                      onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
                    />
                    <Label>Activo</Label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit}>
                  {editingEmisor ? 'Actualizar' : 'Crear'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : emisores.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay emisores fiscales configurados</p>
            <p className="text-sm">Crea tu primera entidad emisora para generar facturas</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {emisores.map((emisor) => (
              <Card key={emisor.id} className={`relative ${emisor.esPrincipal ? 'ring-2 ring-primary' : ''}`}>
                {emisor.esPrincipal && (
                  <div className="absolute -top-2 -right-2">
                    <Badge className="bg-primary">
                      <Star className="h-3 w-3 mr-1" />
                      Principal
                    </Badge>
                  </div>
                )}
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{emisor.nombreComercial || emisor.razonSocial}</h3>
                      {emisor.nombreComercial && (
                        <p className="text-sm text-muted-foreground">{emisor.razonSocial}</p>
                      )}
                      <div className="mt-2 space-y-1">
                        <p className="text-sm">
                          <span className="font-medium">{emisor.tipoIdFiscal || emisor.tipoIdentificador}:</span> {emisor.idFiscal || emisor.identificadorFiscal}
                        </p>
                        {emisor.regimenFiscal && (
                          <p className="text-sm text-muted-foreground">{emisor.regimenFiscal}</p>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Badge variant="outline">{getPaisName(emisor.pais)}</Badge>
                        <Badge variant="outline">{emisor.monedaPredeterminada || emisor.monedaPorDefecto}</Badge>
                        <Badge variant={emisor.activo ? 'default' : 'secondary'}>
                          {emisor.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      {(emisor.ciudad || emisor.telefono || emisor.email) && (
                        <div className="mt-3 pt-3 border-t text-sm text-muted-foreground space-y-1">
                          {emisor.ciudad && (
                            <p className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {emisor.ciudad}{emisor.estadoProvincia ? `, ${emisor.estadoProvincia}` : ''}
                            </p>
                          )}
                          {emisor.telefono && (
                            <p className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {emisor.telefono}
                            </p>
                          )}
                          {emisor.email && (
                            <p className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {emisor.email}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(emisor)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(emisor.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
