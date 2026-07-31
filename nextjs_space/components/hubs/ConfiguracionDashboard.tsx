
'use client';

import { useState, useEffect } from "react";
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
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { ALL_MODULES } from "@/lib/plans";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

interface ConfiguracionDashboardProps {
  activeSection: string;
}

export function ConfiguracionDashboard({ activeSection }: ConfiguracionDashboardProps) {
  const router = useRouter();
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantModules, setTenantModules] = useState<string[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);

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
    try {
      const res = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Configuración guardada");
      } else {
        toast.error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

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
                  <Button onClick={handleSaveConfig} className="premium-gradient-primary rounded-full px-8">
                    {saving ? "Guardando..." : "Guardar Cambios"}
                  </Button>
                </CardContent>
              </Card>

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
                  <Button onClick={handleSaveConfig} className="premium-gradient-primary rounded-full px-8">
                    {saving ? "Guardando..." : "Guardar Cambios"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === "horarios" && (
            <HorariosMultiplesEditor 
              value={config.horariosAtencion} 
              onChange={(h) => setConfig({ ...config, horariosAtencion: h })} 
            />
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
