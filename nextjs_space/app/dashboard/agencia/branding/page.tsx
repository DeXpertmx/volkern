'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Palette, Upload, Eye, Save, Sparkles, Building2, ShieldCheck } from 'lucide-react'


export default function AgencyBrandingPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<any>({
    logo_url: '',
    primary_color: '#3b82f6',
    show_powered_by: true,
    custom_footer_text: ''
  })

  useEffect(() => {
    fetch('/api/agency/settings/branding')
      .then(res => res.json())
      .then(data => {
        setConfig({
          logo_url: data.logoUrl || '',
          primary_color: data.primaryColor || '#3b82f6',
          show_powered_by: data.showPoweredBy ?? true,
          custom_footer_text: data.customFooterText || ''
        })
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/agency/settings/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      if (res.ok) {
        toast.success('Configuración de marca actualizada correctamente')
      } else {
        toast.error('Error al guardar la configuración')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('tipo', type)

    const loadingToast = toast.loading('Subiendo imagen...')
    try {
      const res = await fetch('/api/whitelabel', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) {
        setConfig({ ...config, [type === 'logo' ? 'logo_url' : 'icono_url']: data.url })
        toast.dismiss(loadingToast)
        toast.success('Imagen subida')
      }
    } catch (error) {
      toast.dismiss(loadingToast)
      toast.error('Error al subir imagen')
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Cargando configuración de branding...</div>

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic">Mi Marca Blanca</h1>
          <p className="text-muted-foreground">Configura cómo verán tus clientes su panel de control.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:scale-105 transition-transform shadow-lg shadow-primary/25">
          <Save className="mr-2 h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-primary/10 shadow-xl overflow-hidden bg-background/50 backdrop-blur-sm">
            <CardHeader className="bg-primary/5 border-b">
              <CardTitle className="flex items-center gap-2 uppercase text-xs font-black tracking-widest">
                <Palette className="h-4 w-4 text-primary" /> Identidad Visual
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Logo Upload */}
                <div className="space-y-4">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                    <Upload className="h-3 w-3" /> Logo de la Agencia (Cabecera)
                  </Label>
                  <div className="border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center bg-accent/20 hover:bg-accent/30 transition-all border-border/50 group cursor-pointer relative">
                    {config.logo_url ? (
                      <div className="relative w-full h-24 flex items-center justify-center">
                        <img 
                          src={config.logo_url.startsWith('http') || config.logo_url.startsWith('/') ? config.logo_url : `/api/proxy?url=${encodeURIComponent(config.logo_url)}`} 
                          alt="Logo Agencia" 
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="text-center">
                        <Building2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
                        <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-tighter">Click para subir</p>
                      </div>
                    )}
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => handleFileUpload(e, 'logo')}
                    />
                  </div>
                </div>

                {/* Color Picker */}
                <div className="space-y-4">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                    <Palette className="h-3 w-3" /> Color Maestro del Sistema
                  </Label>
                  <div className="flex gap-4 items-center p-6 bg-accent/20 rounded-2xl border border-border/50 h-[132px]">
                    <div className="relative h-14 w-14 rounded-xl overflow-hidden shadow-lg border-2 border-white">
                      <input 
                        type="color" 
                        value={config.primary_color} 
                        onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                        className="absolute -inset-2 cursor-pointer scale-150"
                      />
                    </div>
                    <div className="flex-1">
                      <Input 
                        value={config.primary_color}
                        onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                        className="font-mono text-sm uppercase tracking-widest bg-background/50 border-none text-center h-12"
                      />
                      <p className="text-[9px] text-muted-foreground mt-2 text-center uppercase font-bold italic">Hex Code</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-border/50 my-6" />

              {/* White Label Options */}
              <div className="space-y-4">
                <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3" /> Opciones de Marca Blanca
                </Label>
                
                <div className="grid gap-4">
                  <div className="flex items-center justify-between p-5 bg-accent/20 rounded-2xl border border-border/50 hover:bg-accent/30 transition-colors">
                    <div className="space-y-1">
                      <Label className="font-black italic uppercase text-sm">Eliminar "Powered by Volkern"</Label>
                      <p className="text-xs text-muted-foreground">Si lo desactivas, los paneles de tus clientes serán 100% marca blanca.</p>
                    </div>
                    <Switch 
                      checked={config.show_powered_by} 
                      onCheckedChange={(val) => setConfig({ ...config, show_powered_by: val })}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>

                  <div className="p-5 bg-accent/20 rounded-2xl border border-border/50 space-y-4">
                    <div className="space-y-1">
                      <Label className="font-black italic uppercase text-sm">Texto de Footer Personalizado</Label>
                      <p className="text-xs text-muted-foreground">Reemplaza el pie de página del sistema con tu propio mensaje.</p>
                    </div>
                    <Input 
                      placeholder="Ej. Una solución de [Tu Agencia Creativa]"
                      value={config.custom_footer_text}
                      onChange={(e) => setConfig({ ...config, custom_footer_text: e.target.value })}
                      className="bg-background/50 border-primary/5 focus-visible:ring-primary h-12"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Preview Card */}
        <div className="space-y-6">
          <Card className="sticky top-24 border-primary/20 shadow-2xl overflow-hidden group bg-slate-950">
            <CardHeader className="bg-slate-900/50 text-white/50 border-b border-white/5 py-3">
              <CardTitle className="text-[9px] font-black uppercase tracking-[0.3em] flex items-center gap-2">
                <Eye className="h-3 w-3 text-primary animate-pulse" /> Live System Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 bg-[#f8fafc] aspect-[4/5] relative overflow-hidden">
              {/* UI Mockup Container */}
              <div className="absolute inset-0 scale-95 origin-top mt-4 shadow-2xl border rounded-t-xl bg-white overflow-hidden transition-all duration-500 group-hover:scale-[0.98]">
                {/* Fake Sidebar */}
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-50 border-r flex flex-col items-center py-4 gap-4">
                  <div className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center bg-white border">
                     <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: config.primary_color }} />
                  </div>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="w-6 h-1 rounded-full bg-slate-200" />
                  ))}
                </div>
                {/* Fake Header */}
                <div className="absolute left-12 right-0 top-0 h-8 bg-white border-b flex items-center px-4 justify-between">
                  {config.logo_url ? (
                    <div className="h-4 w-16 relative">
                      <img 
                        src={config.logo_url.startsWith('http') || config.logo_url.startsWith('/') ? config.logo_url : `/api/proxy?url=${encodeURIComponent(config.logo_url)}`} 
                        className="h-full object-contain filter grayscale opacity-40" 
                        alt="Preview"
                      />
                    </div>
                  ) : (
                    <div className="h-2 w-16 rounded bg-slate-100" />
                  )}
                  <div className="w-4 h-4 rounded-full bg-slate-100" />
                </div>
                {/* Fake Body */}
                <div className="absolute left-16 right-4 top-12 bottom-4 space-y-3">
                   <div className="h-3 w-20 rounded bg-slate-200 mb-4" />
                   <div className="grid grid-cols-2 gap-2">
                      <div className="h-10 rounded border border-slate-100 bg-slate-50/50 flex flex-col p-1.5 gap-1">
                         <div className="h-1 w-6 rounded bg-slate-200" />
                         <div className="h-2 w-10 rounded" style={{ backgroundColor: `${config.primary_color}33` }} />
                      </div>
                      <div className="h-10 rounded border border-slate-100 bg-slate-50/50 flex flex-col p-1.5 gap-1">
                         <div className="h-1 w-6 rounded bg-slate-200" />
                         <div className="h-2 w-10 rounded" style={{ backgroundColor: `${config.primary_color}33` }} />
                      </div>
                   </div>
                   <div className="h-24 rounded-lg border border-slate-100 bg-white shadow-sm flex items-center justify-center">
                      <Sparkles className="h-6 w-6 opacity-10" style={{ color: config.primary_color }} />
                   </div>
                </div>
                {/* Branding Text */}
                <div className="absolute bottom-3 left-12 right-0 text-center space-y-1 px-4">
                   {config.show_powered_by && (
                     <p className="text-[6px] font-bold text-slate-400 uppercase tracking-widest">
                       Powered by <span style={{ color: config.primary_color }}>Volkern Premium</span>
                     </p>
                   )}
                   {config.custom_footer_text && (
                     <p className="text-[6px] italic text-slate-300 line-clamp-1">{config.custom_footer_text}</p>
                   )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
