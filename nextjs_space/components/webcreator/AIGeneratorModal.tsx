'use client'

import React, { useState } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { 
  Sparkles, 
  Loader2, 
  Wand2, 
  Zap, 
  Target, 
  Palette,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

interface AIGeneratorModalProps {
  isOpen: boolean
  onClose: () => void
  onGenerate: (projectData: any) => void
}

export function AIGeneratorModal({ isOpen, onClose, onGenerate }: AIGeneratorModalProps) {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('moderno')
  const [isGenerating, setIsGenerating] = useState(false)
  const [step, setStep] = useState(0)

  const steps = [
    "Analizando requerimientos...",
    "Estructurando secciones Volkern...",
    "Generando contenido persuasivo...",
    "Aplicando estilos y layouts..."
  ]

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Por favor, describe qué tipo de página necesitas.")
      return
    }

    setIsGenerating(true)
    setStep(0)

    // Simular progreso visual
    const interval = setInterval(() => {
      setStep(s => (s < steps.length - 1 ? s + 1 : s))
    }, 3000)

    try {
      const response = await fetch('/api/public/ai-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style })
      })

      if (!response.ok) {
        throw new Error("No se pudo generar la página")
      }

      const data = await response.json()
      if (data.success && data.projectData) {
        clearInterval(interval)
        toast.success("¡Página generada con éxito!")
        onGenerate(data.projectData)
        onClose()
      } else {
        throw new Error(data.error || "Error desconocido")
      }
    } catch (error: any) {
      toast.error(error.message || "Error al conectar con la IA")
      console.error(error)
    } finally {
      setIsGenerating(false)
      clearInterval(interval)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isGenerating && !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] bg-white dark:bg-slate-950 border-none shadow-2xl rounded-[2rem] overflow-hidden p-0">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        
        <div className="p-8 space-y-6">
          <DialogHeader>
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 mx-auto">
              <Sparkles className="text-white w-7 h-7" />
            </div>
            <DialogTitle className="text-2xl font-black text-center bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Magia con IA
            </DialogTitle>
            <DialogDescription className="text-center font-medium text-slate-500">
              Describe tu página y Volkern la construirá usando bloques nativos premium.
            </DialogDescription>
          </DialogHeader>

          {!isGenerating ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-3">
                <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Concepto de la Página</Label>
                <Textarea 
                  placeholder="Ej: Una landing page para un desarrollo inmobiliario de lujo en Tulum, con sección de amenidades, mapa de ubicación y formulario de contacto..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[120px] rounded-2xl border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none p-4 text-sm leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Estilo Visual</Label>
                  <select 
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="w-full h-12 rounded-xl border-slate-200 bg-white dark:bg-slate-900 px-4 text-sm font-medium focus:ring-indigo-500/20"
                  >
                    <option value="moderno">Moderno y Limpio</option>
                    <option value="elegante">Elegante / Dark Mode</option>
                    <option value="corporativo">Corporativo / Seguro</option>
                    <option value="minimalista">Minimalista</option>
                  </select>
                </div>
                <div className="space-y-3">
                    <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Privacidad</Label>
                    <div className="h-12 flex items-center gap-2 px-4 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 text-xs font-medium">
                        <Zap className="h-4 w-4 text-amber-500" /> Datos 100% Privados
                    </div>
                </div>
              </div>

              <div className="bg-indigo-50 rounded-2xl p-4 flex gap-4 border border-indigo-100">
                <div className="h-10 w-10 shrink-0 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                    <Target className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                    <p className="text-xs font-black text-indigo-900 uppercase tracking-wider">Recordatorio de Calidad</p>
                    <p className="text-[11px] text-indigo-700 leading-relaxed font-medium">La IA utilizará exclusivamente tus **Módulos de Volkern**. Las integraciones externas quedarán marcadas como espacios para configurar manualmente.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center space-y-8 animate-in zoom-in-95 duration-500">
                <div className="relative">
                    <div className="h-24 w-24 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin" />
                    <Wand2 className="absolute inset-0 m-auto h-8 w-8 text-indigo-600 animate-pulse" />
                </div>
                
                <div className="space-y-3 text-center">
                    <h4 className="font-black text-lg text-slate-900">{steps[step]}</h4>
                    <div className="flex gap-1 justify-center">
                        {steps.map((_, i) => (
                            <div key={i} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${i === step ? 'bg-indigo-600 w-12' : i < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                        ))}
                    </div>
                </div>
            </div>
          )}
        </div>

        {!isGenerating && (
          <DialogFooter className="p-8 pt-0 flex gap-3 sm:justify-between items-center border-t border-slate-50 bg-slate-50/50 mt-2">
            <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold text-slate-500">Cancelar</Button>
            <Button 
                onClick={handleGenerate} 
                className="rounded-xl px-8 font-black bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all h-12"
            >
                <Sparkles className="h-4 w-4 mr-2" /> Construir con IA
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
