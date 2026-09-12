'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import {
  Building2,
  ArrowLeft,
  Save,
  Loader2,
  Mail,
  Phone,
  Globe,
  MapPin,
  FileText,
  UserRound,
  Settings2,
  Landmark,
  Plug,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';

// ─── Tipos de los bloques JSON (coinciden con lib/insurance/aseguradora-types.ts) ───

interface RepresentanteLegal { nombre: string; documento: string; cargo: string }
interface ContactoOperativo { cargo: string; nombre?: string; email?: string; telefono?: string }
interface ModeloComision { nombre: string; tipo: string; pct: number; aplicaA: string }
interface CondicionesPago { diasGracia: number; politicaCancelacion: string; requiereAnticipo?: boolean }
interface LimitesSuscripcion { montoMaximoAutomatico: number; moneda?: string; requiereAprobacionManual: boolean }
interface GestionSiniestros { slaRespuestaHoras: number; limiteIndemnizacion: number; tipoLimite: string; deducible?: number }
interface CuentaBancaria { banco: string; tipoCuenta: string; numeroCuenta: string; clabe?: string; iban?: string; swift?: string; moneda?: string }
interface IntegracionApi {
  apiKey?: string;
  oauth?: { clientId?: string; clientSecret?: string; tokenUrl?: string };
  endpoints?: { staging?: string; produccion?: string };
  formatos?: string[];
  certificados?: { ssl?: string; firmaDigital?: string };
}

interface Aseguradora {
  id: string;
  nombre: string;
  nif: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  direccion: string | null;
  razonSocial: string | null;
  nombreComercial: string | null;
  codigoPostal: string | null;
  provincia: string | null;
  pais: string | null;
  regimenFiscal: string | null;
  numeroRegistro: string | null;
  ramosAutorizados: string[] | null;
  fechaVigenciaLicenciaInicio: string | null;
  fechaVigenciaLicenciaFin: string | null;
  representanteLegal: RepresentanteLegal | null;
  mesaEntradas: string | null;
  contactosOperativos: ContactoOperativo[] | null;
  modelosComision: ModeloComision[] | null;
  condicionesPago: CondicionesPago | null;
  limitesSuscripcion: LimitesSuscripcion | null;
  gestionSiniestros: GestionSiniestros | null;
  cuentasBancarias: CuentaBancaria[] | null;
  monedaBase: string | null;
  monedaLiquidacion: string | null;
  integracionApi: IntegracionApi | null;
  notas: string | null;
  activa: boolean;
  createdAt: string;
}

function Row({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground italic py-4">{children}</div>;
}

function BlockCard({ title, description, children, onSave, saving }: {
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <div className="pt-2 flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Guardando...' : 'Guardar bloque'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TextField({ label, value, onChange, placeholder, mono }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={mono ? 'font-mono text-xs' : ''}
      />
    </div>
  );
}

function BoolSelect({ label, value, onChange, trueLabel = 'Sí', falseLabel = 'No' }: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  trueLabel?: string;
  falseLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value ? 'true' : 'false'} onValueChange={v => onChange(v === 'true')}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{trueLabel}</SelectItem>
          <SelectItem value="false">{falseLabel}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ListEditor<T extends Record<string, any>>({ items, onChange, fields, emptyLabel }: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: { key: string; label: string; placeholder?: string }[];
  emptyLabel: string;
}) {
  const update = (idx: number, key: string, val: string) => {
    const next = items.map((it, i) => (i === idx ? { ...it, [key]: val } : it));
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.length === 0 && <EmptyState>{emptyLabel}</EmptyState>}
      {items.map((it, idx) => (
        <div key={idx} className="rounded-lg border p-3 space-y-2 relative">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 h-6 w-6 text-destructive"
          onClick={() => onChange(items.filter((_, i) => i !== idx))}
          title="Eliminar"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map(f => (
              <TextField
                key={f.key}
                label={f.label}
                value={String(it[f.key] ?? '')}
                onChange={v => update(idx, f.key, v)}
                placeholder={f.placeholder}
              />
            ))}
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => {
        const empty: any = {};
        fields.forEach(f => { empty[f.key] = ''; });
        onChange([...items, empty]);
      }}>
        + Añadir
      </Button>
    </div>
  );
}

export default function AseguradoraDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;

  const [aseguradora, setAseguradora] = useState<Aseguradora | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Estados de edición por bloque
  const [repLegal, setRepLegal] = useState<RepresentanteLegal>({ nombre: '', documento: '', cargo: '' });
  const [mesaEntradas, setMesaEntradas] = useState('');
  const [contactos, setContactos] = useState<ContactoOperativo[]>([]);
  const [comisiones, setComisiones] = useState<ModeloComision[]>([]);
  const [condiciones, setCondiciones] = useState<CondicionesPago>({ diasGracia: 30, politicaCancelacion: '' });
  const [limites, setLimites] = useState<LimitesSuscripcion>({ montoMaximoAutomatico: 0, requiereAprobacionManual: true });
  const [siniestros, setSiniestros] = useState<GestionSiniestros>({ slaRespuestaHoras: 24, limiteIndemnizacion: 0, tipoLimite: 'por_evento' });
  const [deducibleStr, setDeducibleStr] = useState('');
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [monedaBase, setMonedaBase] = useState('');
  // Pista de moneda de todos los campos de divisa de la ficha: la del tenant,
  // que es la que este broker usa de verdad. Si aún no cargó, el campo queda sin
  // pista en lugar de sugerir una divisa ajena.
  const monedaTenant = useMonedaTenant();
  const [monedaLiquidacion, setMonedaLiquidacion] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [oauthTokenUrl, setOauthTokenUrl] = useState('');
  const [endpointStaging, setEndpointStaging] = useState('');
  const [endpointProd, setEndpointProd] = useState('');
  const [formatos, setFormatos] = useState('');
  const [certSsl, setCertSsl] = useState('');
  const [certFirma, setCertFirma] = useState('');
  const [notas, setNotas] = useState('');

  const [savingBlock, setSavingBlock] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/insurance/aseguradoras/${id}`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) setNotFound(true);
        else toast.error(data.error || 'Error al cargar la aseguradora');
        return;
      }
      setAseguradora(data);
      // Precargar bloques
      setRepLegal(data.representanteLegal || { nombre: '', documento: '', cargo: '' });
      setMesaEntradas(data.mesaEntradas || '');
      setContactos(data.contactosOperativos || []);
      setComisiones(data.modelosComision || []);
      setCondiciones(data.condicionesPago || { diasGracia: 30, politicaCancelacion: '' });
      setLimites(data.limitesSuscripcion || { montoMaximoAutomatico: 0, requiereAprobacionManual: true });
      setSiniestros(data.gestionSiniestros || { slaRespuestaHoras: 24, limiteIndemnizacion: 0, tipoLimite: 'por_evento' });
      setDeducibleStr(data.gestionSiniestros?.deducible !== undefined && data.gestionSiniestros?.deducible !== null ? String(data.gestionSiniestros.deducible) : '');
      setCuentas(data.cuentasBancarias || []);
      setMonedaBase(data.monedaBase || '');
      setMonedaLiquidacion(data.monedaLiquidacion || '');
      const ia = data.integracionApi;
      setApiKey(ia?.apiKey || '');
      setOauthClientId(ia?.oauth?.clientId || '');
      setOauthClientSecret(ia?.oauth?.clientSecret || '');
      setOauthTokenUrl(ia?.oauth?.tokenUrl || '');
      setEndpointStaging(ia?.endpoints?.staging || '');
      setEndpointProd(ia?.endpoints?.produccion || '');
      setFormatos(Array.isArray(ia?.formatos) ? ia.formatos.join(', ') : '');
      setCertSsl(ia?.certificados?.ssl || '');
      setCertFirma(ia?.certificados?.firmaDigital || '');
      setNotas(data.notas || '');
    } catch (error) {
      console.error('Error cargando aseguradora:', error);
      toast.error('Error al cargar la aseguradora');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const patch = async (payload: Record<string, any>, blockKey: string, successMsg: string) => {
    try {
      setSavingBlock(blockKey);
      const res = await apiFetch(`/api/insurance/aseguradoras/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(successMsg);
        await load();
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch (error) {
      console.error('Error guardando bloque:', error);
      toast.error('Error al guardar');
    } finally {
      setSavingBlock(null);
    }
  };

  const saveBl3 = () => patch({
    representanteLegal: repLegal.nombre ? repLegal : null,
    mesaEntradas,
    contactosOperativos: contactos,
  }, 'b3', 'Bloque de representación guardado');

  const saveBl4 = () => {
    const deducible = deducibleStr === '' ? undefined : Number(deducibleStr);
    patch({
      modelosComision: comisiones.map(c => ({ ...c, pct: Number(c.pct) || 0 })),
      condicionesPago: condiciones,
      limitesSuscripcion: limites,
      gestionSiniestros: { ...siniestros, deducible: Number.isNaN(deducible as number) ? undefined : deducible },
    }, 'b4', 'Bloque operativo guardado');
  };

  const saveBl5 = () => patch({
    cuentasBancarias: cuentas,
    monedaBase,
    monedaLiquidacion,
  }, 'b5', 'Bloque financiero guardado');

  const saveBl6 = () => patch({
    integracionApi: {
      apiKey,
      oauth: {
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
        tokenUrl: oauthTokenUrl,
      },
      endpoints: { staging: endpointStaging, produccion: endpointProd },
      formatos: formatos.split(',').map(f => f.trim()).filter(Boolean),
      certificados: { ssl: certSsl, firmaDigital: certFirma },
    },
  }, 'b6', 'Integración guardada');

  const saveNotas = () => patch({ notas }, 'notas', 'Notas guardadas');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando ficha de aseguradora...</p>
        </div>
      </div>
    );
  }

  if (notFound || !aseguradora) {
    return (
      <div className="text-center py-20">
        <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
        <h2 className="text-lg font-medium mb-2">Aseguradora no encontrada</h2>
        <Button variant="outline" onClick={() => router.push('/dashboard/seguros/aseguradoras')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver al listado
        </Button>
      </div>
    );
  }

  const a = aseguradora;

  // Alerta de vigencia de licencia
  const licenciaFin = a.fechaVigenciaLicenciaFin ? new Date(a.fechaVigenciaLicenciaFin) : null;
  const licenciaState = (() => {
    if (!licenciaFin) return null;
    const days = Math.ceil((licenciaFin.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { tone: 'destructive' as const, msg: `Licencia VENCIDA hace ${Math.abs(days)} días` };
    if (days <= 60) return { tone: 'warning' as const, msg: `Licencia expira en ${days} día${days === 1 ? '' : 's'}` };
    return { tone: 'ok' as const, msg: `Licencia vigente hasta ${licenciaFin.toLocaleDateString('es-ES')}` };
  })();

  const isSecret = (v: string) => v.startsWith('••••');

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold">{a.nombre}</h2>
                  <Badge variant={a.activa ? 'default' : 'secondary'}>{a.activa ? 'Activa' : 'Inactiva'}</Badge>
                </div>
                {a.razonSocial && a.razonSocial !== a.nombre && (
                  <p className="text-sm text-muted-foreground">{a.razonSocial}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                  {a.nif && <span className="font-mono text-xs">{a.nif}</span>}
                  {a.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{a.email}</span>}
                  {a.telefono && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{a.telefono}</span>}
                  {a.web && <span className="flex items-center gap-1 truncate max-w-[220px]"><Globe className="w-3.5 h-3.5" />{a.web}</span>}
                  {a.direccion && (
                    <span className="flex items-center gap-1 truncate max-w-[260px]">
                      <MapPin className="w-3.5 h-3.5" />
                      {[a.direccion, a.codigoPostal, a.provincia, a.pais].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/seguros/aseguradoras')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Volver
            </Button>
          </div>

          {/* Vigencia de licencia */}
          {licenciaState && (
            <div className={`mt-4 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${
              licenciaState.tone === 'destructive' ? 'bg-red-50 text-red-700 border border-red-200' :
              licenciaState.tone === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {licenciaState.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {licenciaState.msg}
              {a.numeroRegistro && <span className="ml-auto text-xs opacity-70 font-mono">Reg. {a.numeroRegistro}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs por bloque */}
      <Tabs defaultValue="resumen">
        <TabsList className="flex flex-wrap h-auto gap-0.5">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="b3"><UserRound className="w-4 h-4 mr-1.5" />Representación</TabsTrigger>
          <TabsTrigger value="b4"><Settings2 className="w-4 h-4 mr-1.5" />Operativo</TabsTrigger>
          <TabsTrigger value="b5"><Landmark className="w-4 h-4 mr-1.5" />Financiero</TabsTrigger>
          <TabsTrigger value="b6"><Plug className="w-4 h-4 mr-1.5" />Integración API</TabsTrigger>
        </TabsList>

        {/* ── Resumen: bloques 1-2 + notas ── */}
        <TabsContent value="resumen" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Identificación Legal y Fiscal</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Row label="Razón Social" value={a.razonSocial} />
              <Row label="Nombre Comercial" value={a.nombreComercial} />
              <Row label="Identificación Fiscal" value={a.nif} mono />
              <Row label="Régimen Fiscal" value={a.regimenFiscal} />
              <Row label="Domicilio Fiscal" value={a.direccion} />
              <Row label="C.P. / Provincia / País" value={[a.codigoPostal, a.provincia, a.pais].filter(Boolean).join(' · ')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Regulación y Licencias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Row label="Nº Registro / Licencia" value={a.numeroRegistro} mono />
                <Row label="Vigencia — Inicio" value={a.fechaVigenciaLicenciaInicio ? new Date(a.fechaVigenciaLicenciaInicio).toLocaleDateString('es-ES') : undefined} />
                <Row label="Vigencia — Fin" value={a.fechaVigenciaLicenciaFin ? new Date(a.fechaVigenciaLicenciaFin).toLocaleDateString('es-ES') : undefined} />
              </div>
              {Array.isArray(a.ramosAutorizados) && a.ramosAutorizados.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Ramos Autorizados</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {a.ramosAutorizados.map(r => (
                      <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notas internas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Notas sobre esta aseguradora..." />
              <div className="flex justify-end">
                <Button onClick={saveNotas} disabled={savingBlock === 'notas'}>
                  {savingBlock === 'notas' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar notas
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Bloque 3: Contacto y Representación Legal ── */}
        <TabsContent value="b3">
          <BlockCard
            title="Contacto y Representación Legal"
            description="Representante legal, mesa de entradas y contactos operativos."
            onSave={saveBl3}
            saving={savingBlock === 'b3'}
          >
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Representante Legal</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField label="Nombre" value={repLegal.nombre} onChange={v => setRepLegal(p => ({ ...p, nombre: v }))} placeholder="Nombre completo" />
                <TextField label="Documento" value={repLegal.documento} onChange={v => setRepLegal(p => ({ ...p, documento: v }))} placeholder="DNI/Pasaporte" />
                <TextField label="Cargo" value={repLegal.cargo} onChange={v => setRepLegal(p => ({ ...p, cargo: v }))} placeholder="Consejera Delegada" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Mesa de Entradas / Notificaciones</Label>
              <Input value={mesaEntradas} onChange={e => setMesaEntradas(e.target.value)} placeholder="notificaciones@aseguradora.com" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contactos Operativos</p>
              <ListEditor
                items={contactos}
                onChange={setContactos}
                emptyLabel="No hay contactos operativos registrados."
                fields={[
                  { key: 'cargo', label: 'Cargo', placeholder: 'Director de Suscripción' },
                  { key: 'nombre', label: 'Nombre' },
                  { key: 'email', label: 'Email', placeholder: 'correo@aseguradora.com' },
                  { key: 'telefono', label: 'Teléfono' },
                ]}
              />
            </div>
          </BlockCard>
        </TabsContent>

        {/* ── Bloque 4: Parámetros Operativos y Comerciales ── */}
        <TabsContent value="b4">
          <BlockCard
            title="Parámetros Operativos y Comerciales"
            description="Modelos de comisión, condiciones de pago, límites de suscripción y gestión de siniestros."
            onSave={saveBl4}
            saving={savingBlock === 'b4'}
          >
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Modelos de Comisión</p>
              <ListEditor
                items={comisiones}
                onChange={setComisiones}
                emptyLabel="No hay modelos de comisión configurados."
                fields={[
                  { key: 'nombre', label: 'Nombre', placeholder: 'Comisión inicial' },
                  { key: 'tipo', label: 'Tipo', placeholder: 'inicial / renovacion / sobre_comision' },
                  { key: 'pct', label: 'Porcentaje (%)', placeholder: '15' },
                  { key: 'aplicaA', label: 'Aplica a', placeholder: 'corredor / agente / ambos' },
                ]}
              />
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Condiciones de Pago / Crédito</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Días de gracia" value={String(condiciones.diasGracia ?? '')} onChange={v => setCondiciones(p => ({ ...p, diasGracia: Number(v) || 0 }))} placeholder="30" />
                <BoolSelect
                  label="Requiere anticipo"
                  value={!!condiciones.requiereAnticipo}
                  onChange={v => setCondiciones(p => ({ ...p, requiereAnticipo: v }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Política de cancelación</Label>
                <Textarea value={condiciones.politicaCancelacion || ''} onChange={e => setCondiciones(p => ({ ...p, politicaCancelacion: e.target.value }))} rows={2} placeholder="Sin pago a los 30 días..." />
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Límites de Suscripción</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField label="Monto máximo automático" value={String(limites.montoMaximoAutomatico ?? '')} onChange={v => setLimites(p => ({ ...p, montoMaximoAutomatico: Number(v) || 0 }))} placeholder="250000" />
                <TextField label="Moneda" value={limites.moneda || ''} onChange={v => setLimites(p => ({ ...p, moneda: v }))} placeholder={monedaTenant} />
                <BoolSelect
                  label="Requiere aprobación manual"
                  value={!!limites.requiereAprobacionManual}
                  onChange={v => setLimites(p => ({ ...p, requiereAprobacionManual: v }))}
                />
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gestión de Siniestros</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <TextField label="SLA respuesta (horas)" value={String(siniestros.slaRespuestaHoras ?? '')} onChange={v => setSiniestros(p => ({ ...p, slaRespuestaHoras: Number(v) || 0 }))} placeholder="24" />
                <TextField label="Límite de indemnización" value={String(siniestros.limiteIndemnizacion ?? '')} onChange={v => setSiniestros(p => ({ ...p, limiteIndemnizacion: Number(v) || 0 }))} placeholder="1000000" />
                <TextField label="Tipo de límite" value={siniestros.tipoLimite || ''} onChange={v => setSiniestros(p => ({ ...p, tipoLimite: v }))} placeholder="por_poliza / por_evento / deducible" />
                <TextField label="Deducible" value={deducibleStr} onChange={setDeducibleStr} placeholder="500" />
              </div>
            </div>
          </BlockCard>
        </TabsContent>

        {/* ── Bloque 5: Configuración Financiera y Bancaria ── */}
        <TabsContent value="b5">
          <BlockCard
            title="Configuración Financiera y Bancaria"
            description="Cuentas bancarias operativas y monedas de trabajo."
            onSave={saveBl5}
            saving={savingBlock === 'b5'}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="Moneda base" value={monedaBase} onChange={setMonedaBase} placeholder={monedaTenant} />
              <TextField label="Moneda de liquidación" value={monedaLiquidacion} onChange={setMonedaLiquidacion} placeholder={monedaTenant} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cuentas Bancarias</p>
              <ListEditor
                items={cuentas}
                onChange={setCuentas}
                emptyLabel="No hay cuentas bancarias registradas."
                fields={[
                  { key: 'banco', label: 'Banco' },
                  { key: 'tipoCuenta', label: 'Tipo', placeholder: 'operativa / recaudacion / pago_siniestros / comisiones' },
                  { key: 'numeroCuenta', label: 'Nº de cuenta' },
                  { key: 'clabe', label: 'CLABE' },
                  { key: 'iban', label: 'IBAN' },
                  { key: 'swift', label: 'SWIFT' },
                  { key: 'moneda', label: 'Moneda', placeholder: monedaTenant },
                ]}
              />
            </div>
          </BlockCard>
        </TabsContent>

        {/* ── Bloque 6: Integración Técnica y Seguridad ── */}
        <TabsContent value="b6">
          <BlockCard
            title="Integración Técnica y Seguridad"
            description="Credenciales API (enmascaradas en lecturas), endpoints y formatos de intercambio."
            onSave={saveBl6}
            saving={savingBlock === 'b6'}
          >
            <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg">
              🔒 Los valores que empiezan con <span className="font-mono">••••</span> están enmascarados: se conservan tal cual si no los tocas. Si los borras o escribes un valor nuevo, el secreto real se reemplazará.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="API Key" value={apiKey} onChange={setApiKey} placeholder={isSecret(apiKey) ? '•••••••• (enmascarada)' : 'Ingresa la API key'} mono />
              <TextField label="OAuth — Token URL" value={oauthTokenUrl} onChange={setOauthTokenUrl} placeholder="https://api.aseguradora.com/oauth/token" />
              <TextField label="OAuth — Client ID" value={oauthClientId} onChange={setOauthClientId} mono />
              <TextField label="OAuth — Client Secret" value={oauthClientSecret} onChange={setOauthClientSecret} mono />
              <TextField label="Endpoint Staging" value={endpointStaging} onChange={setEndpointStaging} placeholder="https://staging.api.aseguradora.com/v1" mono />
              <TextField label="Endpoint Producción" value={endpointProd} onChange={setEndpointProd} placeholder="https://api.aseguradora.com/v1" mono />
              <TextField label="Formatos de intercambio" value={formatos} onChange={setFormatos} placeholder="JSON, XML, EDI (separados por coma)" />
              <TextField label="Certificado SSL" value={certSsl} onChange={setCertSsl} mono />
              <TextField label="Firma digital" value={certFirma} onChange={setCertFirma} mono />
            </div>
          </BlockCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
