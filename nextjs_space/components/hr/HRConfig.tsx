'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Palette, CreditCard, Layout, Eye, Save, RefreshCcw } from 'lucide-react'

export function HRConfig() {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/erp/hr/config')
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
      }
    } catch (e) {
      toast.error('Error al cargar configuración')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = (section: string, field: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }))
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/erp/hr/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      if (res.ok) {
        toast.success('Configuración guardada correctamente')
      } else {
        toast.error('Error al guardar')
      }
    } catch (e) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-10 text-center animate-pulse font-bold">Cargando parámetros...</div>

  const badge = config?.badge || {}

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Editor de Parámetros */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="rounded-[2.5rem] border-none shadow-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Palette className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-tight">Identidad Visual de Credencial</CardTitle>
                <CardDescription className="text-xs font-bold uppercase text-slate-400">Personaliza la tarjeta de identificación oficial</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Color Primario (Header)</Label>
                <div className="flex gap-3">
                  <Input 
                    type="color" 
                    value={badge.primaryColor} 
                    onChange={(e) => handleUpdate('badge', 'primaryColor', e.target.value)}
                    className="h-12 w-12 p-1 rounded-xl cursor-pointer border-none"
                  />
                  <Input 
                    value={badge.primaryColor} 
                    onChange={(e) => handleUpdate('badge', 'primaryColor', e.target.value)}
                    className="h-12 rounded-xl font-mono text-center font-bold"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Color Secundario (Acentos)</Label>
                <div className="flex gap-3">
                  <Input 
                    type="color" 
                    value={badge.secondaryColor} 
                    onChange={(e) => handleUpdate('badge', 'secondaryColor', e.target.value)}
                    className="h-12 w-12 p-1 rounded-xl cursor-pointer border-none"
                  />
                  <Input 
                    value={badge.secondaryColor} 
                    onChange={(e) => handleUpdate('badge', 'secondaryColor', e.target.value)}
                    className="h-12 rounded-xl font-mono text-center font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-50">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Opciones de Visibilidad</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="space-y-0.5">
                    <p className="text-xs font-black uppercase text-slate-700">Mostrar Código QR</p>
                    <p className="text-[10px] text-slate-400 font-bold">Validación instantánea</p>
                  </div>
                  <Switch checked={badge.showQr} onCheckedChange={(v) => handleUpdate('badge', 'showQr', v)} />
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="space-y-0.5">
                    <p className="text-xs font-black uppercase text-slate-700">Mostrar Departamento</p>
                    <p className="text-[10px] text-slate-400 font-bold">Ubicación organizacional</p>
                  </div>
                  <Switch checked={badge.showDepartment} onCheckedChange={(v) => handleUpdate('badge', 'showDepartment', v)} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Formato y Layout</Label>
              <Select value={badge.layout} onValueChange={(v) => handleUpdate('badge', 'layout', v)}>
                <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                  <SelectValue placeholder="Seleccionar formato" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-100">
                  <SelectItem value="portrait" className="rounded-xl">Retrato (Vertical - 54x86mm)</SelectItem>
                  <SelectItem value="landscape" className="rounded-xl">Apaisado (Horizontal - 86x54mm)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-6 border-t border-slate-50">
               <Button 
                onClick={saveConfig} 
                disabled={saving}
                className="w-full h-14 rounded-3xl premium-gradient-primary shadow-xl shadow-primary/20 font-black uppercase text-xs tracking-widest"
              >
                {saving ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar Configuración de RRHH
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vista Previa Interactiva */}
      <div className="space-y-6">
        <div className="sticky top-6">
          <div className="flex items-center gap-2 mb-4 px-2">
            <Eye className="w-4 h-4 text-slate-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vista Previa (Borrador)</span>
          </div>

          <div className={`
            relative overflow-hidden shadow-2xl rounded-3xl mx-auto
            ${badge.layout === 'portrait' ? 'w-[280px] h-[440px]' : 'w-[440px] h-[280px]'}
            bg-white border-4 border-white ring-1 ring-slate-100
          `}>
            {/* Header del Badge */}
            <div 
              className="h-1/3 flex flex-col items-center justify-center p-6 text-white text-center"
              style={{ backgroundColor: badge.primaryColor }}
            >
              <div className="w-12 h-12 bg-white/20 rounded-xl mb-3 backdrop-blur-sm flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black uppercase tracking-widest">VOLKERN ERP</h4>
              <p className="text-[8px] font-bold opacity-60 uppercase">Identidad Corporativa</p>
            </div>

            {/* Contenido del Badge */}
            <div className="p-8 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-2xl bg-slate-100 border-4 border-white shadow-xl -mt-20 overflow-hidden flex items-center justify-center">
                <div className="text-4xl font-black text-slate-300">A</div>
              </div>
              
              <div className="mt-6 space-y-1">
                <h5 className="text-lg font-black uppercase tracking-tighter text-slate-900">Ana García</h5>
                <p className="text-[10px] font-bold text-primary/80 uppercase">Gerente de Administración</p>
              </div>

              {badge.showDepartment && (
                <div className="mt-4 px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">
                   <p className="text-[8px] font-black uppercase text-slate-400">Departamento</p>
                   <p className="text-[10px] font-black text-slate-600">ADMINISTRACIÓN</p>
                </div>
              )}

              {badge.showQr && (
                <div className="mt-auto pt-6 opacity-30">
                  <div className="w-16 h-16 border-2 border-slate-200 rounded-xl flex items-center justify-center">
                    <RefreshCcw className="w-8 h-8 text-slate-200" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Footer */}
            <div 
              className="absolute bottom-0 left-0 right-0 h-1"
              style={{ backgroundColor: badge.secondaryColor }}
            />
          </div>
          
          <p className="text-center mt-6 text-[10px] font-bold text-slate-400 uppercase max-w-[280px] mx-auto leading-relaxed">
            Esta es una representación visual. El PDF final utilizará medidas exactas (ID-1).
          </p>
        </div>
      </div>
    </div>
  )
}
