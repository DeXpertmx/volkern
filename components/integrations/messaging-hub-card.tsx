"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Activity, ShieldCheck, Key, Globe, Link2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function MessagingHubCard() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [config, setConfig] = useState({
        isActive: false,
        hubBaseUrl: "",
        hubApiToken: "",
        hubAccountId: "",
        defaultEndpointId: "",
        webhookSecret: "",
    });

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await fetch("/api/integrations/messaging-hub");
            if (res.ok) {
                const data = await res.json();
                if (data.id) {
                    setConfig({
                        ...data,
                        hubApiToken: "••••••••••••••••", // Token enmascarado
                    });
                }
            }
        } catch (error) {
            console.error("Error fetching hub config:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/integrations/messaging-hub", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });

            if (res.ok) {
                toast.success("Configuración del Motor Nexus guardada");
                fetchConfig();
            } else {
                toast.error("Error al guardar la configuración");
            }
        } catch (error) {
            toast.error("Error de conexión");
        } finally {
            setSaving(false);
        }
    };

    const copyWebhookUrl = () => {
        const url = `${window.location.origin}/api/webhooks/nexus-sync`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.info("URL de Webhook copiada");
    };

    if (loading) {
        return (
            <Card className="w-full h-48 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </Card>
        );
    }

    return (
        <Card className="w-full overflow-hidden border-2 transition-all hover:border-primary/50">
            <div className="absolute top-0 right-0 p-4">
                <Badge variant={config.isActive ? "default" : "secondary"} className="gap-1 animate-pulse">
                    <Activity className="w-3 h-3" />
                    {config.isActive ? "Motor Activo" : "Inactivo"}
                </Badge>
            </div>

            <CardHeader className="bg-muted/30">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Globe className="w-6 h-6" />
                    </div>
                    <div>
                        <CardTitle className="text-xl">Motor Nexus Unificado</CardTitle>
                        <CardDescription>
                            Configuración del núcleo de mensajería multicanal (White-Label)
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <div className="space-y-0.5">
                        <Label className="text-base">Habilitar Motor Nexus</Label>
                        <p className="text-sm text-muted-foreground">
                            Redirige todo el tráfico de mensajería a través del Hub dedicado.
                        </p>
                    </div>
                    <Switch
                        checked={config.isActive}
                        onCheckedChange={(val) => setConfig({ ...config, isActive: val })}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Link2 className="w-4 h-4" /> Instancia Dedicated URL
                        </Label>
                        <Input
                            placeholder="https://nexus.tudominio.com"
                            value={config.hubBaseUrl}
                            onChange={(e) => setConfig({ ...config, hubBaseUrl: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Key className="w-4 h-4" /> API Access Token
                        </Label>
                        <Input
                            type="password"
                            placeholder="Tu token de acceso al Hub"
                            value={config.hubApiToken}
                            onChange={(e) => setConfig({ ...config, hubApiToken: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                    <div className="space-y-2">
                        <Label>ID de Cuenta / Organización</Label>
                        <Input
                            placeholder="e.g. Org_123"
                            value={config.hubAccountId}
                            onChange={(e) => setConfig({ ...config, hubAccountId: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Endpoint/Inbox ID por defecto</Label>
                        <Input
                            placeholder="Identificador del canal principal"
                            value={config.defaultEndpointId}
                            onChange={(e) => setConfig({ ...config, defaultEndpointId: e.target.value })}
                        />
                    </div>
                </div>

                <div className="p-4 bg-muted rounded-lg border space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2 text-primary">
                            <ShieldCheck className="w-4 h-4" /> Seguridad de Sincronización
                        </Label>
                        <Badge variant="outline" className="font-mono text-[10px]">SHA-256 HMAC</Badge>
                    </div>

                    <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium">Webhook URL de Volkern:</p>
                        <div className="flex gap-2">
                            <code className="flex-1 bg-background px-2 py-1.5 rounded border text-[11px] truncate block opacity-70">
                                {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/nexus-sync` : '...'}
                            </code>
                            <Button size="icon" variant="secondary" className="h-8 w-8" onClick={copyWebhookUrl}>
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>

            <CardFooter className="bg-muted/10 border-t pt-6">
                <Button
                    className="w-full md:w-auto ml-auto gap-2 px-8"
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar Configuración
                </Button>
            </CardFooter>
        </Card>
    );
}
