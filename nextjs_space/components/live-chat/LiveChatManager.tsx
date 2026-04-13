'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { 
  Settings, 
  Code, 
  BarChart3, 
  MessageCircle, 
  Copy, 
  Check, 
  Eye, 
  Palette,
  Layout,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

export function LiveChatManager() {
  const [config, setConfig] = useState({
    title: 'Volkern Chat',
    welcomeMessage: '¡Hola! 👋 ¿En qué podemos ayudarte hoy?',
    primaryColor: '#2563eb', // Blue-600
    agentName: 'Soporte Volkern',
    showAgentPhoto: true,
    enabled: true,
    position: 'right'
  });

  const [copying, setCopying] = useState(false);

  const snippetCode = `<!-- Volkern Live Chat Snippet -->
<script>
  window.VOLKERN_CONFIG = {
    token: "vk-live-${Math.random().toString(36).substring(7)}",
    primaryColor: "${config.primaryColor}",
    title: "${config.title}"
  };
</script>
<script src="https://cdn.volkern.com/widget/live-chat.js" async></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippetCode);
    setCopying(true);
    toast.success('Snippet copiado al portapapeles');
    setTimeout(() => setCopying(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
      {/* Left: Configuration */}
      <div className="xl:col-span-8 space-y-6">
        <Tabs defaultValue="config" className="w-full">
          <TabsList className="bg-slate-100 p-1 rounded-2xl mb-6">
            <TabsTrigger value="config" className="rounded-xl px-6 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Settings className="h-4 w-4 mr-2" /> Personalización
            </TabsTrigger>
            <TabsTrigger value="install" className="rounded-xl px-6 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Code className="h-4 w-4 mr-2" /> Instalación
            </TabsTrigger>
            <TabsTrigger value="metrics" className="rounded-xl px-6 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <BarChart3 className="h-4 w-4 mr-2" /> Métricas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-6">
            <Card className="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
                <CardHeader className="border-b bg-slate-50/50">
                    <CardTitle className="text-xl font-black flex items-center gap-2">
                        <Palette className="h-5 w-5 text-primary" /> Visual y Contenido
                    </CardTitle>
                    <CardDescription>Configura cómo verán el chat tus visitantes.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 grid md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Título del Chat</Label>
                            <Input 
                                value={config.title} 
                                onChange={(e) => setConfig({...config, title: e.target.value})}
                                className="h-12 rounded-xl focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Mensaje de Bienvenida</Label>
                            <Input 
                                value={config.welcomeMessage} 
                                onChange={(e) => setConfig({...config, welcomeMessage: e.target.value})}
                                className="h-12 rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Color Primario</Label>
                            <div className="flex gap-4 items-center">
                                <Input 
                                    type="color" 
                                    value={config.primaryColor} 
                                    onChange={(e) => setConfig({...config, primaryColor: e.target.value})}
                                    className="h-12 w-20 p-1 rounded-xl cursor-pointer"
                                />
                                <span className="font-mono text-sm text-slate-500">{config.primaryColor}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Nombre del Agente</Label>
                            <Input 
                                value={config.agentName} 
                                onChange={(e) => setConfig({...config, agentName: e.target.value})}
                                className="h-12 rounded-xl"
                            />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div>
                                <p className="font-bold text-sm">Mostrar foto de agente</p>
                                <p className="text-xs text-slate-500">Aumenta la confianza del lead</p>
                            </div>
                            <Switch checked={config.showAgentPhoto} onCheckedChange={(val) => setConfig({...config, showAgentPhoto: val})} />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div>
                                <p className="font-bold text-sm">Estado del Widget</p>
                                <p className="text-xs text-slate-500">¿El chat es visible en la web?</p>
                            </div>
                            <Switch checked={config.enabled} onCheckedChange={(val) => setConfig({...config, enabled: val})} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-none shadow-xl ring-1 ring-border/50">
                <CardHeader>
                    <CardTitle className="text-lg font-black flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" /> Horarios de Atención
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-0">
                    <div className="flex items-center justify-between p-4 rounded-2xl border border-dashed border-slate-200">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                                <Layout className="h-5 w-5 text-slate-500" />
                            </div>
                            <p className="text-sm font-medium text-slate-600 max-w-sm">Muestra el "Live Chat" durante horas laborales y cambia automáticamente al "Chatbot (IA)" el resto del tiempo.</p>
                        </div>
                        <Button variant="outline" className="rounded-full font-bold">Configurar Horarios</Button>
                    </div>
                </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="install" className="space-y-6">
            <Card className="border-none shadow-xl ring-1 ring-border/50">
                <CardHeader>
                    <CardTitle className="text-xl font-black">Instalación en tu sitio</CardTitle>
                    <CardDescription>Copia y pega este código justo antes de la etiqueta &lt;/body&gt; en tu HTML.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-0">
                    <div className="relative group">
                        <pre className="bg-slate-900 text-slate-100 p-6 rounded-2xl font-mono text-sm overflow-x-auto border-4 border-slate-800 shadow-2xl">
                            {snippetCode}
                        </pre>
                        <Button 
                            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-xl"
                            onClick={handleCopy}
                        >
                            {copying ? <Check className="h-4 w-4 mr-2 text-green-400" /> : <Copy className="h-4 w-4 mr-2" />}
                            {copying ? 'Copiado' : 'Copiar'}
                        </Button>
                    </div>
                    
                    <div className="mt-8 grid md:grid-cols-3 gap-6">
                        <div className="space-y-2 p-4 border rounded-2xl bg-slate-50/50 border-slate-100">
                            <h4 className="font-black text-xs uppercase tracking-widest text-slate-400">Paso 1</h4>
                            <p className="text-sm font-medium">Copia el snippet de arriba.</p>
                        </div>
                        <div className="space-y-2 p-4 border rounded-2xl bg-slate-50/50 border-slate-100">
                            <h4 className="font-black text-xs uppercase tracking-widest text-slate-400">Paso 2</h4>
                            <p className="text-sm font-medium">Pégalo en el footer de tu sitio.</p>
                        </div>
                        <div className="space-y-2 p-4 border rounded-2xl bg-slate-50/50 border-slate-100">
                            <h4 className="font-black text-xs uppercase tracking-widest text-slate-400">Paso 3</h4>
                            <p className="text-sm font-medium">Publica los cambios y ¡listo!</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metrics">
             <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="h-20 w-20 rounded-full bg-slate-100 flex items-center justify-center">
                    <BarChart3 className="h-10 w-10 text-slate-400" />
                </div>
                <div>
                    <h3 className="text-xl font-black">Próximamente Analytics</h3>
                    <p className="text-muted-foreground">Podrás ver tasa de conversión por chat, tiempos de respuesta y más.</p>
                </div>
             </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Right: Live Preview */}
      <div className="xl:col-span-4 sticky top-6">
        <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2">
                <Eye className="h-4 w-4" /> Previsualización
            </h3>
            
            <div className="relative aspect-[9/16] bg-slate-900 border-[8px] border-slate-800 rounded-[3rem] shadow-2xl overflow-hidden group">
                {/* Simulated Webpage */}
                <div className="h-full w-full bg-slate-50 p-6">
                    <div className="h-4 w-1/2 bg-slate-200 rounded-full mb-8" />
                    <div className="h-32 w-full bg-slate-200 rounded-2xl mb-4" />
                    <div className="space-y-2">
                        <div className="h-2 w-full bg-slate-200 rounded-full" />
                        <div className="h-2 w-full bg-slate-200 rounded-full" />
                        <div className="h-2 w-2/3 bg-slate-200 rounded-full" />
                    </div>
                </div>

                {/* The Widget */}
                <AnimatePresence>
                    {config.enabled && (
                        <motion.div 
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="absolute bottom-8 right-6 w-[280px] bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5"
                        >
                            <div className="p-4 flex items-center gap-3 text-white" style={{ backgroundColor: config.primaryColor }}>
                                <div className="h-10 w-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center overflow-hidden">
                                     {config.showAgentPhoto ? (
                                         <div className="font-bold text-sm">{config.agentName.charAt(0)}</div>
                                     ) : (
                                         <MessageCircle className="h-5 w-5" />
                                     )}
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm leading-none">{config.agentName}</h4>
                                    <p className="text-[10px] opacity-80 mt-1 uppercase tracking-widest font-bold">En línea ahora</p>
                                </div>
                            </div>
                            <div className="p-4 min-h-[140px] flex flex-col justify-end">
                                <div className="bg-slate-100 p-3 rounded-2xl rounded-bl-none text-xs text-slate-700 font-medium mb-4 self-start max-w-[80%] animate-in slide-in-from-left-2 duration-500">
                                    {config.welcomeMessage}
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1 h-10 bg-slate-100 rounded-xl px-3 flex items-center">
                                        <span className="text-[10px] text-slate-400">Escribe un mensaje...</span>
                                    </div>
                                    <div className="h-10 w-10 rounded-xl flex items-center justify-center transition-opacity" style={{ backgroundColor: config.primaryColor, opacity: 0.8 }}>
                                        <ChevronRight className="h-5 w-5 text-white" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                
                {/* Widget Bubble Icon (if mini) */}
                {!config.enabled && (
                    <div className="absolute bottom-8 right-6 h-14 w-14 rounded-full shadow-2xl flex items-center justify-center text-white" style={{ backgroundColor: config.primaryColor }}>
                        <MessageCircle className="h-7 w-7" />
                    </div>
                )}
            </div>

            <Card className="bg-blue-600 text-white border-none shadow-xl border-l-[6px] border-l-blue-400">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                         <div className="p-2 bg-white/10 rounded-lg">
                            <ExternalLink className="h-5 w-5" />
                         </div>
                         <h4 className="font-black uppercase tracking-widest text-[10px]">Tips de Conversión</h4>
                    </div>
                    <p className="text-xs font-bold leading-relaxed">¿Sabías que los visitantes que usan el chat tienen un 2.8x más de probabilidad de convertir en lead?</p>
                    <Button variant="outline" className="w-full bg-white/10 border-white/20 hover:bg-white text-white hover:text-blue-600 rounded-xl font-bold h-10 text-xs">
                        Ir a la Bandeja de Entrada
                    </Button>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}
