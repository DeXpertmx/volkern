"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
  Settings,
  User,
  Building,
  Clock,
  Bell,
  Calculator,
  PhoneCall,
  RotateCw,
  FileText,
  Palette,
  Plug,
  ShieldCheck,
  Save,
  Globe,
  Upload,
  Key,
  CreditCard
} from "lucide-react";
import { toast } from "sonner";
import { WhitelabelConfig } from "@/components/whitelabel-config";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import HorariosMultiplesEditor, { HorariosConfig } from "@/components/HorariosMultiplesEditor";
import FiscalConfigSection from "@/components/fiscal/FiscalConfigSection";
import { TelephonyConfigSection } from "@/components/dashboard/TelephonyConfigSection";
import { LeadAssignmentConfig } from "@/components/dashboard/LeadAssignmentConfig";
import { DocumentTemplatesList } from "@/components/dashboard/DocumentTemplatesList";
import { LeadFieldsConfig } from "@/components/dashboard/LeadFieldsConfig";
import { Switch } from "@/components/ui/switch";
import Image from "next/image";

interface Config {
  business_name?: string;
  business_email?: string;
  timezone?: string;
  admin_email?: string;
  from_name?: string;
  logo_corporativo?: string;
  [key: string]: any;
}

export default function ConfiguracionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSection = searchParams.get("section") || "empresa";

  const [config, setConfig] = useState<Config>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  




  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/configuracion");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    } finally {
      setLoading(false);
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



  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-4xl font-black tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-lg">Gestiona tu cuenta, empresa y módulos del sistema.</p>
      </header>

      <div>
        <main className="w-full max-w-4xl mx-auto min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >


              {activeSection === "empresa" && (
                <Card className="shadow-xl">
                  <CardHeader>
                    <CardTitle>Datos de la Empresa</CardTitle>
                    <CardDescription>Configuración global de tu negocio.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Nombre Comercial</Label>
                        <Input 
                          value={config.business_name || ""} 
                          onChange={e => setConfig({...config, business_name: e.target.value})} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Correo de Soporte</Label>
                        <Input 
                          value={config.business_email || ""} 
                          onChange={e => setConfig({...config, business_email: e.target.value})} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Zona Horaria</Label>
                        <Input 
                          value={config.timezone || ""} 
                          onChange={e => setConfig({...config, timezone: e.target.value})} 
                        />
                      </div>
                    </div>
                    <Button onClick={handleSaveConfig} className="premium-gradient-primary rounded-full px-8">
                      {saving ? "Guardando..." : "Guardar Cambios"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {activeSection === "horarios" && <HorariosMultiplesEditor />}
              {activeSection === "fiscal" && <FiscalConfigSection />}
              {activeSection === "telefonia" && <TelephonyConfigSection />}
              {activeSection === "reparto" && <LeadAssignmentConfig />}
              {activeSection === "leads" && <LeadFieldsConfig />}
              {activeSection === "documentos" && <DocumentTemplatesList onPreview={() => {}} />}
              {activeSection === "whitelabel" && <WhitelabelConfig />}
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
              {activeSection === "facturacion" && (
                <div className="p-12 text-center">
                  <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-bold mb-2">Membresía y Facturación</h3>
                  <p className="text-muted-foreground mb-6">Gestiona tu suscripción y métodos de pago.</p>
                  <Button onClick={() => router.push("/dashboard/configuracion/billing")} className="rounded-full px-10">Ver Planes</Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function ExternalLink(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" x2="21" y1="14" y2="3" />
    </svg>
  );
}
