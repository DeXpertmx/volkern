
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
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { WhitelabelConfig } from "@/components/whitelabel-config";
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
import Link from "next/link";

interface ConfiguracionDashboardProps {
  activeSection: string;
}

export function ConfiguracionDashboard({ activeSection }: ConfiguracionDashboardProps) {
  const router = useRouter();
  const [config, setConfig] = useState<any>({});
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
