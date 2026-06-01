'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Plus, Trash2, Receipt, FileText, ShieldCheck,
  CheckCircle2, Clock, AlertCircle, User,
  Building2, Mail, MapPin, Hash, Search,
  Package, Briefcase, Loader2, X,
  Percent
} from 'lucide-react';

/* ──────────────────────────────────────────────
   Tipos
   ────────────────────────────────────────────── */

interface TasaImpuestoResult {
  id: string;
  nombre: string;
  codigo: string;
  porcentaje: number;
  tipo: string;
}

interface CatalogoItemResult {
  id: string;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  tipo: string;
  precioBase: number;
  moneda: string;
  tasaImpuesto?: TasaImpuestoResult | null;
}

interface ContactResult {
  id: string;
  nombre: string;
  email: string;
  telefono?: string | null;
  tipo: string;
  ubicacion?: string | null;
  company?: { id: string; nombre: string } | null;
  perfilFiscal?: {
    nif: string;
    direccionFiscal?: string;
    ciudadFiscal?: string;
    razonSocial?: string;
    pais?: string;
    tipoIdFiscal?: string;
  } | null;
}

interface InvoiceLineItem {
  id: string;
  catalogoItemId?: string;
  concepto: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;         // % descuento aplicado a este concepto
  tasaImpuestoId?: string;
  tasaImpuestoPorcentaje: number;
  tasaImpuestoNombre: string;
}

interface ManualInvoiceModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

/* ──────────────────────────────────────────────
   Selector de Contacto (inline, con datos fiscales)
   ────────────────────────────────────────────── */

function ContactoSelector({
  value, onSelect, onClear, disabled
}: {
  value?: { contacto: ContactResult; showFiscal?: boolean } | null;
  onSelect: (contacto: ContactResult) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ContactResult[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [hlIndex, setHlIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Nuevo contacto inline
  const [newContact, setNewContact] = useState({ nombre: '', email: '', telefono: '', tipo: 'person' as const });
  const [newFiscal, setNewFiscal] = useState({ nif: '', razonSocial: '', direccionFiscal: '', ciudadFiscal: '', pais: 'España', tipoIdFiscal: 'NIF' });
  const [creating, setCreating] = useState(false);

  const searchContacts = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts?search=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        // Cargar perfiles fiscales para los contactos devueltos
        setResults(data || []);
      }
    } catch (_) { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (search.length >= 2) {
      timerRef.current = setTimeout(() => searchContacts(search), 250);
    } else setResults([]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [search, searchContacts]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && inputRef.current && !inputRef.current.contains(e.target as Node))
        setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (c: ContactResult) => {
    onSelect(c);
    setSearch(''); setIsOpen(false); setResults([]);
  };

  const handleCreateContact = async () => {
    if (!newContact.nombre.trim() || !newContact.email.trim()) {
      toast.error('Nombre y email son obligatorios');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: newContact.nombre,
          email: newContact.email,
          telefono: newContact.telefono || undefined,
          tipo: newContact.tipo,
        })
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al crear contacto');
        return;
      }
      const contact: ContactResult = await res.json();

      // Si hay datos fiscales, crearlos
      if (newFiscal.nif) {
        await fetch('/api/configuracion/fiscal/perfiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: contact.id,
            pais: newFiscal.pais,
            tipoIdFiscal: newFiscal.tipoIdFiscal,
            idFiscal: newFiscal.nif,
            razonSocial: newFiscal.razonSocial || undefined,
            direccionFiscal: newFiscal.direccionFiscal || undefined,
            ciudadFiscal: newFiscal.ciudadFiscal || undefined,
          })
        }).catch(() => {});
      }

      toast.success(`Contacto "${contact.nombre}" creado`);
      handleSelect(contact);
      setShowNew(false);
      setNewContact({ nombre: '', email: '', telefono: '', tipo: 'person' });
      setNewFiscal({ nif: '', razonSocial: '', direccionFiscal: '', ciudadFiscal: '', pais: 'España', tipoIdFiscal: 'NIF' });
    } catch (_) {
      toast.error('Error de red al crear contacto');
    } finally { setCreating(false); }
  };

  if (value) {
    const c = value.contacto;
    const fp = c.perfilFiscal;
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
        <div className="p-2.5 bg-primary/10 rounded-full shrink-0 mt-0.5">
          {c.tipo === 'company' ? <Building2 className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900">{c.nombre}</span>
            <Badge variant="outline" className="text-[9px] uppercase">{c.tipo === 'company' ? 'Empresa' : 'Contacto'}</Badge>
          </div>
          <div className="text-xs text-slate-500 mt-0.5 space-x-2">
            <span>{c.email}</span>
            {c.telefono && <span>· {c.telefono}</span>}
          </div>
          {fp && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 bg-white/60 rounded-lg p-2.5 border border-primary/10">
              {fp.nif && <span><span className="font-medium">NIF:</span> {fp.nif}</span>}
              {fp.razonSocial && <span><span className="font-medium">R.Social:</span> {fp.razonSocial}</span>}
              {fp.direccionFiscal && <span><span className="font-medium">Dir.:</span> {fp.direccionFiscal}</span>}
              {fp.ciudadFiscal && <span>{fp.ciudadFiscal}</span>}
              {!fp.nif && <span className="text-amber-600 italic">Sin datos fiscales configurados</span>}
            </div>
          )}
          {!fp && (
            <div className="mt-1 text-xs text-amber-600 italic">Sin perfil fiscal — puede crear datos fiscales abajo</div>
          )}
        </div>
        {!disabled && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          ref={inputRef}
          value={search}
          onChange={e => { setSearch(e.target.value); if (e.target.value.length >= 2) { setIsOpen(true); setHlIndex(0); } }}
          onFocus={() => { if (search.length >= 2) setIsOpen(true); }}
          placeholder="Buscar contacto o empresa por nombre o email..."
          className="pl-10 h-11"
          disabled={disabled}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {isOpen && search.length >= 2 && (
        <div ref={dropdownRef} className="border rounded-xl shadow-2xl bg-white max-h-80 overflow-y-auto z-10 relative">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">Sin resultados para &quot;{search}&quot;</div>
          ) : (
            <div className="p-1.5">
              {results.map((c, i) => (
                <div key={c.id}
                  className={cn('flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors', i === hlIndex ? 'bg-primary/10' : 'hover:bg-slate-50')}
                  onClick={() => handleSelect(c)}
                  onMouseEnter={() => setHlIndex(i)}
                >
                  <div className={cn('p-2 rounded-full', i === hlIndex ? 'bg-primary/20' : 'bg-slate-100')}>
                    {c.tipo === 'company' ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{c.nombre}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {c.email} {c.company?.nombre ? `· ${c.company.nombre}` : ''}
                    </div>
                    {c.perfilFiscal?.nif && (
                      <Badge variant="secondary" className="text-[9px] h-4 mt-0.5 font-mono">NIF: {c.perfilFiscal.nif}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t" />
          <div className="p-2">
            <Button variant="ghost" size="sm" className="w-full justify-start text-primary gap-2" onClick={() => { setShowNew(true); setIsOpen(false); }}>
              <Plus className="h-4 w-4" /> Registrar nuevo contacto
            </Button>
          </div>
        </div>
      )}

      {/* Nuevo contacto inline */}
      {showNew && (
        <div className="border rounded-xl p-4 space-y-4 bg-slate-50 animate-in fade-in slide-in-from-bottom-2">
          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Plus className="h-4 w-4" /> Nuevo Contacto</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-xs">Nombre *</Label><Input value={newContact.nombre} onChange={e => setNewContact({ ...newContact, nombre: e.target.value })} placeholder="Nombre completo" /></div>
            <div><Label className="text-xs">Email *</Label><Input value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} placeholder="email@cliente.com" /></div>
            <div><Label className="text-xs">Teléfono</Label><Input value={newContact.telefono} onChange={e => setNewContact({ ...newContact, telefono: e.target.value })} placeholder="+34..." /></div>
            <div className="col-span-2">
              <Select value={newContact.tipo} onValueChange={v => setNewContact({ ...newContact, tipo: v as 'person' | 'company' })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">Persona física</SelectItem>
                  <SelectItem value="company">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />
          <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Datos fiscales (opcional)</h5>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">NIF / CIF</Label><Input value={newFiscal.nif} onChange={e => setNewFiscal({ ...newFiscal, nif: e.target.value.toUpperCase() })} placeholder="B12345678" className="uppercase" /></div>
            <div><Label className="text-xs">Tipo ID Fiscal</Label>
              <Select value={newFiscal.tipoIdFiscal} onValueChange={v => setNewFiscal({ ...newFiscal, tipoIdFiscal: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NIF">NIF (España)</SelectItem>
                  <SelectItem value="CIF">CIF (Empresas)</SelectItem>
                  <SelectItem value="NIE">NIE (Extranjero)</SelectItem>
                  <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label className="text-xs">Razón Social</Label><Input value={newFiscal.razonSocial} onChange={e => setNewFiscal({ ...newFiscal, razonSocial: e.target.value })} placeholder="Razón social completa" /></div>
            <div className="col-span-2"><Label className="text-xs">Dirección Fiscal</Label><Input value={newFiscal.direccionFiscal} onChange={e => setNewFiscal({ ...newFiscal, direccionFiscal: e.target.value })} placeholder="Calle, número, ciudad..." /></div>
            <div><Label className="text-xs">Ciudad</Label><Input value={newFiscal.ciudadFiscal} onChange={e => setNewFiscal({ ...newFiscal, ciudadFiscal: e.target.value })} /></div>
            <div><Label className="text-xs">País</Label>
              <Select value={newFiscal.pais} onValueChange={v => setNewFiscal({ ...newFiscal, pais: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="España">España</SelectItem>
                  <SelectItem value="México">México</SelectItem>
                  <SelectItem value="Colombia">Colombia</SelectItem>
                  <SelectItem value="Argentina">Argentina</SelectItem>
                  <SelectItem value="Chile">Chile</SelectItem>
                  <SelectItem value="Perú">Perú</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleCreateContact} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Guardar y Seleccionar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   ManualInvoiceModal — Componente principal
   ────────────────────────────────────────────── */

export function ManualInvoiceModal({ open, onOpenChange, onSuccess }: ManualInvoiceModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Cliente seleccionado
  const [contactoSeleccionado, setContactoSeleccionado] = useState<ContactResult | null>(null);

  // Moneda
  const [moneda, setMoneda] = useState('EUR');

  // Líneas de factura
  const [lineas, setLineas] = useState<InvoiceLineItem[]>([
    { id: '1', concepto: '', descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, tasaImpuestoPorcentaje: 21, tasaImpuestoNombre: 'IVA General' }
  ]);

  // Tipo de descuento: 'linea' (por concepto) o 'total'
  const [tipoDescuento, setTipoDescuento] = useState<'linea' | 'total'>('linea');
  const [descuentoGlobal, setDescuentoGlobal] = useState(0); // % descuento global

  // Notas
  const [notas, setNotas] = useState('');

  // Catálogo search state
  const [catalogoBuscando, setCatalogoBuscando] = useState(false);
  const [catalogoResultados, setCatalogoResultados] = useState<CatalogoItemResult[]>([]);
  const [catalogoSearch, setCatalogoSearch] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [newItemModal, setNewItemModal] = useState(false);
  const [newItemData, setNewItemData] = useState({ nombre: '', tipo: 'servicio', precioBase: 0, descripcion: '' });
  const catalogoTimer = useRef<NodeJS.Timeout | null>(null);
  const catalogoRef = useRef<HTMLDivElement>(null);

  // ─── Cálculos en vivo ──────────────────────────

  const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const descuentoLineas = lineas.reduce((s, l) => s + (l.cantidad * l.precioUnitario) * (l.descuento / 100), 0);
  const baseImponible = tipoDescuento === 'total'
    ? subtotal * (1 - descuentoGlobal / 100)
    : subtotal - descuentoLineas;
  const totalImpuestos = lineas.reduce((s, l) => {
    const base = l.cantidad * l.precioUnitario;
    const desc = tipoDescuento === 'linea' ? base * (l.descuento / 100) : base * (descuentoGlobal / 100) * (base / subtotal);
    return s + (base - desc) * l.tasaImpuestoPorcentaje / 100;
  }, 0);
  const total = baseImponible + totalImpuestos;

  // Agrupación de impuestos por tasa
  const impuestosAgrupados = lineas.reduce((acc: Record<string, { nombre: string; porcentaje: number; monto: number }>, l) => {
    const base = l.cantidad * l.precioUnitario;
    const desc = tipoDescuento === 'linea' ? base * (l.descuento / 100) : base * (descuentoGlobal / 100) * (base / subtotal || 0);
    const monto = (base - desc) * l.tasaImpuestoPorcentaje / 100;
    const key = `${l.tasaImpuestoPorcentaje}`;
    if (!acc[key]) acc[key] = { nombre: l.tasaImpuestoNombre, porcentaje: l.tasaImpuestoPorcentaje, monto: 0 };
    acc[key].monto += monto;
    return acc;
  }, {});

  const fmt = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(amount);

  // ─── Catálogo Search ──────────────────────────

  const searchCatalogo = useCallback(async (q: string) => {
    if (q.length < 2) { setCatalogoResultados([]); return; }
    setCatalogoBuscando(true);
    try {
      const res = await fetch(`/api/catalogo?search=${encodeURIComponent(q)}&activo=true&limit=10`);
      if (res.ok) { const d = await res.json(); setCatalogoResultados(d.items || []); }
    } catch (_) {} finally { setCatalogoBuscando(false); }
  }, []);

  useEffect(() => {
    if (catalogoTimer.current) clearTimeout(catalogoTimer.current);
    if (catalogoSearch.length >= 2) {
      catalogoTimer.current = setTimeout(() => searchCatalogo(catalogoSearch), 250);
    } else setCatalogoResultados([]);
    return () => { if (catalogoTimer.current) clearTimeout(catalogoTimer.current); };
  }, [catalogoSearch, searchCatalogo]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catalogoRef.current && !catalogoRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addCatalogoItem = (item: CatalogoItemResult) => {
    setLineas(prev => prev.map((l, idx) => {
      if (idx === lineas.length - 1 && !l.concepto) {
        // Reemplazar la línea vacía
        return {
          ...l,
          catalogoItemId: item.id,
          concepto: item.nombre,
          descripcion: item.descripcion || '',
          precioUnitario: item.precioBase,
          tasaImpuestoId: item.tasaImpuesto?.id,
          tasaImpuestoPorcentaje: item.tasaImpuesto?.porcentaje || 0,
          tasaImpuestoNombre: item.tasaImpuesto?.nombre || 'Sin IVA',
        };
      }
      return l;
    }));
    // Si no hay línea vacía, agregar una nueva
    const tieneVacia = lineas.some(l => !l.concepto);
    if (tieneVacia) {
      setLineas(prev => prev.map(l => !l.concepto ? {
        ...l,
        catalogoItemId: item.id,
        concepto: item.nombre,
        descripcion: item.descripcion || '',
        precioUnitario: item.precioBase,
        tasaImpuestoId: item.tasaImpuesto?.id,
        tasaImpuestoPorcentaje: item.tasaImpuesto?.porcentaje || 0,
        tasaImpuestoNombre: item.tasaImpuesto?.nombre || 'Sin IVA',
      } : l));
    } else {
      addLinea(item);
    }
    setCatalogoSearch('');
    setCatOpen(false);
  };

  const createCatalogoItem = async () => {
    if (!newItemData.nombre || newItemData.precioBase <= 0) {
      toast.error('Nombre y precio son requeridos');
      return;
    }
    try {
      const res = await fetch('/api/catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: newItemData.nombre,
          tipo: newItemData.tipo,
          precioBase: newItemData.precioBase,
          moneda,
          activo: true,
          descripcion: newItemData.descripcion || null,
        })
      });
      if (res.ok) {
        const item = await res.json();
        toast.success(`"${item.nombre}" registrado en catálogo`);
        // Cargar tasas de impuesto
        const taxRes = await fetch('/api/configuracion/fiscal/tasas?activo=true');
        if (taxRes.ok) {
          const taxData = await taxRes.json();
          const tasas = taxData.tasas || [];
          if (tasas.length > 0) {
            item.tasaImpuesto = tasas[0];
          }
        }
        addCatalogoItem(item);
        setNewItemModal(false);
        setNewItemData({ nombre: '', tipo: 'servicio', precioBase: 0, descripcion: '' });
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al crear item');
      }
    } catch (_) {
      toast.error('Error al crear item');
    }
  };

  // ─── Manejo de líneas ─────────────────────────

  const addLinea = (fromCatalogo?: CatalogoItemResult) => {
    setLineas(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      catalogoItemId: fromCatalogo?.id,
      concepto: fromCatalogo?.nombre || '',
      descripcion: fromCatalogo?.descripcion || '',
      cantidad: 1,
      precioUnitario: fromCatalogo?.precioBase || 0,
      descuento: tipoDescuento === 'linea' ? 0 : 0,
      tasaImpuestoId: fromCatalogo?.tasaImpuesto?.id,
      tasaImpuestoPorcentaje: fromCatalogo?.tasaImpuesto?.porcentaje || 0,
      tasaImpuestoNombre: fromCatalogo?.tasaImpuesto?.nombre || 'Sin IVA',
    }]);
  };

  const removeLinea = (id: string) => {
    if (lineas.length > 1) setLineas(prev => prev.filter(l => l.id !== id));
  };

  const updateLinea = (id: string, field: keyof InvoiceLineItem, value: any) => {
    setLineas(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // ─── Submit ──────────────────────────────────

  const handleSubmit = async () => {
    if (!contactoSeleccionado) { toast.error('Selecciona un cliente'); return; }
    const itemsValidos = lineas.filter(l => l.concepto.trim() && l.precioUnitario > 0);
    if (itemsValidos.length === 0) { toast.error('Agrega al menos un concepto válido'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNombre: contactoSeleccionado.nombre,
          clienteEmail: contactoSeleccionado.email,
          clienteNif: contactoSeleccionado.perfilFiscal?.nif || undefined,
          clienteDireccion: contactoSeleccionado.perfilFiscal?.direccionFiscal || undefined,
          moneda,
          notas,
          tipoDescuento,
          descuentoGlobal: tipoDescuento === 'total' ? descuentoGlobal : 0,
          items: itemsValidos.map(l => ({
            concepto: l.concepto,
            descripcion: l.descripcion || undefined,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            descuento: l.descuento,
            tasaImpuestoPorcentaje: l.tasaImpuestoPorcentaje,
            tasaImpuestoNombre: l.tasaImpuestoNombre,
            catalogoItemId: l.catalogoItemId,
          }))
        })
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data.invoice);
        setStep(3);
        toast.success(`Factura ${data.invoice.numero} creada`);
        onSuccess?.();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al crear factura');
      }
    } catch (_) {
      toast.error('Error de red');
    } finally { setLoading(false); }
  };

  const resetForm = () => {
    setStep(1);
    setContactoSeleccionado(null);
    setLineas([{ id: '1', concepto: '', descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, tasaImpuestoPorcentaje: 21, tasaImpuestoNombre: 'IVA General' }]);
    setMoneda('EUR');
    setNotas('');
    setTipoDescuento('linea');
    setDescuentoGlobal(0);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) resetForm(); onOpenChange?.(o); }}>
      <DialogTrigger asChild>
        <Button className="rounded-xl bg-primary text-white hover:bg-primary/90 shadow-md px-5 gap-2">
          <Plus className="h-4 w-4" />
          Crear Factura Manual
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
            <Receipt className="h-6 w-6 text-primary" />
            {step === 1 ? 'Nueva Factura Manual' : step === 2 ? 'Confirmar Factura' : 'Factura Creada'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Selecciona el cliente, agrega conceptos del catálogo y revisa los totales.'
              : step === 2 ? 'Revisa los datos antes de emitir.'
              : 'La factura ha sido generada correctamente.'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex items-center gap-2 px-2 mb-4">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                step >= s ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400')}>
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 3 && <div className={cn('h-0.5 flex-1 rounded-full', step > s ? 'bg-primary' : 'bg-slate-100')} />}
            </div>
          ))}
        </div>

        {/* ═══════════════ P A S O   1 ═══════════════ */}
        {step === 1 && (
          <div className="space-y-6">

            {/* ─── CLIENTE ─── */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <User className="h-4 w-4" /> Cliente
              </h3>
              <ContactoSelector
                value={contactoSeleccionado ? { contacto: contactoSeleccionado } : null}
                onSelect={setContactoSeleccionado}
                onClear={() => setContactoSeleccionado(null)}
              />
            </div>

            {/* ─── MONEDA ─── */}
            <div className="flex items-center gap-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Moneda:</Label>
              <div className="flex gap-1.5">
                {['EUR', 'USD', 'MXN'].map(c => (
                  <Button key={c} variant={moneda === c ? 'default' : 'outline'} size="sm" className="rounded-lg min-w-[60px]"
                    onClick={() => setMoneda(c)}>
                    {c === 'EUR' ? '€' : c === 'USD' ? '$' : 'MX$'} {c}
                  </Button>
                ))}
              </div>
            </div>

            {/* ─── CONCEPTOS ─── */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Conceptos
              </h3>

              {/* Buscador de catálogo */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={catalogoSearch}
                  onChange={e => { setCatalogoSearch(e.target.value); if (e.target.value.length >= 2) setCatOpen(true); }}
                  onFocus={() => { if (catalogoSearch.length >= 2) setCatOpen(true); }}
                  placeholder="Buscar en catálogo de productos/servicios..."
                  className="pl-10 h-10 bg-slate-50 border-dashed border-2"
                />
                {catalogoBuscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />}
              </div>

              {catOpen && catalogoSearch.length >= 2 && (
                <div ref={catalogoRef} className="border rounded-xl shadow-xl bg-white mb-4 max-h-60 overflow-y-auto">
                  {catalogoBuscando ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : catalogoResultados.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500 space-y-2">
                      <p>Sin resultados para &quot;{catalogoSearch}&quot;</p>
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => { setNewItemData(prev => ({ ...prev, nombre: catalogoSearch })); setNewItemModal(true); setCatOpen(false); }}>
                        <Plus className="h-3 w-3" /> Registrar &quot;{catalogoSearch}&quot; como nuevo
                      </Button>
                    </div>
                  ) : (
                    <div className="p-1.5">
                      {catalogoResultados.map(item => (
                        <div key={item.id}
                          className="flex items-center justify-between p-2.5 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors"
                          onClick={() => addCatalogoItem(item)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-1.5 bg-slate-100 rounded">
                              {item.tipo === 'producto' ? <Package className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{item.nombre}</div>
                              <div className="text-xs text-slate-500 truncate">{item.descripcion || item.sku || item.tipo}</div>
                            </div>
                          </div>
                          <div className="text-right ml-3 shrink-0">
                            <div className="font-semibold text-sm">{fmt(item.precioBase)}</div>
                            {item.tasaImpuesto && (
                              <Badge variant="secondary" className="text-[9px]">{item.tasaImpuesto.porcentaje}% {item.tasaImpuesto.nombre}</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="border-t pt-1 px-1">
                        <Button variant="ghost" size="sm" className="w-full justify-start text-primary gap-2 text-xs"
                          onClick={() => { setNewItemData(prev => ({ ...prev, nombre: catalogoSearch })); setNewItemModal(true); setCatOpen(false); }}>
                          <Plus className="h-3 w-3" /> Añadir nuevo producto/servicio
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Líneas de factura */}
              <div className="space-y-3">
                {lineas.map((linea, idx) => (
                  <div key={linea.id} className="border rounded-xl p-4 space-y-3 bg-white hover:border-primary/30 transition-colors">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-5 space-y-1">
                        <Label className="text-[9px] font-bold uppercase text-slate-400">Concepto</Label>
                        <Input value={linea.concepto} onChange={e => updateLinea(linea.id, 'concepto', e.target.value)}
                          placeholder="Nombre del concepto" className="bg-white border-slate-200 h-9 text-sm" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[9px] font-bold uppercase text-slate-400">Cant.</Label>
                        <Input type="number" min={1} value={linea.cantidad}
                          onChange={e => updateLinea(linea.id, 'cantidad', parseFloat(e.target.value) || 0)}
                          className="bg-white border-slate-200 h-9" />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[9px] font-bold uppercase text-slate-400">Precio Unit.</Label>
                        <Input type="number" min={0} step={0.01} value={linea.precioUnitario}
                          onChange={e => updateLinea(linea.id, 'precioUnitario', parseFloat(e.target.value) || 0)}
                          className="bg-white border-slate-200 h-9" />
                      </div>
                      <div className="col-span-1 flex items-end pb-1 justify-center">
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-300 hover:text-red-500"
                          onClick={() => removeLinea(linea.id)} disabled={lineas.length <= 1}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="col-span-7 space-y-1">
                        <Label className="text-[9px] font-bold uppercase text-slate-400">Descripción</Label>
                        <Input value={linea.descripcion} onChange={e => updateLinea(linea.id, 'descripcion', e.target.value)}
                          placeholder="Descripción (se usará la del catálogo)" className="bg-white border-slate-200 h-9 text-xs" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[9px] font-bold uppercase text-slate-400">IVA %</Label>
                        <Input type="number" min={0} max={100} value={linea.tasaImpuestoPorcentaje}
                          onChange={e => updateLinea(linea.id, 'tasaImpuestoPorcentaje', parseFloat(e.target.value) || 0)}
                          className="bg-white border-slate-200 h-9" />
                        {linea.tasaImpuestoNombre !== 'Sin IVA' && (
                          <p className="text-[9px] text-slate-400 truncate">{linea.tasaImpuestoNombre}</p>
                        )}
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[9px] font-bold uppercase text-slate-400">Dto. %</Label>
                        <Input type="number" min={0} max={100} value={linea.descuento}
                          onChange={e => updateLinea(linea.id, 'descuento', parseFloat(e.target.value) || 0)}
                          disabled={tipoDescuento === 'total'}
                          className={cn('h-9', tipoDescuento === 'total' ? 'bg-slate-50 text-slate-400' : 'bg-white border-slate-200')}
                        />
                      </div>
                      <div className="col-span-1 flex items-end pb-1 justify-end">
                        <p className="text-sm font-bold text-slate-700">{fmt(linea.cantidad * linea.precioUnitario)}</p>
                      </div>
                    </div>
                  </div>
                ))}

                <Button variant="outline" onClick={() => addLinea()}
                  className="w-full border-dashed border-2 py-4 rounded-xl text-slate-400 hover:text-primary hover:border-primary/50 transition-all">
                  <Plus className="h-4 w-4 mr-2" /> Añadir otro concepto
                </Button>
              </div>
            </div>

            {/* ─── DESCUENTO ─── */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Percent className="h-4 w-4" /> Descuento
                </h4>
                <div className="flex gap-1.5">
                  <Badge variant={tipoDescuento === 'linea' ? 'default' : 'outline'} className="cursor-pointer text-[10px]"
                    onClick={() => setTipoDescuento('linea')}>Por concepto</Badge>
                  <Badge variant={tipoDescuento === 'total' ? 'default' : 'outline'} className="cursor-pointer text-[10px]"
                    onClick={() => setTipoDescuento('total')}>Sobre total</Badge>
                </div>
              </div>
              {tipoDescuento === 'linea' && (
                <p className="text-xs text-slate-400">Aplica un % de descuento a cada concepto individualmente (columna &quot;Dto. %&quot;).</p>
              )}
              {tipoDescuento === 'total' && (
                <div className="flex items-center gap-4">
                  <p className="text-xs text-slate-500">Descuento global sobre el subtotal:</p>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} max={100} value={descuentoGlobal}
                      onChange={e => setDescuentoGlobal(parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-center" />
                    <span className="text-sm font-bold text-slate-600">%</span>
                  </div>
                </div>
              )}
            </div>

            {/* ─── NOTAS ─── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notas / Observaciones</Label>
              <textarea rows={2}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/20"
                placeholder="Notas adicionales para la factura..."
                value={notas} onChange={e => setNotas(e.target.value)} />
            </div>
          </div>
        )}

        {/* ═══════════════ P A S O   2 ═══════════════ */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Resumen cliente */}
            <div className="bg-slate-50 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">{contactoSeleccionado?.nombre}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>{contactoSeleccionado?.email}</span>
                    {contactoSeleccionado?.perfilFiscal?.nif && <span className="font-mono">NIF: {contactoSeleccionado.perfilFiscal.nif}</span>}
                  </div>
                </div>
              </div>

              {/* Tabla de conceptos */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 font-bold text-slate-500 text-[9px] uppercase">Concepto</th>
                    <th className="pb-2 font-bold text-slate-500 text-[9px] uppercase text-right">Cant.</th>
                    <th className="pb-2 font-bold text-slate-500 text-[9px] uppercase text-right">P.Unit.</th>
                    <th className="pb-2 font-bold text-slate-500 text-[9px] uppercase text-right">Dto.</th>
                    <th className="pb-2 font-bold text-slate-500 text-[9px] uppercase text-right">IVA</th>
                    <th className="pb-2 font-bold text-slate-500 text-[9px] uppercase text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.filter(l => l.concepto.trim() && l.precioUnitario > 0).map(l => {
                    const base = l.cantidad * l.precioUnitario;
                    const dto = tipoDescuento === 'linea' ? base * l.descuento / 100 : 0;
                    const imp = (base - dto) * l.tasaImpuestoPorcentaje / 100;
                    return (
                      <tr key={l.id} className="border-b border-slate-100">
                        <td className="py-2.5 font-medium text-slate-800">{l.concepto}</td>
                        <td className="py-2.5 text-right text-slate-600">{l.cantidad}</td>
                        <td className="py-2.5 text-right text-slate-600">{fmt(l.precioUnitario)}</td>
                        <td className="py-2.5 text-right text-slate-600">{tipoDescuento === 'linea' ? `${l.descuento}%` : '—'}</td>
                        <td className="py-2.5 text-right text-slate-600">{l.tasaImpuestoPorcentaje > 0 ? `${l.tasaImpuestoPorcentaje}%` : 'Exento'}</td>
                        <td className="py-2.5 text-right font-medium">{fmt(base + imp - dto)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totales */}
              <div className="border-t border-slate-200 pt-4 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span className="font-medium">{fmt(subtotal)}</span></div>
                {tipoDescuento === 'total' && descuentoGlobal > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Descuento global ({descuentoGlobal}%)</span><span className="font-medium text-red-500">-{fmt(subtotal * descuentoGlobal / 100)}</span></div>
                )}
                {tipoDescuento === 'linea' && descuentoLineas > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Descuentos aplicados</span><span className="font-medium text-red-500">-{fmt(descuentoLineas)}</span></div>
                )}
                {/* IVA desglosado */}
                {Object.entries(impuestosAgrupados).map(([key, imp]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-slate-500">{imp.nombre} ({imp.porcentaje}%)</span>
                    <span className="font-medium text-slate-700">{fmt(imp.monto)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t-2 border-slate-800">
                  <span className="font-black text-base">Total</span>
                  <span className="text-xl font-black">{fmt(total)}</span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">¿Estás seguro de emitir esta factura?</p>
                <p className="text-xs text-amber-700/80 mt-1">La factura se sellará criptográficamente (Veri*factu) y quedará registrada en el sistema. No se podrá eliminar.</p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ P A S O   3 ═══════════════ */}
        {step === 3 && result && (
          <div className="space-y-6 text-center py-4">
            <div className="flex justify-center">
              <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tight">Factura Creada</h3>
              <p className="text-slate-500 font-medium mt-1">Factura <span className="font-bold text-slate-800">{result.numero}</span> generada correctamente</p>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="text-slate-600">{result.isSealed ? 'Sellada criptográficamente' : 'Veri*factu pendiente'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-slate-900">{fmt(result.monto)}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400 mt-1">Total</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-lg font-bold text-slate-900">{result.numero}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400 mt-1">Número</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── FOOTER ─── */}
        <DialogFooter className="border-t pt-4 gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => { resetForm(); onOpenChange?.(false); }} className="rounded-xl">Cancelar</Button>
              <Button className="rounded-xl px-8 gap-2" onClick={() => setStep(2)}
                disabled={!contactoSeleccionado || !lineas.some(l => l.concepto.trim() && l.precioUnitario > 0)}>
                Revisar Factura <Receipt className="h-4 w-4" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl">Volver</Button>
              <Button className="rounded-xl px-8 gap-2 bg-primary hover:bg-primary/90" onClick={handleSubmit} disabled={loading}>
                {loading ? <><Clock className="h-4 w-4 animate-spin mr-2" /> Creando...</>
                  : <><ShieldCheck className="h-4 w-4" /> Emitir Factura</>}
              </Button>
            </>
          )}
          {step === 3 && (
            <Button className="rounded-xl px-8 mx-auto w-full" onClick={() => { resetForm(); onOpenChange?.(false); }}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Modal de nuevo item en catálogo */}
      <Dialog open={newItemModal} onOpenChange={setNewItemModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo Producto / Servicio</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Nombre *</Label><Input value={newItemData.nombre} onChange={e => setNewItemData({ ...newItemData, nombre: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Tipo</Label>
                <Select value={newItemData.tipo} onValueChange={v => setNewItemData({ ...newItemData, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servicio">Servicio</SelectItem>
                    <SelectItem value="producto">Producto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Precio Base * ({moneda})</Label>
                <Input type="number" min={0} step={0.01} value={newItemData.precioBase || ''}
                  onChange={e => setNewItemData({ ...newItemData, precioBase: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div><Label>Descripción</Label>
              <Textarea value={newItemData.descripcion} onChange={e => setNewItemData({ ...newItemData, descripcion: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewItemModal(false)}>Cancelar</Button>
            <Button onClick={createCatalogoItem}><CheckCircle2 className="h-4 w-4 mr-2" /> Guardar y Seleccionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
