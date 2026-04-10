"use client";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  Save,
  Globe,
  Mail,
  Clock,
  CreditCard,
  Palette,
  Upload,
  Image as ImageIcon,
  Key,
  ArrowRight,
  User,
  Lock,
  Calculator,
  Calendar,
  Building,
  FileText,
  CheckCircle2,
  AlertCircle,
  PhoneCall,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { WhitelabelConfig } from "@/components/whitelabel-config";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import HorariosMultiplesEditor, {
  HorariosConfig,
} from "@/components/HorariosMultiplesEditor";
import FiscalConfigSection from "@/components/fiscal/FiscalConfigSection";
import { TelephonyConfigSection } from "@/components/dashboard/TelephonyConfigSection";
import { DocumentTemplatesList } from "@/components/dashboard/DocumentTemplatesList";
import { TemplatePreviewModal } from "@/components/documents/TemplatePreviewModal";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Sparkles,
  Bell,
  BellRing,
  BellOff,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

interface Config {
  business_name?: string;
  business_email?: string;
  timezone?: string;
  admin_email?: string;
  from_name?: string;
  stripe_publishable_key?: string;
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  horariosAtencion?: HorariosConfig;
  logo_corporativo?: string;
  [key: string]: string | HorariosConfig | undefined;
}

export default function ConfiguracionPage() {
  const router = useRouter();
  const [config, setConfig] = useState<Config>({});
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Estado para cambio de contraseña
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Estado para datos del usuario (perfil personal)
  const [userData, setUserData] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [savingUser, setSavingUser] = useState(false);

  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [customTemplates, setCustomTemplates] = useState<any[]>([]);
  const [previewConfigTpl, setPreviewConfigTpl] = useState<any | null>(null);

  const ORDER_MOCKS: Record<string, any> = {
    default: {
      titulo: "Orden Estándar Profesional",
      clausulas: `
        <div style="padding: 2.5rem; background: #fff; min-height: 297mm; border-top: 8px solid #3b82f6;">
          <header style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3rem;">
            <div>
              <div style="font-size: 2.5rem; font-weight: 900; color: #1e3a8a; letter-spacing: -2px;">LOGO</div>
              <div style="font-size: 0.875rem; color: #64748b; font-weight: 700;">{{empresa.nombre}}</div>
            </div>
            <div style="text-align: right;">
              <h1 style="font-size: 1.75rem; font-weight: 900; color: #1e3a8a; margin: 0;">ORDEN DE VENTA</h1>
              <p style="font-size: 0.875rem; color: #94a3b8; font-weight: 800;">#003691</p>
              <p style="font-size: 0.75rem; color: #94a3b8;">{{fecha.hoy}}</p>
            </div>
          </header>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 3rem;">
            <div style="background: #f8fafc; padding: 1.5rem; border-radius: 1rem; border: 1px solid #e2e8f0;">
              <h3 style="font-size: 0.75rem; color: #3b82f6; font-weight: 900; text-transform: uppercase; margin-bottom: 0.75rem;">FACTURAR A:</h3>
              <p style="font-size: 1rem; font-weight: 800; color: #1e293b; margin: 0;">{{lead.nombre}}</p>
              <p style="font-size: 0.875rem; color: #64748b;">{{lead.email}}</p>
              <p style="font-size: 0.875rem; color: #64748b;">{{lead.empresa}}</p>
            </div>
            <div style="background: #f8fafc; padding: 1.5rem; border-radius: 1rem; border: 1px solid #e2e8f0;">
              <h3 style="font-size: 0.75rem; color: #3b82f6; font-weight: 900; text-transform: uppercase; margin-bottom: 0.75rem;">DESDE:</h3>
              <p style="font-size: 1rem; font-weight: 800; color: #1e293b; margin: 0;">{{empresa.nombre}}</p>
              <p style="font-size: 0.875rem; color: #64748b;">{{empresa.direccion}}</p>
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem;">
            <thead>
              <tr style="background: #3b82f6; color: white;">
                <th style="padding: 1rem; text-align: left; font-size: 0.75rem; font-weight: 900; letter-spacing: 1px;">DESCRIPCIÓN</th>
                <th style="padding: 1rem; text-align: center; font-size: 0.75rem; font-weight: 900; letter-spacing: 1px; width: 80px;">CANT.</th>
                <th style="padding: 1rem; text-align: right; font-size: 0.75rem; font-weight: 900; letter-spacing: 1px; width: 120px;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px dotted #e2e8f0;">
                <td style="padding: 1.5rem 1rem;">
                  <div style="font-weight: 800; color: #1e293b;">Licencia Enterprise Volkern</div>
                  <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">Acceso completo 12 meses.</div>
                </td>
                <td style="padding: 1.5rem 1rem; text-align: center; font-weight: 700;">1</td>
                <td style="padding: 1.5rem 1rem; text-align: right; font-weight: 800;">$5,400.00</td>
              </tr>
            </tbody>
          </table>
          <div style="display: flex; justify-content: flex-end;">
            <div style="width: 300px; background: #1e3a8a; color: white; padding: 1.5rem; border-radius: 1rem;">
              <div style="display: flex; justify-content: space-between; font-weight: 900;">
                <span style="font-size: 0.875rem;">SUBTOTAL</span>
                <span style="font-size: 0.875rem;">$5,400.00</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-weight: 900; margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 1rem; font-size: 1.25rem;">
                <span>TOTAL</span>
                <span>$5,400.00</span>
              </div>
            </div>
          </div>
        </div>
      `,
      templateData: { css: "body { font-family: 'Inter', sans-serif; }" }
    },
    modern: {
      titulo: "Orden Moderna Glass",
      clausulas: `
        <div style="padding: 4rem; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); min-height: 297mm; border-radius: 40px; margin: 1rem; border: 1rem solid white; box-shadow: inset 0 0 40px rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4rem;">
            <h1 style="font-size: 3rem; font-weight: 900; color: #0369a1; letter-spacing: -3px;">Volkern <span style="font-weight: 400; color: #0284c7;">Order</span></h1>
            <div style="background: white; padding: 1rem 2rem; border-radius: 100px; box-shadow: 0 10px 20px -10px rgba(0,0,0,0.1); font-weight: 900; font-size: 0.875rem; color: #0369a1;">#BK-8822</div>
          </div>
          <div style="background: rgba(255,255,255,0.4); backdrop-filter: blur(20px); border-radius: 2rem; border: 1px solid rgba(255,255,255,0.6); padding: 3rem; margin-bottom: 3rem; box-shadow: 0 20px 40px -20px rgba(0,0,0,0.05);">
            <p style="font-size: 1.5rem; color: #0c4a6e; font-weight: 800; margin-bottom: 1rem;">¡Hola, {{lead.nombre}}!</p>
            <p style="font-size: 1rem; color: #0284c7; line-height: 1.6;">Estamos encantados de confirmar tu pedido de servicios premium para <strong>{{lead.empresa}}</strong>. Aquí tienes los detalles destacados de tu inversión tecnológica.</p>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div style="background: white; padding: 2rem; border-radius: 1.5rem;">
               <div style="font-size: 0.75rem; font-weight: 900; color: #0284c7; margin-bottom: 1rem;">PRODUCTOS</div>
               <div style="font-size: 1.125rem; font-weight: 800;">Servicios Globales Volkern</div>
               <div style="font-size: 2rem; font-weight: 900; color: #0369a1; margin-top: 1rem;">$12,500.00</div>
            </div>
          </div>
        </div>
      `,
      templateData: { css: "" }
    },
    minimal: {
      titulo: "Minimalismo Premium",
      clausulas: `
        <div style="padding: 6rem; background: #fff; min-height: 297mm; font-family: serif;">
          <header style="border-bottom: 1px solid #000; padding-bottom: 3rem; margin-bottom: 6rem; display: flex; justify-content: space-between; align-items: baseline;">
            <h1 style="font-size: 3rem; font-weight: 100; letter-spacing: -2px;">Statement</h1>
            <span style="font-size: 0.875rem;">Ref. VOL/24-01</span>
          </header>
          <div style="font-size: 1.25rem; line-height: 2; margin-bottom: 6rem;">
            A la atención de <strong>{{lead.nombre}}</strong>,<br/>
            Se emite la presente orden para formalizar la contratación de <i>Servicios Estratégicos</i> por un total de <strong>$8,000.00</strong>.
          </div>
          <div style="display: flex; gap: 4rem;">
            <div style="flex: 1;">
              <h3 style="font-size: 0.75rem; border-bottom: 1px solid #000; padding-bottom: 0.5rem; margin-bottom: 1rem; text-transform: uppercase;">Emisor</h3>
              <p style="font-size: 0.875rem;">{{empresa.nombre}}</p>
            </div>
            <div style="flex: 1;">
              <h3 style="font-size: 0.75rem; border-bottom: 1px solid #000; padding-bottom: 0.5rem; margin-bottom: 1rem; text-transform: uppercase;">Receptor</h3>
              <p style="font-size: 0.875rem;">{{lead.nombre}}</p>
            </div>
          </div>
        </div>
      `,
      templateData: { css: "" }
    },
    corporate: {
      titulo: "Factura Corporativa",
      clausulas: `
        <div style="padding: 40px; background: #fdfdfd; min-height: 297mm; border: 1px solid #eee;">
          <header style="display: flex; justify-content: space-between; margin-bottom: 50px;">
            <div style="width: 250px;">
              <div style="background: #1e293b; color: white; padding: 15px; font-weight: 900; font-size: 1.5rem; text-align: center;">CORPORATE</div>
              <div style="font-size: 0.75rem; color: #64748b; margin-top: 10px;">{{empresa.nombre}}<br/>{{empresa.direccion}}</div>
            </div>
            <div style="text-align: right;">
               <h1 style="font-size: 3rem; font-weight: 100; color: #1e293b; margin: 0;">INVOICE</h1>
               <div style="font-weight: 900; color: #3b82f6;">INV-2024-001</div>
            </div>
          </header>
          <div style="border-top: 4px solid #1e293b; padding-top: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 2px solid #1e293b;">
                  <th style="padding: 15px 0; text-align: left;">CONCEPTO</th>
                  <th style="padding: 15px 0; text-align: right;">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 20px 0; font-weight: 700;">Servicio de Consultoría Enterprise</td>
                  <td style="padding: 20px 0; text-align: right; font-weight: 900;">$15,000.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `,
      templateData: { css: "" }
    }
  };

  const CONTRACT_MOCKS: Record<string, any> = {
    default: {
      titulo: "Contrato General (MSA)",
      clausulas: `
        <div style="padding: 3rem; background: #fff; min-height: 297mm; font-family: 'Garamond', serif; color: #1a1a1a;">
          <h1 style="text-align: center; font-size: 1.5rem; font-weight: 900; letter-spacing: 1px; border-bottom: 2px solid #000; padding-bottom: 1.5rem; margin-bottom: 3rem;">CONTRATO MARCO DE PRESTACIÓN DE SERVICIOS (MSA)</h1>
          
          <p style="text-align: justify; line-height: 1.8; margin-bottom: 2rem;">
            En la ciudad de Madrid, a {{fecha.hoy}}, se celebra el presente contrato entre <strong>{{empresa.nombre}}</strong>, en adelante "EL PROVEEDOR", y <strong>{{lead.nombre}}</strong>, en adelante "EL CLIENTE". Ambas partes se reconocen mutuamente capacidad legal suficiente para obligarse en este documento.
          </p>

          <h3 style="font-size: 1.1rem; font-weight: 900; margin-top: 2.5rem; text-transform: uppercase; border-bottom: 1px solid #eee;">PRIMERA: OBJETO DEL CONTRATO</h3>
          <p style="text-align: justify; line-height: 1.8;">
            El presente contrato tiene por objeto regular las condiciones bajo las cuales EL PROVEEDOR prestará a EL CLIENTE los servicios especializados de consultoría técnica y operativa detallados en el Anexo I, utilizando la plataforma tecnológica VolkernSign para la gestión de activos.
          </p>

          <h3 style="font-size: 1.1rem; font-weight: 900; margin-top: 2.5rem; text-transform: uppercase; border-bottom: 1px solid #eee;">SEGUNDA: REMUNERACIÓN Y FORMA DE PAGO</h3>
          <p style="text-align: justify; line-height: 1.8;">
            EL CLIENTE abonará a EL PROVEEDOR la cantidad estipulada en la hoja de pedido correspondiente. Los pagos se realizarán mediante transferencia bancaria o cargo directo en cuenta según se acuerde específicamente en cada orden de trabajo emitida bajo este contrato marco.
          </p>

          <h3 style="font-size: 1.1rem; font-weight: 900; margin-top: 2.5rem; text-transform: uppercase; border-bottom: 1px solid #eee;">TERCERA: CONFIDENCIALIDAD Y PROTECCIÓN DE DATOS</h3>
          <p style="text-align: justify; line-height: 1.8;">
            Ambas partes se obligan a mantener la más absoluta confidencialidad respecto a la información propiedad de la otra parte a la que tengan acceso con motivo de la ejecución de este contrato. EL PROVEEDOR garantiza el cumplimiento normativo en materia de protección de datos (RGPD).
          </p>

          <div style="margin-top: 8rem; display: flex; justify-content: space-between;">
            <div style="width: 45%; text-align: center;">
              <div style="border-bottom: 1px solid #000; height: 100px; margin-bottom: 1rem;"></div>
              <div style="font-weight: 900;">EL PROVEEDOR</div>
              <div style="font-size: 0.75rem;">{{empresa.nombre}}</div>
            </div>
            <div style="width: 45%; text-align: center;">
              <div style="border-bottom: 1px solid #000; height: 100px; margin-bottom: 1rem;"></div>
              <div style="font-weight: 900;">EL CLIENTE</div>
              <div style="font-size: 0.75rem;">{{lead.nombre}}</div>
            </div>
          </div>
        </div>
      `,
      templateData: { css: "" }
    },
    nda: {
      titulo: "NDA de Alta Seguridad",
      clausulas: `
        <div style="padding: 3rem; background: #fff; min-height: 297mm; font-family: 'Inter', sans-serif;">
          <h1 style="text-align: center; color: #dc2626; font-size: 1.75rem; font-weight: 900; margin-bottom: 4rem;">ACUERDO DE CONFIDENCIALIDAD RESTRICTIVO (NDA)</h1>
          
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 2rem; border-radius: 1rem; margin-bottom: 3rem;">
            <p style="font-size: 0.875rem; color: #991b1b; line-height: 1.6;"><strong>IMPORTANTE:</strong> Este documento contiene obligaciones legales severas. Al firmar, {{lead.nombre}} se compromete a proteger los secretos industriales de {{empresa.nombre}} bajo pena de indemnización sustancial.</p>
          </div>

          <h3 style="color: #1e293b; border-left: 5px solid #dc2626; padding-left: 1rem; margin-bottom: 1rem;">1. DEFINICIÓN DE INFORMACIÓN PROPIETARIA</h3>
          <p style="text-align: justify; font-size: 0.95rem; line-height: 1.8; color: #334155;">
            Se define como "Información Confidencial" todos los algoritmos, bases de datos, flujos de trabajo, secretos comerciales y propiedad intelectual compartida por {{empresa.nombre}} durante el periodo de vigencia. Cualquier infracción será procesada bajo las leyes de propiedad industrial vigentes.
          </p>

          <h3 style="color: #1e293b; border-left: 5px solid #dc2626; padding-left: 1rem; margin-top: 3rem; margin-bottom: 1rem;">2. CLÁUSULA DE SECRETO PROFESIONAL</h3>
          <p style="text-align: justify; font-size: 0.95rem; line-height: 1.8; color: #334155;">
            La Parte Receptora deberá emplear el mismo grado de cuidado para proteger la Información Confidencial que emplearía para proteger su propia información de similar naturaleza, pero nunca menos que un grado de cuidado razonable. El acceso a dicha información se limitará exclusivamente al personal con "necesidad de conocer".
          </p>

          <h3 style="color: #1e293b; border-left: 5px solid #dc2626; padding-left: 1rem; margin-top: 3rem; margin-bottom: 1rem;">3. PENALIDADES POR DIVULGACIÓN</h3>
          <p style="text-align: justify; font-size: 0.95rem; line-height: 1.8; color: #334155;">
            En caso de divulgación no autorizada, la Parte Receptora acepta pagar a la Parte Divulgadora una compensación económica pre-estimada de diez veces el valor del contrato proyectado, sin perjuicio de otras indemnizaciones por lucro cesante.
          </p>
        </div>
      `,
      templateData: { css: "" }
    },
    saas: {
      titulo: "Términos de Servicio SaaS",
      clausulas: `
        <div style="padding: 3rem; background: #fff; min-height: 297mm; font-family: 'Segoe UI', sans-serif;">
          <header style="border-bottom: 4px solid #3b82f6; padding-bottom: 2rem; margin-bottom: 3rem;">
            <h1 style="color: #1e3a8a; font-size: 1.5rem; font-weight: 800;">VOLKERN SaaS SERVICE AGREEMENT</h1>
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 10px;">{{empresa.nombre}} Platform Terms</div>
          </header>

          <section style="margin-bottom: 3rem;">
            <h3 style="color: #3b82f6; text-transform: uppercase; font-size: 0.875rem; font-weight: 900; margin-bottom: 1rem;">1. Suministro del Servicio</h3>
            <p style="font-size: 0.95rem; line-height: 1.8; color: #334155;">{{empresa.nombre}} suministrará los servicios de plataforma en la nube a {{lead.nombre}} de acuerdo con el plan de suscripción seleccionado. La disponibilidad garantizada es del 99.9% anual.</p>
          </section>

          <section style="margin-bottom: 3rem;">
            <h3 style="color: #3b82f6; text-transform: uppercase; font-size: 0.875rem; font-weight: 900; margin-bottom: 1rem;">2. Protección y Soberanía de Datos</h3>
            <p style="font-size: 0.95rem; line-height: 1.8; color: #334155;">El cliente mantiene la plena soberanía sobre los datos cargados en VolkernSign. El sistema implementa encriptación AES-256 en reposo y TLS 1.3 en tránsito para asegurar la integridad de la información corporativa.</p>
          </section>

          <div style="margin-top: 10rem; padding: 2rem; border: 2px solid #3b82f6; border-radius: 1rem; background: #eff6ff;">
            <p style="font-size: 0.75rem; font-weight: 700; color: #1e40af; text-align: center; text-transform: uppercase;">Aceptación electrónica vinculante tras la confirmación de suscripción.</p>
          </div>
        </div>
      `,
      templateData: { css: "" }
    }
  };

  const [holdedConfig, setHoldedConfig] = useState({
    apiKey: "",
    activo: false,
    conectado: false,
  });
  const [stripeInvoicing, setStripeInvoicing] = useState({
    activo: false,
    conectado: false,
  });
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);

  useEffect(() => {
    fetchConfig();
    fetchUser();
    fetchModules();
    fetchIntegrations();
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/cms/templates?type=document");
      if (res.ok) {
        const data = await res.json();
        setCustomTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  };

  const fetchIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const [holdedRes, stripeRes] = await Promise.all([
        fetch("/api/integrations/holded"),
        fetch("/api/integrations/stripe-invoicing"),
      ]);

      if (holdedRes.ok) {
        const data = await holdedRes.json();
        setHoldedConfig({
          apiKey: data.credenciales?.apiKey || "",
          activo: data.activo || false,
          conectado: data.conectado || false,
        });
      }

      if (stripeRes.ok) {
        const data = await stripeRes.json();
        setStripeInvoicing({
          activo: data.activo || false,
          conectado: data.conectado || false,
        });
      }
    } catch (error) {
      console.error("Error fetching integrations:", error);
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const fetchModules = async () => {
    try {
      const res = await fetch("/api/tenant/modules");
      if (res.ok) {
        const data = await res.json();
        setActiveModules(data.modules || []);
      }
    } catch (error) {
      console.error("Error fetching modules:", error);
    } finally {
      setLoadingModules(false);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
      }
    } catch (error) {
      console.error("Error al cargar datos de usuario:", error);
    } finally {
      setLoadingUser(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/configuracion");
      if (res.ok) {
        const data = await res.json();
        // Extraer y guardar el tenantId
        if (data._tenantId) {
          setTenantId(data._tenantId);
          delete data._tenantId; // No queremos mostrarlo en los campos de configuración
        }
        setConfig(data);
      }
    } catch (error) {
      console.error("Error al cargar configuración:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (key: string, value: string) => {
    setConfig({ ...config, [key]: value });
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      // Validar tipo de archivo
      if (!file.type.startsWith("image/")) {
        toast.error("El archivo debe ser una imagen");
        return;
      }

      // Validar tamaño (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast.error("El archivo es demasiado grande (máximo 5MB)");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("tipo", "logo_corporativo");

      const res = await fetch("/api/configuracion/logo", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const urlToUse = data.downloadUrl || data.url;
        updateConfig("logo_corporativo", urlToUse);
        toast.success("Logo corporativo subido exitosamente");
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al subir logo");
      }
    } catch (error) {
      console.error("Error al subir logo:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al subir logo",
      );
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLogoUpload(file);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true);
    try {
      if (!file.type.startsWith("image/")) {
        toast.error("El archivo debe ser una imagen");
        return;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast.error("El archivo es demasiado grande (máximo 5MB)");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/users/avatar", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const urlToUse = data.downloadUrl || data.url;
        setUserData({ ...userData, image: urlToUse });
        toast.success("Foto de perfil subida exitosamente");
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al subir avatar");
      }
    } catch (error) {
      console.error("Error al subir avatar:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al subir avatar",
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAvatarUpload(file);
    }
  };

  const guardarConfigGeneral = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: config.business_name || "Volkern CRM",
          business_email: config.business_email || "admin@volkern.com",
          timezone: config.timezone || "America/Mexico_City",
          logo_corporativo: config.logo_corporativo,
          // Nuevos campos de plantillas
          plantilla_orden_venta: config.plantilla_orden_venta || "default",
          plantilla_contrato: config.plantilla_contrato || "default",
          plantilla_email: config.plantilla_email || "modern",
          plantilla_firma: config.plantilla_firma || "simple",
        }),
      });

      if (res.ok) {
        toast.success("Configuración general guardada");
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const guardarConfigEmail = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_email: config.admin_email || "admin@volkern.com",
          from_name: config.from_name || "Volkern CRM",
        }),
      });

      if (res.ok) {
        toast.success("Configuración de email guardada");
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const guardarHorarios = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horariosAtencion: config.horariosAtencion,
        }),
      });

      if (res.ok) {
        toast.success("Horarios guardados");
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar horarios");
    } finally {
      setSaving(false);
    }
  };

  const handleHorariosChange = (horarios: HorariosConfig) => {
    setConfig({ ...config, horariosAtencion: horarios });
  };

  const guardarStripe = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripe_publishable_key: config.stripe_publishable_key,
          stripe_secret_key: config.stripe_secret_key,
          stripe_webhook_secret: config.stripe_webhook_secret,
        }),
      });

      if (res.ok) {
        toast.success("Configuración de Stripe guardada");
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar configuración de Stripe");
    } finally {
      setSaving(false);
    }
  };

  const cambiarPassword = async () => {
    // Validaciones del frontend
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Por favor, completa todos los campos");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas nuevas no coinciden");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/users/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("✅ Contraseña actualizada exitosamente");
        // Limpiar los campos
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(data.error || "Error al cambiar la contraseña");
      }
    } catch (error) {
      console.error("Error al cambiar contraseña:", error);
      toast.error("Error al cambiar la contraseña");
    } finally {
      setChangingPassword(false);
    }
  };

  const guardarPerfilUsuario = async () => {
    setSavingUser(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userData.name,
          telefono: userData.telefono,
          bookingSlug: userData.bookingSlug,
          bookingTitle: userData.bookingTitle,
          bookingBio: userData.bookingBio,
          bookingEnabled: userData.bookingEnabled,
          image: userData.image,
          metadata: userData.metadata,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUserData(data.user);
        }
        toast.success("Perfil actualizado correctamente");
      } else {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }
    } catch (error: any) {
      toast.error(error.message || "Error al guardar perfil");
    } finally {
      setSavingUser(false);
    }
  };

  const {
    isSupported,
    subscription,
    permissionState,
    subscribe,
    unsubscribe,
    loading: loadingPush,
  } = usePushNotifications();

  const copyBookingUrl = () => {
    if (!userData?.bookingSlug) return;
    const url = `${window.location.origin}/booking/${userData.bookingSlug}`;
    navigator.clipboard.writeText(url);
    toast.success("URL copiada al portapapeles");
  };

  const guardarHolded = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/holded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: holdedConfig.apiKey,
          activo: holdedConfig.activo,
        }),
      });

      if (res.ok) {
        toast.success("Configuración de Holded guardada");
        fetchIntegrations();
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar configuración de Holded");
    } finally {
      setSaving(false);
    }
  };

  const guardarStripeInvoicing = async (activo: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/stripe-invoicing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo }),
      });

      if (res.ok) {
        setStripeInvoicing({ ...stripeInvoicing, activo });
        toast.success(
          `Facturación de Stripe ${activo ? "activada" : "desactivada"}`,
        );
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.error("Error al actualizar facturación de Stripe");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <Settings className="h-8 w-8 mr-3 text-primary" />
            Configuración
          </h1>
          <p className="text-muted-foreground">
            Administra la configuración general de tu CRM
          </p>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full max-w-5xl grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-1">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="perfil" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Perfil</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="horarios" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Horarios</span>
          </TabsTrigger>
          <TabsTrigger value="telefonia" className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4" />
            <span className="hidden sm:inline">Telefonía</span>
          </TabsTrigger>
          <TabsTrigger value="pagos" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Pagos</span>
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Fiscal</span>
          </TabsTrigger>
          <TabsTrigger value="facturacion" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Facturación</span>
          </TabsTrigger>
          {/* Pestaña Marca visible para Superadmin O con módulo white_label */}
          {(userData?.role?.nombre === "Superadmin" ||
            activeModules.includes("white_label")) && (
            <TabsTrigger value="whitelabel" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Marca</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="documentos" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documentos</span>
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Globe className="h-5 w-5 mr-2" />
                Configuración General
              </CardTitle>
              <CardDescription>
                Información básica de tu negocio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business-name">Nombre del Negocio</Label>
                <Input
                  id="business-name"
                  value={config.business_name || ""}
                  onChange={(e) =>
                    updateConfig("business_name", e.target.value)
                  }
                  placeholder="Mi Negocio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-email">Email de Contacto</Label>
                <Input
                  id="business-email"
                  type="email"
                  value={config.business_email || ""}
                  onChange={(e) =>
                    updateConfig("business_email", e.target.value)
                  }
                  placeholder="contacto@minegocio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Zona Horaria</Label>
                <Input
                  id="timezone"
                  value={config.timezone || ""}
                  onChange={(e) => updateConfig("timezone", e.target.value)}
                  placeholder="America/Mexico_City"
                />
              </div>

              <Button
                onClick={guardarConfigGeneral}
                disabled={saving}
                className="mt-4"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Guardando..." : "Guardar Configuración"}
              </Button>
            </CardContent>
          </Card>

          {/* Logo Corporativo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ImageIcon className="h-5 w-5 mr-2" />
                Logo Corporativo
              </CardTitle>
              <CardDescription>
                Logo que se utilizará en todas las comunicaciones, marketing,
                tarjetas digitales y materiales corporativos (independiente del
                logo de whitelabel)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-4">
                {config.logo_corporativo && (
                  <div className="relative w-full max-w-md h-32 mx-auto bg-gray-50 rounded-lg flex items-center justify-center">
                    <Image
                      src={config.logo_corporativo}
                      alt="Logo Corporativo"
                      fill
                      className="object-contain p-4"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  <Button
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingLogo
                      ? "Subiendo..."
                      : config.logo_corporativo
                        ? "Cambiar Logo"
                        : "Subir Logo"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceptados: JPG, PNG, SVG • Tamaño máximo: 5MB
                  </p>
                </div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800 font-medium">
                  ℹ️ Uso del logo
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Este logo se utilizará automáticamente en: emails de campañas,
                  tarjetas digitales, mensajes automatizados, páginas de
                  aterrizaje y materiales de marketing.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Códigos de Embed */}
          <Card>
            <CardHeader>
              <CardTitle>Códigos de Integración</CardTitle>
              <CardDescription>
                Copia estos códigos para integrar el CRM en tu sitio web
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!tenantId && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    ⚠️ Los códigos de integración estarán disponibles después de
                    iniciar sesión correctamente.
                  </p>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">
                  Formulario de Contacto
                </Label>
                <div className="mt-2 p-3 bg-gray-50 rounded-md font-mono text-sm overflow-x-auto">
                  {`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/contact?tenantId=${tenantId}" width="100%" height="600" frameborder="0"></iframe>`}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">
                  Sistema de Agendamiento
                </Label>
                <div className="mt-2 p-3 bg-gray-50 rounded-md font-mono text-sm overflow-x-auto">
                  {`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/booking?tenantId=${tenantId}" width="100%" height="800" frameborder="0"></iframe>`}
                </div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800 font-medium">
                  ℹ️ Instrucciones de uso
                </p>
                <ul className="text-xs text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>Copia el código completo del iframe que desees usar</li>
                  <li>
                    Pégalo en el HTML de tu sitio web donde quieras mostrar el
                    formulario
                  </li>
                  <li>
                    Los leads y citas se registrarán automáticamente en tu CRM
                  </li>
                  <li>
                    No es necesario que los visitantes tengan cuenta en Volkern
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Perfil & Seguridad Tab */}
        <TabsContent value="perfil" className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              {/* Notificaciones Push (NUEVO) */}
              <Card className="border-blue-500/20 shadow-lg shadow-blue-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Bell className="h-5 w-5 mr-2" />
                    Notificaciones en el Navegador
                  </CardTitle>
                  <CardDescription>
                    Recibe alertas en tiempo real de nuevos leads y citas
                    incluso con el navegador cerrado
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!isSupported ? (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-4">
                      <BellOff className="h-6 w-6 text-amber-500 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-amber-900">
                          Navegador no compatible
                        </p>
                        <p className="text-xs text-amber-700">
                          Tu navegador actual no soporta notificaciones Push.
                          Intenta con Chrome, Edge o Safari (iOS 16.4+).
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex gap-4">
                        {subscription ? (
                          <BellRing className="h-6 w-6 text-green-500 shrink-0" />
                        ) : (
                          <Bell className="h-6 w-6 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {subscription
                              ? "Notificaciones Activas"
                              : "Notificaciones Desactivadas"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {permissionState === "denied"
                              ? "Has bloqueado las notificaciones. Debes resetear los permisos en tu navegador."
                              : "Suscríbete para recibir alertas de actividad crítica."}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={!!subscription}
                        disabled={loadingPush || permissionState === "denied"}
                        onCheckedChange={(checked) => {
                          if (checked) subscribe();
                          else unsubscribe();
                        }}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    <div className="p-3 bg-white border rounded-xl flex items-center gap-3">
                      <div className="h-8 w-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">
                          Alertas de nuevos leads asignados
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-white border rounded-xl flex items-center gap-3">
                      <div className="h-8 w-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">
                          Recordatorios de citas agendadas
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Información Personal (EXISTENTE) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    Información Personal
                  </CardTitle>
                  <CardDescription>Tus datos básicos de perfil</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Foto de Perfil */}
                  <div className="flex flex-col items-center space-y-4 pb-4 border-b">
                    <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-primary/20 bg-muted flex items-center justify-center">
                      {userData?.image ? (
                        <Image
                          src={userData.image}
                          alt="Avatar"
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <User className="h-12 w-12 text-muted-foreground" />
                      )}
                      {uploadingAvatar && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-center space-y-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                      >
                        <Upload className="h-3 w-3 mr-2" />
                        {uploadingAvatar
                          ? "Subiendo..."
                          : userData?.image
                            ? "Cambiar Foto"
                            : "Subir Foto"}
                      </Button>
                      <p className="text-[10px] text-muted-foreground text-center">
                        Imagen usada para tarjetas digitales y comunicaciones
                        personales
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="user-name">Nombre</Label>
                    <Input
                      id="user-name"
                      value={userData?.name || ""}
                      onChange={(e) =>
                        setUserData({ ...userData, name: e.target.value })
                      }
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-email">Email</Label>
                    <Input
                      id="user-email"
                      value={userData?.email || ""}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-phone">Teléfono / WhatsApp</Label>
                    <Input
                      id="user-phone"
                      value={userData?.telefono || ""}
                      onChange={(e) =>
                        setUserData({ ...userData, telefono: e.target.value })
                      }
                      placeholder="+34 ..."
                    />
                  </div>
                  <div className="space-y-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                    <Label
                      htmlFor="sip-extension"
                      className="text-blue-700 font-bold flex items-center gap-2"
                    >
                      <Key className="h-3 w-3" />
                      Extensión SIP Zadarma
                    </Label>
                    <Input
                      id="sip-extension"
                      value={userData?.metadata?.sip_extension || ""}
                      onChange={(e) =>
                        setUserData({
                          ...userData,
                          metadata: {
                            ...(userData.metadata || {}),
                            sip_extension: e.target.value,
                          },
                        })
                      }
                      placeholder="Ej: 101"
                      className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                    />
                    <p className="text-[10px] text-blue-600">
                      Requerido para que el Click-to-Call haga sonar tu
                      extensión personal.
                    </p>
                  </div>
                  <Button onClick={guardarPerfilUsuario} disabled={savingUser}>
                    <Save className="h-4 w-4 mr-2" />
                    {savingUser ? "Guardando..." : "Guardar Datos Personales"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Lock className="h-5 w-5 mr-2" />
                    Cambiar Contraseña
                  </CardTitle>
                  <CardDescription>
                    Actualiza tu contraseña para mantener tu cuenta segura
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Contraseña Actual</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña actual"
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nueva Contraseña</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">
                      Confirmar Nueva Contraseña
                    </Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirma tu nueva contraseña"
                      autoComplete="new-password"
                    />
                  </div>
                  <Button
                    onClick={cambiarPassword}
                    disabled={
                      changingPassword ||
                      !currentPassword ||
                      !newPassword ||
                      !confirmPassword
                    }
                    className="w-full"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    {changingPassword
                      ? "Actualizando..."
                      : "Cambiar Contraseña"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {/* Agendamiento Personal (BOOKING) */}
              <Card className="border-purple-500/20 shadow-lg shadow-purple-500/5">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-purple-500/10 rounded-lg">
                        <Calendar className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <CardTitle>Página de Agendamiento</CardTitle>
                        <CardDescription>
                          Tu link personal para recibir citas
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={userData?.bookingEnabled || false}
                      onCheckedChange={(checked) =>
                        setUserData({ ...userData, bookingEnabled: checked })
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <AnimatePresence>
                    {!userData?.bookingEnabled && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                        <span>
                          ⚠️ Tu página de agendamiento está desactivada.
                        </span>
                      </div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-2">
                    <Label htmlFor="booking-slug">URL Personalizada</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="booking-slug"
                          value={userData?.bookingSlug || ""}
                          onChange={(e) =>
                            setUserData({
                              ...userData,
                              bookingSlug: e.target.value
                                .toLowerCase()
                                .replace(/\s+/g, "-"),
                            })
                          }
                          placeholder="juan-perez"
                          className="pl-9"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={copyBookingUrl}
                        title="Copiar URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {userData?.bookingSlug && (
                        <Link
                          href={`/booking/${userData.bookingSlug}`}
                          target="_blank"
                        >
                          <Button
                            variant="outline"
                            size="icon"
                            title="Ver página"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-1">
                      Tu link será:{" "}
                      {typeof window !== "undefined"
                        ? window.location.origin
                        : ""}
                      /booking/{userData?.bookingSlug || "tu-slug"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="booking-title">Título Profesional</Label>
                    <div className="relative">
                      <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
                      <Input
                        id="booking-title"
                        value={userData?.bookingTitle || ""}
                        onChange={(e) =>
                          setUserData({
                            ...userData,
                            bookingTitle: e.target.value,
                          })
                        }
                        placeholder="Director Comercial / Especialista en Energía"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="booking-bio">
                      Biografía Corta (Pública)
                    </Label>
                    <Textarea
                      id="booking-bio"
                      value={userData?.bookingBio || ""}
                      onChange={(e) =>
                        setUserData({ ...userData, bookingBio: e.target.value })
                      }
                      placeholder="Cuéntales a tus clientes quién eres y cómo puedes ayudarlos..."
                      className="min-h-[100px] resize-none"
                    />
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 shadow-md transition-all active:scale-[0.98]"
                    onClick={guardarPerfilUsuario}
                    disabled={savingUser}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {savingUser
                      ? "Guardando..."
                      : "Guardar Configuración de Booking"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Mail className="h-5 w-5 mr-2" />
                Configuración de Email
              </CardTitle>
              <CardDescription>
                Configuración de envío de emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email del Administrador</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={config.admin_email || ""}
                  onChange={(e) => updateConfig("admin_email", e.target.value)}
                  placeholder="admin@minegocio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from-name">Nombre del Remitente</Label>
                <Input
                  id="from-name"
                  value={config.from_name || ""}
                  onChange={(e) => updateConfig("from_name", e.target.value)}
                  placeholder="Mi Negocio"
                />
              </div>
              <Button onClick={guardarConfigEmail} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Horarios Tab */}
        <TabsContent value="horarios" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Horarios de Atención
              </CardTitle>
              <CardDescription>
                Configura los horarios de atención de tu negocio. Puedes agregar
                múltiples rangos de horario por día (ej: mañana y tarde).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <HorariosMultiplesEditor
                value={config.horariosAtencion}
                onChange={handleHorariosChange}
              />
              <Button
                onClick={guardarHorarios}
                disabled={saving}
                className="mt-4"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Guardando..." : "Guardar Horarios"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pagos Tab */}
        <TabsContent value="pagos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Configuración de Pagos
              </CardTitle>
              <CardDescription>
                Configuración de Stripe para procesar pagos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stripe-pk">Stripe Publishable Key</Label>
                <Input
                  id="stripe-pk"
                  placeholder="pk_test_..."
                  type="password"
                  value={config.stripe_publishable_key || ""}
                  onChange={(e) =>
                    updateConfig("stripe_publishable_key", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripe-sk">Stripe Secret Key</Label>
                <Input
                  id="stripe-sk"
                  placeholder="sk_test_..."
                  type="password"
                  value={config.stripe_secret_key || ""}
                  onChange={(e) =>
                    updateConfig("stripe_secret_key", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhook-secret">
                  Webhook Secret (Opcional)
                </Label>
                <Input
                  id="webhook-secret"
                  placeholder="whsec_..."
                  type="password"
                  value={config.stripe_webhook_secret || ""}
                  onChange={(e) =>
                    updateConfig("stripe_webhook_secret", e.target.value)
                  }
                />
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ Configuración pendiente
                </p>
                <p className="text-xs text-yellow-700">
                  Configura tus claves de Stripe para habilitar los pagos
                </p>
              </div>
              <Button onClick={guardarStripe} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Guardando..." : "Guardar Claves"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fiscal Tab */}
        <TabsContent value="fiscal" className="space-y-6">
          <FiscalConfigSection />
        </TabsContent>

        {/* Facturación e Integraciones Tab */}
        <TabsContent value="facturacion" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Holded Integration */}
            <Card
              className={
                holdedConfig.activo ? "border-primary/50 shadow-sm" : ""
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Building className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle>Holded</CardTitle>
                      <CardDescription>
                        ERP y Facturación (España)
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={holdedConfig.activo}
                    onCheckedChange={(checked) =>
                      setHoldedConfig({ ...holdedConfig, activo: checked })
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Conecta tu cuenta de Holded para generar facturas
                  automáticamente. Ideal para cumplir con la normativa española
                  (TicketBAI, etc).
                </p>
                <div className="space-y-2">
                  <Label htmlFor="holded-api-key">API Key de Holded</Label>
                  <div className="flex gap-2">
                    <Input
                      id="holded-api-key"
                      type="password"
                      placeholder="Tu API Key de Holded"
                      value={holdedConfig.apiKey}
                      onChange={(e) =>
                        setHoldedConfig({
                          ...holdedConfig,
                          apiKey: e.target.value,
                        })
                      }
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <ArrowRight className="h-2 w-2" />
                    Consíguela en Configuración {">"} Desarrolladores dentro de
                    Holded.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={guardarHolded}
                  disabled={saving || !holdedConfig.apiKey}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Configuración Holded
                </Button>
                {holdedConfig.conectado && (
                  <div className="p-2 bg-green-50 border border-green-100 rounded-md flex items-center gap-2 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Conexión establecida con Holded
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stripe Invoicing */}
            <Card
              className={
                stripeInvoicing.activo ? "border-primary/50 shadow-sm" : ""
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <CreditCard className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div>
                      <CardTitle>Stripe Invoicing</CardTitle>
                      <CardDescription>Facturación Global</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={stripeInvoicing.activo}
                    onCheckedChange={guardarStripeInvoicing}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Usa tu integración de Stripe para emitir facturas y cobrar a
                  tus clientes mediante enlaces de pago automáticos.
                </p>
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Ventajas de Stripe Invoicing:
                  </h4>
                  <ul className="text-[11px] text-indigo-700 space-y-1 list-disc list-inside">
                    <li>Cobro integrado por tarjeta, SEPA y más</li>
                    <li>Recordatorios de pago automáticos</li>
                    <li>Reconciliación bancaria automática</li>
                  </ul>
                </div>
                {!config.stripe_secret_key && (
                  <div className="p-2 bg-amber-50 border border-amber-100 rounded-md flex items-start gap-2 text-xs text-amber-700">
                    <AlertCircle className="h-3 w-3 mt-0.5" />
                    <div>
                      <strong>Stripe no configurado:</strong> Debes configurar
                      tus claves de Stripe en la pestaña "Pagos" antes de
                      activar la facturación.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                ¿Cómo funciona la facturación automática?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Una vez configurado un proveedor, puedes crear automatizaciones
                (Workflows) que disparen la acción <b>"Generar Factura"</b>{" "}
                cuando ocurra un evento relevante, como:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="p-3 border rounded-lg text-xs">
                  <div className="font-bold mb-1">Cita Pagada</div>
                  Se genera la factura al marcar una cita como pagada.
                </div>
                <div className="p-3 border rounded-lg text-xs">
                  <div className="font-bold mb-1">Lead Ganado</div>
                  Se genera la factura al cerrar una oportunidad de venta.
                </div>
                <div className="p-3 border rounded-lg text-xs">
                  <div className="font-bold mb-1">Nueva Inscripción</div>
                  Facturación inmediata al inscribirse un estudiante en un
                  curso.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="telefonia" className="space-y-6">
          <TelephonyConfigSection tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="documentos" className="space-y-6">
          <DocumentTemplatesList />

          <Card className="mt-8 border-t-4 border-t-indigo-500 overflow-hidden">
            <CardHeader className="bg-indigo-50/50 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2 text-indigo-900">
                    <Sparkles className="h-5 w-5 text-indigo-600" />
                    Configuración de Salida y Firma
                  </CardTitle>
                  <CardDescription>
                    Define el aspecto de tus documentos y el nivel de seguridad legal para las firmas.
                  </CardDescription>
                </div>
                {previewConfigTpl && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                    onClick={() => setPreviewConfigTpl(null)}
                  >
                    Cerrar Previa
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              {/* Sección de Plantillas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Orden de Venta */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <Label className="text-base font-bold text-gray-800">Diseño de Orden de Venta</Label>
                    <p className="text-xs text-muted-foreground">Formato utilizado para presupuestos y confirmaciones de pedidos.</p>
                  </div>
                  <select
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background shadow-sm focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                    value={(config.plantilla_orden_venta as string) || "default"}
                    onChange={(e) => updateConfig("plantilla_orden_venta", e.target.value)}
                  >
                    <optgroup label="Estilos del Sistema">
                      <option value="default">Estándar Profesional (Azul)</option>
                      <option value="modern">Moderno Glassmorphism (Gradientes)</option>
                      <option value="minimal">Minimalista (Blanco y Negro)</option>
                      <option value="corporate">Corporativo Formal (Gris)</option>
                    </optgroup>
                    {customTemplates && customTemplates.filter((t: any) => t.tipo === 'ORDEN_VENTA' || t.tipo === 'COTIZACION').length > 0 && (
                      <optgroup label="Tus Diseños Personalizados">
                        {customTemplates.filter((t: any) => t.tipo === 'ORDEN_VENTA' || t.tipo === 'COTIZACION').map((tpl: any) => (
                          <option key={tpl.id} value={tpl.id}>{tpl.titulo}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-[10px] text-indigo-600 font-bold hover:bg-indigo-50 rounded-lg h-7 mt-1"
                    onClick={() => {
                      const tplId = config.plantilla_orden_venta as string;
                      const customTpl = customTemplates?.find((t: any) => t.id === tplId);
                      if (customTpl) {
                        setPreviewConfigTpl(customTpl);
                      } else if (ORDER_MOCKS[tplId]) {
                        setPreviewConfigTpl(ORDER_MOCKS[tplId]);
                      } else if (tplId === 'default' || !tplId) {
                        setPreviewConfigTpl(ORDER_MOCKS.default);
                      } else if (tplId === 'corporate') {
                        setPreviewConfigTpl(ORDER_MOCKS.corporate);
                      } else {
                        toast.info("Este estilo del sistema no tiene preview generado todavía.");
                      }
                    }}
                  >
                    <Eye className="h-3 w-3 mr-1.5" />
                    PREVISUALIZAR DISEÑO SELECCIONADO
                  </Button>
                  <div className="p-3 bg-gray-50 rounded-xl border border-dashed flex items-center gap-3">
                    <div className="h-10 w-10 bg-white rounded border flex items-center justify-center text-xs font-bold text-gray-400">PDF</div>
                    <div className="text-[10px] text-gray-500 italic">
                      {(config.plantilla_orden_venta as string)?.includes('-') 
                        ? "Usando diseño creado en el editor visual."
                        : "Usando estilo de motor interno de Volkern."}
                    </div>
                  </div>
                </div>

                {/* Contrato */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <Label className="text-base font-bold text-gray-800">Diseño de Contrato</Label>
                    <p className="text-xs text-muted-foreground">Estructura visual para contratos legales y acuerdos de servicios.</p>
                  </div>
                  <select
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background shadow-sm focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                    value={(config.plantilla_contrato as string) || "default"}
                    onChange={(e) => updateConfig("plantilla_contrato", e.target.value)}
                  >
                    <optgroup label="Modelos del Sistema">
                      <option value="default">Contrato General Profesional</option>
                      <option value="nda">Acuerdo de Confidencialidad (NDA)</option>
                      <option value="saas">SaaS / Términos de Servicio</option>
                    </optgroup>
                    {customTemplates && customTemplates.filter((t: any) => t.tipo === 'CONTRATO').length > 0 && (
                      <optgroup label="Tus Diseños Personalizados">
                        {customTemplates.filter((t: any) => t.tipo === 'CONTRATO').map((tpl: any) => (
                          <option key={tpl.id} value={tpl.id}>{tpl.titulo}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-[10px] text-indigo-600 font-bold hover:bg-indigo-50 rounded-lg h-7 mt-1"
                    onClick={() => {
                      const tplId = config.plantilla_contrato as string;
                      const customTpl = customTemplates?.find((t: any) => t.id === tplId);
                      if (customTpl) {
                        setPreviewConfigTpl(customTpl);
                      } else if (CONTRACT_MOCKS[tplId]) {
                        setPreviewConfigTpl(CONTRACT_MOCKS[tplId]);
                      } else if (tplId === 'default' || !tplId) {
                        setPreviewConfigTpl(CONTRACT_MOCKS.default);
                      } else if (tplId === 'nda') {
                        setPreviewConfigTpl(CONTRACT_MOCKS.nda);
                      } else if (tplId === 'saas') {
                        setPreviewConfigTpl(CONTRACT_MOCKS.saas);
                      } else {
                        toast.info("Este modelo del sistema no tiene preview generado todavía.");
                      }
                    }}
                  >
                    <Eye className="h-3 w-3 mr-1.5" />
                    PREVISUALIZAR DISEÑO SELECCIONADO
                  </Button>
                  <div className="p-3 bg-gray-50 rounded-xl border border-dashed flex items-center gap-3">
                    <div className="h-10 w-10 bg-white rounded border flex items-center justify-center text-xs font-bold text-gray-400">PDF</div>
                    <div className="text-[10px] text-gray-500 italic">
                      {(config.plantilla_contrato as string)?.includes('-') 
                        ? "Usando diseño creado en el editor visual."
                        : "Usando modelo legal predefinido."}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6 border-t font-sans">
                {/* Email Style */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <Label className="text-base font-bold text-gray-800">Notificaciones por Email</Label>
                    <p className="text-xs text-muted-foreground">Estilo visual de los correos automáticos enviados a clientes.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['modern', 'classic', 'dark'].map((style) => (
                      <button
                        key={style}
                        onClick={() => updateConfig("plantilla_email", style)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                          config.plantilla_email === style 
                            ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-200' 
                            : 'bg-white hover:border-indigo-300'
                        }`}
                      >
                        <div className={`h-12 w-full rounded-md border shadow-sm ${
                          style === 'dark' ? 'bg-slate-900' : style === 'classic' ? 'bg-white' : 'bg-gradient-to-br from-indigo-500 to-purple-500'
                        }`} />
                        <span className="text-[10px] font-bold uppercase tracking-tighter">
                          {style === 'modern' ? 'Moderno' : style === 'classic' ? 'Clásico' : 'Oscuro'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Signature Provider */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <Label className="text-base font-bold text-gray-800">Proveedor de Firma Digital</Label>
                    <p className="text-xs text-muted-foreground">Nivel de seguridad y validez legal para la recolección de firmas.</p>
                  </div>
                  <div className="space-y-3">
                    <div 
                      onClick={() => updateConfig("plantilla_firma", "simple")}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                        (config.plantilla_firma || "simple") === "simple" ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100' : 'bg-white'
                      }`}
                    >
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold">Firma Electrónica Simple</p>
                        <p className="text-[10px] text-muted-foreground">Validación por Email/SMS. Ideal para acuerdos internos.</p>
                      </div>
                      {(config.plantilla_firma || "simple") === "simple" && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                    </div>
                    
                    <div 
                      onClick={() => updateConfig("plantilla_firma", "certified")}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                        config.plantilla_firma === "certified" ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100' : 'bg-white'
                      }`}
                    >
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold">Firma Certificada (VolkernSign)</p>
                          <span className="text-[8px] bg-purple-200 text-purple-700 px-1.5 rounded-full font-black uppercase">RECOMENDADO</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Integridad SHA-256 / eIDAS. Máxima validez legal.</p>
                      </div>
                      {config.plantilla_firma === "certified" && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                    </div>

                    <div 
                      onClick={() => updateConfig("plantilla_firma", "biometric")}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                        config.plantilla_firma === "biometric" ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100' : 'bg-white'
                      }`}
                    >
                      <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                        <Palette className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold">Firma Biométrica / Rúbrica</p>
                        <p className="text-[10px] text-muted-foreground">Captura de trazo en vivo. Ideal para venta presencial.</p>
                      </div>
                      {config.plantilla_firma === "biometric" && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t flex justify-end">
                <Button 
                  onClick={guardarConfigGeneral} 
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 h-11 px-8 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Guardando cambios..." : "Guardar Configuración de Documentos"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Whitelabel Tab - Solo visible para Superadmin */}
        {/* Whitelabel Tab */}
        {(userData?.role?.nombre === "Superadmin" ||
          activeModules.includes("white_label")) && (
          <TabsContent value="whitelabel" className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Palette className="h-6 w-6 text-primary" />
                  Personalización de Marca Blanca
                </h2>
                <p className="text-muted-foreground text-sm">
                  {userData?.role?.nombre === "Superadmin"
                    ? "Configura el branding global de la plataforma para todos los clientes"
                    : "Personaliza la identidad visual de tu plataforma para tus clientes finales"}
                </p>
              </div>
              {userData?.role?.nombre === "Superadmin" && (
                <div className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold border border-amber-200">
                  Modo Superadmin: Editando Global
                </div>
              )}
            </div>
            <WhitelabelConfig />
          </TabsContent>
        )}
      </Tabs>
      {previewConfigTpl && (
        <TemplatePreviewModal
            isOpen={!!previewConfigTpl}
            onClose={() => setPreviewConfigTpl(null)}
            templateName={previewConfigTpl.titulo}
            html={previewConfigTpl.clausulas || ""}
            css={previewConfigTpl.templateData?.css || ""}
        />
      )}
    </div>
  );
}
