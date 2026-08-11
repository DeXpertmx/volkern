
'use client';

import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building,
  Plug,
  ExternalLink,
  CreditCard,
  Loader2,
  LayoutGrid,
  Info,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { WhitelabelConfig } from "@/components/whitelabel-config";
import { ComplianceModeToggle } from "@/components/compliance/ComplianceModeToggle";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import HorariosMultiplesEditor from "@/components/HorariosMultiplesEditor";
import FiscalConfigSection from "@/components/fiscal/FiscalConfigSection";
import { TelephonyConfigSection } from "@/components/dashboard/TelephonyConfigSection";
import { LeadAssignmentConfig } from "@/components/dashboard/LeadAssignmentConfig";
import { DocumentTemplatesList } from "@/components/dashboard/DocumentTemplatesList";
import { LeadFieldsConfig } from "@/components/dashboard/LeadFieldsConfig";
import { ImageUploader } from "@/components/ui/image-uploader";
import EqualityConfigSection from "@/components/equality/EqualityConfigSection";
import { NotificationConfig } from "@/components/dashboard/notifications/NotificationConfig";
import { EmailSmtpConfig } from "@/components/dashboard/email/EmailSmtpConfig";
import { ConfigHistorial } from "@/components/config/ConfigHistorial";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { ALL_MODULES } from "@/lib/plans";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SUPPORTED_CURRENCIES, type Currency } from "@/lib/insurance/currency";
import { Banknote, AlertTriangle, Euro } from "lucide-react";

// ─── Timezone options (IANA, curated for ES + LatAm + NA + UTC) ───────────────
const TIMEZONES: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: 'España y Europa',
    options: [
      { value: 'Europe/Madrid', label: 'Madrid (CET / CEST)' },
      { value: 'Europe/Barcelona', label: 'Barcelona' },
      { value: 'Europe/London', label: 'Londres (GMT / BST)' },
      { value: 'Europe/Paris', label: 'París (CET / CEST)' },
      { value: 'Europe/Berlin', label: 'Berlín (CET / CEST)' },
      { value: 'Europe/Lisbon', label: 'Lisboa (WET / WEST)' },
    ],
  },
  {
    group: 'América Latina',
    options: [
      { value: 'America/Mexico_City', label: 'Ciudad de México (CT)' },
      { value: 'America/Monterrey', label: 'Monterrey (CT)' },
      { value: 'America/Cancun', label: 'Cancún (EST)' },
      { value: 'America/Bogota', label: 'Bogotá (COT)' },
      { value: 'America/Lima', label: 'Lima (PET)' },
      { value: 'America/Santiago', label: 'Santiago (CLT)' },
      { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (ART)' },
      { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
      { value: 'America/Caracas', label: 'Caracas (VET)' },
      { value: 'America/La_Paz', label: 'La Paz (BOT)' },
      { value: 'America/Montevideo', label: 'Montevideo (UYT)' },
      { value: 'America/Guayaquil', label: 'Guayaquil (ECT)' },
      { value: 'America/Panama', label: 'Panamá (EST)' },
      { value: 'America/Costa_Rica', label: 'Costa Rica (CST)' },
      { value: 'America/Guatemala', label: 'Guatemala (CST)' },
    ],
  },
  {
    group: 'América del Norte',
    options: [
      { value: 'America/New_York', label: 'Nueva York (ET)' },
      { value: 'America/Chicago', label: 'Chicago (CT)' },
      { value: 'America/Denver', label: 'Denver (MT)' },
      { value: 'America/Los_Angeles', label: 'Los Ángeles (PT)' },
      { value: 'America/Toronto', label: 'Toronto (ET)' },
      { value: 'America/Phoenix', label: 'Phoenix (MST, sin DST)' },
    ],
  },
  {
    group: 'Otros',
    options: [
      { value: 'UTC', label: 'UTC' },
      { value: 'Atlantic/Canary', label: 'Canarias (WET / WEST)' },
    ],
  },
]

// ─── Detect the browser's IANA timezone (e.g. "Europe/Madrid") ────────────────
function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid'
  } catch {
    return 'Europe/Madrid'
  }
}

// ─── Sub-componente: Moneda de Reporte ────────────────────────────────────────
//
// Permite al propio tenant (no requiere admin) cambiar la moneda de reporte
// usada por /dashboard/seguros/portfolio (KPIs, mix por ramo, top aseguradoras,
// forecast). Cooldown de 24h aplicado server-side para evitar sabotaje por
// crashloop de UI.
//
// Por qué existe: `Tenant.moneda` defaults a 'MXN' en el schema. Si el tenant
// nunca lo cambió y luego importa pólizas en otra moneda (EUR, USD…), el
// portfolio ejecutivo muestra el KPI global convertido a la moneda del tenant,
// confundiendo al broker ("yo manejo Euros pero veo MXN").
function MonedaReporteCard({ onChanged }: { onChanged?: () => void }) {
  const [monedaActual, setMonedaActual] = useState<string>('MXN');
  const [monedaNueva, setMonedaNueva] = useState<string>('MXN');
  const [loadingMoneda, setLoadingMoneda] = useState(true);
  const [savingMoneda, setSavingMoneda] = useState(false);
  const [errorMoneda, setErrorMoneda] = useState<string | null>(null);
  const [cooldownMinutos, setCooldownMinutos] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tenant/moneda');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setMonedaActual(data.moneda || 'MXN');
            setMonedaNueva(data.moneda || 'MXN');
          }
        }
      } catch (e) {
        // Silencioso: el usuario puede intentar igualmente.
      } finally {
        if (!cancelled) setLoadingMoneda(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGuardarMoneda = async () => {
    setErrorMoneda(null);
    setCooldownMinutos(null);
    if (monedaNueva === monedaActual) {
      toast.info('La moneda no ha cambiado');
      return;
    }
    setSavingMoneda(true);
    try {
      const res = await fetch('/api/tenant/moneda', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moneda: monedaNueva }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.mensaje || `Moneda actualizada a ${monedaNueva}`);
        setMonedaActual(data.moneda);
        if (onChanged) onChanged();
      } else {
        const data = await res.json();
        setErrorMoneda(data.error || 'Error al guardar');
        if (res.status === 429 && typeof data.error === 'string') {
          const match = data.error.match(/(\d+)\s*minutos/i);
          if (match) setCooldownMinutos(Number(match[1]));
        }
      }
    } catch (e: any) {
      setErrorMoneda('Error de conexión');
    } finally {
      setSavingMoneda(false);
    }
  };

  const currencyLabels: Record<string, string> = {
    EUR: 'Euro (€)',
    USD: 'Dólar estadounidense ($)',
    MXN: 'Peso mexicano ($)',
    GBP: 'Libra esterlina (£)',
    JPY: 'Yen japonés (¥)',
    CNY: 'Yuan renminbi (¥)',
    CAD: 'Dólar canadiense ($)',
    BRL: 'Real brasileño (R$)',
    CLP: 'Peso chileno ($)',
    ARS: 'Peso argentino ($)',
    COP: 'Peso colombiano ($)',
    PEN: 'Sol peruano (S/)',
  };

  const symbolOf = (code: string) => {
    if (['EUR'].includes(code)) return '€';
    if (['GBP'].includes(code)) return '£';
    if (['JPY', 'CNY'].includes(code)) return '¥';
    if (['PEN'].includes(code)) return 'S/';
    if (['BRL'].includes(code)) return 'R$';
    return '$';
  };

  return (
    <Card className="shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-emerald-600" />
          Moneda de Reporte
        </CardTitle>
        <CardDescription>
          Moneda en la que se muestran los agregados financieros del portfolio ejecutivo de Seguros
          (KPIs, mix por ramo, top aseguradoras, forecast). Cada póliza conserva su moneda nativa
          individual — esta moneda solo define el “target” al que se convierten los importes para los
          totales.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingMoneda ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando moneda actual…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">
                  Moneda actual
                </span>
                <span className="text-xl font-bold text-emerald-800">{monedaActual}</span>
                <span className="text-2xl font-bold text-emerald-700">{symbolOf(monedaActual)}</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Esta moneda aparece en el chip junto al botón «Refrescar» del portfolio ejecutivo.
                      Si aquí ves MXN pero el broker maneja Euros, es porque este campo nunca fue
                      actualizado desde el alta del tenant (defaults a MXN).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="moneda-reporte">Cambiar moneda de reporte</Label>
                <select
                  id="moneda-reporte"
                  value={monedaNueva}
                  onChange={e => {
                    setMonedaNueva(e.target.value);
                    setErrorMoneda(null);
                    setCooldownMinutos(null);
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c} value={c}>
                      {c} — {currencyLabels[c] || c}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground italic">
                  12 monedas soportadas. Tasas FX estáticas en lib/insurance/currency.ts.
                </p>
              </div>
            </div>

            {errorMoneda && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-900">
                  <p className="font-semibold">{errorMoneda}</p>
                  {cooldownMinutos !== null && (
                    <p className="mt-1">
                      Si necesitas un cambio urgente y no puedes esperar, contacta al superadmin
                      desde el panel /admin/tenants/{'{tenant}'}/modules.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={handleGuardarMoneda}
                disabled={savingMoneda || monedaNueva === monedaActual}
                className="premium-gradient-primary rounded-full px-8"
              >
                {savingMoneda && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Guardar Moneda
              </Button>
              {monedaNueva !== monedaActual && (
                <span className="text-xs text-amber-700 font-medium">
                  ⚠️ Cambiará los totales en /dashboard/seguros/portfolio (cooldown 24h entre cambios)
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ConfiguracionDashboardProps {
  activeSection: string;
}

export function ConfiguracionDashboard({ activeSection }: ConfiguracionDashboardProps) {
  const router = useRouter();
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tenantModules, setTenantModules] = useState<string[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  // Horarios: auto-guardado debounced + estado visual
  const [horariosDirty, setHorariosDirty] = useState(false);
  const [savingHorarios, setSavingHorarios] = useState(false);
  const [horariosSaveState, setHorariosSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const horariosIdleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const CORE_MODULES = ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'equipo', 'configuracion', 'conocimiento'];

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (activeSection === 'modulos') fetchModules();
  }, [activeSection]);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/configuracion");
      if (res.ok) {
        const data = await res.json();
        // Si el tenant nunca tuvo timezone guardada, autoset del navegador (no pisa elección del usuario si ya tenía una).
        if (!data.timezone) {
          data.timezone = detectBrowserTimezone()
        }
        setConfig(data);
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchModules = async () => {
    setModulesLoading(true);
    try {
      const res = await fetch('/api/tenant/modules');
      if (res.ok) {
        const data = await res.json();
        setTenantModules(data.modules || []);
      }
    } catch (error) {
      console.error('Error fetching modules:', error);
    } finally {
      setModulesLoading(false);
    }
  };

  const toggleModule = async (moduleId: string, currentEnabled: boolean) => {
    if (CORE_MODULES.includes(moduleId) && currentEnabled) return; // No desactivar core
    setTogglingModule(moduleId);
    try {
      const res = await fetch('/api/tenant/modules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, habilitado: !currentEnabled }),
      });
      if (res.ok) {
        setTenantModules(prev =>
          !currentEnabled ? [...prev, moduleId] : prev.filter(m => m !== moduleId)
        );
        toast.success(`Módulo ${!currentEnabled ? 'activado' : 'desactivado'}`);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al cambiar módulo');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setTogglingModule(null);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveState('saving');
    if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
    try {
      const res = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Configuración guardada");
        setSaveState('saved');
        // El POST de configuración completa ya incluye horariosAtencion
        setHorariosDirty(false);
        saveStateTimer.current = setTimeout(() => setSaveState('idle'), 2500);
      } else {
        setSaveState('error');
        toast.error("Error al guardar");
      }
    } catch (error) {
      setSaveState('error');
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const saveHorarios = async () => {
    // Limpiar el reset visual pendiente para evitar carreras del indicador
    if (horariosIdleTimeout.current) {
      clearTimeout(horariosIdleTimeout.current);
      horariosIdleTimeout.current = null;
    }
    setSavingHorarios(true);
    setHorariosSaveState('saving');
    try {
      const res = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horariosAtencion: config.horariosAtencion }),
      });
      if (res.ok) {
        setHorariosSaveState('saved');
        setHorariosDirty(false);
        toast.success("Horarios guardados");
        horariosIdleTimeout.current = setTimeout(() => setHorariosSaveState('idle'), 2500);
      } else {
        setHorariosSaveState('error');
        toast.error("Error al guardar horarios");
      }
    } catch (error) {
      setHorariosSaveState('error');
      toast.error("Error de conexión");
    } finally {
      setSavingHorarios(false);
    }
  };

  // ─── Auto-guardado de horarios (debounced, solo tras edición del usuario) ───
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!horariosDirty || !config.horariosAtencion) return;
    const timer = setTimeout(() => {
      saveHorarios();
    }, 900);
    return () => clearTimeout(timer);
  }, [config.horariosAtencion, horariosDirty]);

  if (loading) return <div className="p-12 text-center animate-pulse">Cargando configuración...</div>;

  return (
    <div className="w-full max-w-4xl mx-auto min-w-0">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {activeSection === "modulos" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Gestión de Módulos</h2>
                <p className="text-muted-foreground">Activa o desactiva las funcionalidades de tu cuenta. Los módulos esenciales no se pueden desactivar.</p>
              </div>

              {modulesLoading ? (
                <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="space-y-4">
                  {Array.from(new Set(ALL_MODULES.map(m => m.group))).map(group => (
                    <Card key={group} className="shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <LayoutGrid className="h-4 w-4 text-primary" />
                          {group}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {ALL_MODULES.filter(m => m.group === group).map(mod => {
                            const isEnabled = tenantModules.includes(mod.id);
                            const isCore = CORE_MODULES.includes(mod.id) && isEnabled;
                            const isToggling = togglingModule === mod.id;

                            return (
                              <div
                                key={mod.id}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                  isEnabled ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-muted'
                                } ${isCore ? 'opacity-80' : ''}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate">{mod.label}</span>
                                    {isCore && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="h-3 w-3 text-amber-500 flex-shrink-0" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p className="text-xs">Módulo esencial — no se puede desactivar</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">{mod.description}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isToggling ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                  ) : (
                                    <Switch
                                      checked={isEnabled}
                                      onCheckedChange={() => toggleModule(mod.id, isEnabled)}
                                      disabled={isCore}
                                    />
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === "empresa" && (
            <div className="space-y-6">
              <Card className="shadow-xl">
                <CardHeader>
                  <CardTitle>Datos de la Empresa</CardTitle>
                  <CardDescription>Configuración global de tu negocio.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="business-name">Nombre Comercial</Label>
                      <Input
                        id="business-name"
                        value={config.business_name || ""} 
                        onChange={e => setConfig({...config, business_name: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="support-email">Correo de Soporte</Label>
                      <Input
                        id="support-email"
                        value={config.business_email || ""} 
                        onChange={e => setConfig({...config, business_email: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Zona Horaria</Label>
                      <select
                        id="timezone"
                        value={config.timezone || 'Europe/Madrid'}
                        onChange={e => setConfig({ ...config, timezone: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {TIMEZONES.map(group => (
                          <optgroup key={group.group} label={group.group}>
                            {group.options.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <p className="text-[10px] text-muted-foreground italic">
                        Detectado del navegador: {detectBrowserTimezone()}
                        {config.timezone !== detectBrowserTimezone() && (
                          <span className="ml-1 text-amber-600">· distinto de la selección</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button onClick={handleSaveConfig} className="premium-gradient-primary rounded-full px-8">
                      {saving ? "Guardando..." : "Guardar Cambios"}
                    </Button>
                    {saveState === 'saved' && (
                      <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">Guardado ✓</span>
                    )}
                    {saveState === 'error' && (
                      <span className="text-sm text-red-600 font-medium flex items-center gap-1">Error al guardar — reintenta</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <MonedaReporteCard onChanged={() => fetchConfig()} />

              <Card className="shadow-xl">
                <CardHeader>
                  <CardTitle>Identidad Visual</CardTitle>
                  <CardDescription>Configura el logotipo de tu empresa.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Logo Corporativo</Label>
                    <ImageUploader 
                      images={config.logo_corporativo ? [config.logo_corporativo] : []}
                      onChange={(imgs) => setConfig({...config, logo_corporativo: imgs[0] || ""})}
                      maxImages={1}
                    />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button onClick={handleSaveConfig} className="premium-gradient-primary rounded-full px-8">
                      {saving ? "Guardando..." : "Guardar Cambios"}
                    </Button>
                    {saveState === 'saved' && (
                      <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">Guardado ✓</span>
                    )}
                    {saveState === 'error' && (
                      <span className="text-sm text-red-600 font-medium flex items-center gap-1">Error al guardar — reintenta</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === "horarios" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Horarios de Atención</h2>
                  <p className="text-sm text-muted-foreground">Define tu horario semanal. Los cambios se guardan automáticamente.</p>
                </div>
                <div className="flex items-center gap-3">
                  {horariosSaveState === 'saving' && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Guardando...
                    </span>
                  )}
                  {horariosSaveState === 'saved' && (
                    <span className="text-xs text-green-600 font-medium">Guardado ✓</span>
                  )}
                  {horariosSaveState === 'error' && (
                    <span className="text-xs text-red-500 font-medium">Error al guardar — reintenta</span>
                  )}
                  <Button
                    onClick={saveHorarios}
                    disabled={savingHorarios}
                    className="premium-gradient-primary rounded-full px-6"
                  >
                    {savingHorarios && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Guardar Horarios
                  </Button>
                </div>
              </div>
              <Card className="shadow-sm">
                <CardContent className="pt-6">
                  <HorariosMultiplesEditor
                    value={config.horariosAtencion}
                    onChange={(h) => {
                      setConfig({ ...config, horariosAtencion: h });
                      setHorariosDirty(true);
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          )}
          {activeSection === "fiscal" && <FiscalConfigSection />}
          {activeSection === "telefonia" && <TelephonyConfigSection tenantId={config._tenantId || ""} />}
          {activeSection === "reparto" && <LeadAssignmentConfig />}
          {activeSection === "leads" && <LeadFieldsConfig />}
          {activeSection === "documentos" && <DocumentTemplatesList />}
          {activeSection === "whitelabel" && <WhitelabelConfig />}
          {activeSection === "igualdad" && <EqualityConfigSection />}
          
          {activeSection === "integraciones" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Integraciones</h2>
                  <p className="text-muted-foreground">Gestiona tus conexiones externas.</p>
                </div>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/dashboard/integraciones">
                    Abrir Gestor <ExternalLink className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
              <Card className="p-12 text-center border-dashed">
                <Plug className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold mb-2">Conecta tus herramientas</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  Elige entre Meta Pixel, Google Analytics, Twilio, Stripe y más para potenciar tu CRM.
                </p>
                <Button className="rounded-full px-10" asChild>
                  <Link href="/dashboard/integraciones">Ver todas las integraciones</Link>
                </Button>
              </Card>
            </div>
          )}
          
          {activeSection === "compliance" && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight">Control de Compliance</h2>
                <p className="text-sm text-muted-foreground">
                  Activa el Modo Compliance para proteger procesos críticos con reglas obligatorias no evitables.
                </p>
              </div>
              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <ComplianceModeToggle />
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Reglas Activas</CardTitle>
                  <CardDescription>
                    Estas son las reglas que se evalúan cuando el Modo Compliance está activo.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { icon: '🔴', name: 'Cerrar deal ganado', desc: 'Requiere contrato firmado asociado' },
                      { icon: '🔴', name: 'Activar contrato', desc: 'Requiere ambas firmas digitales (cliente + empresa)' },
                      { icon: '🟡', name: 'Avanzar pipeline', desc: 'Requiere tareas obligatorias completadas' },
                      { icon: '🟡', name: 'Enviar cotización', desc: 'Requiere aprobación Manager si >5.000€' },
                      { icon: '🟡', name: 'Cerrar deal perdido', desc: 'Requiere razón de pérdida documentada' },
                      { icon: '🟢', name: 'Eliminar contacto', desc: 'Requiere justificación escrita ≥10 caracteres' },
                    ].map((rule, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-base">{rule.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{rule.name}</p>
                          <p className="text-xs text-slate-500">{rule.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === "notificaciones" && (
            <div className="py-6">
              <NotificationConfig />
            </div>
          )}

          {activeSection === "email" && <EmailSmtpConfig />}

          {activeSection === "historial" && <ConfigHistorial />}

          {activeSection === "billing" && (
            <div className="p-12 text-center">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-bold mb-2">Membresía y Facturación</h3>
              <p className="text-muted-foreground mb-6">Gestiona tu suscripción y métodos de pago.</p>
              <Button onClick={() => router.push("/dashboard/configuracion/billing")} className="rounded-full px-10">Ver Planes</Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
