'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Building2, ExternalLink, Eye, Filter, IdCard, Loader2, Mail, Plus, Search, TrendingUp, Users,
} from 'lucide-react';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const FORM_VACIO = { name: '', taxId: '', email: '', phone: '', city: '', country: 'España', category: 'Otros' };

/**
 * Proveedores del hub de Compras.
 *
 * Es el mismo directorio que usa Finanzas (`/api/erp/suppliers`), así que aquí
 * se da de alta lo justo para poder pedir —nombre, NIF y contacto— y el resto
 * del trato fiscal (tipos de IVA, retenciones) se edita donde ya vivía, en
 * Finanzas → Proveedores. No se duplica la ficha: un proveedor es uno.
 */
export default function ProveedoresComprasPage() {
  const moneda = useMonedaTenant();
  const { data: proveedoresData, isLoading, mutate } = useSWR<any>('/api/erp/suppliers', fetcher);
  // Identidad estable para los memos de filtros y KPIs: sin el useMemo, el
  // array se rehace en cada render y la lista se recalcula siempre.
  const proveedores = useMemo<any[]>(() => {
    if (Array.isArray(proveedoresData)) return proveedoresData;
    return proveedoresData?.suppliers ?? [];
  }, [proveedoresData]);

  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('todas');

  const categorias = useMemo(
    () => Array.from(new Set(proveedores.map((p) => p.category).filter(Boolean))).sort(),
    [proveedores]
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proveedores.filter((p) => {
      if (categoria !== 'todas' && p.category !== categoria) return false;
      if (!q) return true;
      return [p.name, p.taxId, p.email, p.city]
        .filter(Boolean)
        .some((campo: string) => String(campo).toLowerCase().includes(q));
    });
  }, [proveedores, search, categoria]);

  const stats = useMemo(() => {
    const total = proveedores.length;
    const conNif = proveedores.filter((p) => Boolean(p.taxId)).length;
    const conEmail = proveedores.filter((p) => Boolean(p.email)).length;
    const saldo = proveedores.reduce((acc, p) => acc + (Number(p.balance) || 0), 0);
    return { total, conNif, conEmail, saldo };
  }, [proveedores]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  async function crearProveedor() {
    if (!form.name.trim()) {
      toast.error('El proveedor necesita un nombre');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch('/api/erp/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const cuerpo = await res.json();
      if (!res.ok) {
        toast.error(cuerpo.error ?? 'No se pudo crear el proveedor');
        return;
      }
      toast.success(`${cuerpo.name ?? form.name} añadido al directorio`);
      setForm(FORM_VACIO);
      setAbierto(false);
      mutate();
    } catch {
      toast.error('No se pudo crear el proveedor');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* KPIs premium */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Proveedores</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">{stats.total}</p>
              </div>
              <div className="h-12 w-12 bg-blue-100/50 rounded-xl flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Con NIF</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">{stats.conNif}</p>
              </div>
              <div className="h-12 w-12 bg-slate-100/50 rounded-xl flex items-center justify-center">
                <IdCard className="h-6 w-6 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Con email</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600 tracking-tight">{stats.conEmail}</p>
              </div>
              <div className="h-12 w-12 bg-emerald-100/50 rounded-xl flex items-center justify-center">
                <Mail className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-gradient-primary hover:scale-105 transition-all duration-300 shadow-lg border-none text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80 uppercase tracking-wider">Saldo acumulado</p>
                <p className="text-2xl font-bold mt-1 tracking-tight truncate">
                  {formatearImporte(stats.saldo, moneda)}
                </p>
              </div>
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, NIF, email o ciudad..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las categorías</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary">
              <Filter className="h-4 w-4 mr-2" /> Filtrar
            </Button>
            <Button type="button" onClick={() => setAbierto(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nuevo proveedor
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Directorio
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>NIF</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <span className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando proveedores…
                    </span>
                  </TableCell>
                </TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Building2 className="h-10 w-10 opacity-40" />
                      <p>
                        {proveedores.length === 0
                          ? 'Todavía no hay proveedores. Añade el primero para poder pedirle.'
                          : 'Ningún proveedor coincide con el filtro.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((proveedor) => (
                  <TableRow key={proveedor.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <p className="font-medium">{proveedor.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[proveedor.city, proveedor.country].filter(Boolean).join(' · ') || 'Sin dirección'}
                      </p>
                    </TableCell>
                    <TableCell>{proveedor.taxId || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <p className="text-sm">{proveedor.email || <span className="text-muted-foreground">—</span>}</p>
                      {proveedor.phone && <p className="text-xs text-muted-foreground">{proveedor.phone}</p>}
                    </TableCell>
                    <TableCell>
                      {proveedor.category ? (
                        <span className="text-xs text-muted-foreground">{proveedor.category}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatearImporte(Number(proveedor.balance ?? 0), proveedor.currency || moneda)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href="/dashboard/finanzas/proveedores"
                        className="text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        title="Ficha completa"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo proveedor</DialogTitle>
            <DialogDescription>Lo mínimo para poder pedirle. Los datos fiscales se completan después.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nombre">Nombre o razón social</Label>
              <Input id="nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="nif">NIF / CIF</Label>
              <Input id="nif" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="categoria">Categoría</Label>
              <Input id="categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="telefono">Teléfono</Label>
              <Input id="telefono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ciudad">Ciudad</Label>
              <Input id="ciudad" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pais">País</Label>
              <Input id="pais" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="mt-1" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={crearProveedor} disabled={guardando}>
              {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Añadir proveedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
