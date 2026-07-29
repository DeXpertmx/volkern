'use client'

import { useState } from 'react'
import { 
  X, 
  Image as ImageIcon, 
  Send, 
  Calendar as CalendarIcon, 
  Facebook, 
  Instagram, 
  Linkedin,
  Youtube,
  Music,
  Monitor,
  Smartphone,
  Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

interface PostCreatorProps {
  onClose: () => void
  onPostCreated: () => void
  preselectedDate?: Date
}

export function PostCreator({ onClose, onPostCreated, preselectedDate }: PostCreatorProps) {
  const [content, setContent] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['facebook'])
  const [mediaUrl, setMediaUrl] = useState('')
  const [scheduledFor, setScheduledFor] = useState(
    preselectedDate
      ? new Date(preselectedDate.getTime() - preselectedDate.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : '',
  )
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const togglePlatform = (p: string) => {
    setPlatforms(prev => 
      prev.includes(p) ? prev.filter(item => item !== p) : [...prev, p]
    )
  }

  const handleSubmit = async (immediate: boolean) => {
    if (!content.trim()) {
      toast.error('El contenido no puede estar vacío')
      return
    }
    if (platforms.length === 0) {
      toast.error('Selecciona al menos una plataforma')
      return
    }

    try {
      setIsSubmitting(true)
      const response = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          platforms,
          mediaUrls: mediaUrl ? [mediaUrl] : [],
          scheduledFor: immediate ? null : scheduledFor,
          immediate
        })
      })

      const data = await response.json()
      if (data.success) {
        toast.success(immediate ? 'Publicado con éxito' : 'Publicación programada')
        onPostCreated()
      } else {
        toast.error(data.error || 'Error al crear publicación')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-200">
        
        {/* Editor (Izquierda) */}
        <div className="flex-1 p-8 flex flex-col gap-6 overflow-y-auto border-r border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black uppercase tracking-tighter">Nueva Publicación</h2>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Canales de Destino</Label>
            <div className="flex gap-4">
              {[
                { id: 'facebook', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50' },
                { id: 'instagram', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50' },
                { id: 'linkedin', icon: Linkedin, color: 'text-sky-700', bg: 'bg-sky-50' },
                { id: 'youtube', icon: Youtube, color: 'text-red-600', bg: 'bg-red-50' },
                { id: 'tiktok', icon: Music, color: 'text-slate-900', bg: 'bg-slate-50' },
              ].map((plat) => (
                <button
                  key={plat.id}
                  onClick={() => togglePlatform(plat.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                    platforms.includes(plat.id) 
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                    : 'border-slate-100 opacity-50 grayscale'
                  }`}
                >
                  <div className={`h-10 w-10 rounded-xl ${plat.bg} flex items-center justify-center`}>
                    <plat.icon className={`h-5 w-5 ${plat.color}`} />
                  </div>
                  <span className="text-[10px] font-black uppercase">{plat.id}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Contenido</Label>
            <Textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="¿Qué quieres compartir hoy?"
              className="min-h-[160px] rounded-2xl bg-slate-50 border-slate-100 focus:bg-white text-sm p-4 resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Multimedia (URL)</Label>
            <div className="flex gap-2">
               <div className="flex-1 relative">
                 <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                 <input 
                  type="text"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full pl-10 pr-4 h-11 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600/5 focus:bg-white"
                 />
               </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
             <div className="flex items-center gap-2 text-indigo-600">
                <CalendarIcon className="h-4 w-4" />
                <span className="text-[11px] font-black uppercase tracking-wider">Planificar para después</span>
             </div>
             <input 
              type="datetime-local" 
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs"
             />
          </div>

          <div className="mt-auto flex gap-2">
            <Button 
                variant="outline" 
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || !scheduledFor}
                className="flex-1 rounded-xl h-11 font-bold border-slate-200"
            >
                Programar
            </Button>
            <Button 
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
                className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 font-bold shadow-lg shadow-indigo-100 gap-2"
            >
                {isSubmitting ? 'Publicando...' : 'Publicar Ahora'}
                <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview (Derecha) */}
        <div className="flex-1 bg-slate-50/50 p-8 hidden md:flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Vista Previa</h3>
            <div className="flex bg-white p-1 rounded-lg border border-slate-200">
               <button 
                onClick={() => setPreviewMode('desktop')}
                className={`p-1.5 rounded-md ${previewMode === 'desktop' ? 'bg-slate-100' : ''}`}
               >
                 <Monitor className="h-3.5 w-3.5" />
               </button>
               <button 
                onClick={() => setPreviewMode('mobile')}
                className={`p-1.5 rounded-md ${previewMode === 'mobile' ? 'bg-slate-100' : ''}`}
               >
                 <Smartphone className="h-3.5 w-3.5" />
               </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center">
             <div className={`bg-white rounded-xl shadow-xl transition-all duration-500 overflow-hidden border border-slate-100 ${previewMode === 'mobile' ? 'w-[300px]' : 'w-full'}`}>
                {/* Facebook Header Post Preview Example */}
                <div className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black text-slate-800">Tu Página de Facebook</span>
                    <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">Publicado por Volkern <Info className="h-2 w-2" /></span>
                  </div>
                </div>
                
                {/* Content */}
                <div className="px-4 pb-4">
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[40px]">
                    {content || 'Escribe algo para ver cómo quedará...'}
                  </p>
                </div>

                {/* Media */}
                <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                   {mediaUrl ? (
                     <img src={mediaUrl} alt="Preview" className="h-full w-full object-cover" />
                   ) : (
                     <ImageIcon className="h-10 w-10 text-slate-200" />
                   )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-50 flex justify-between px-4">
                   <div className="h-3 w-16 bg-slate-50 rounded" />
                   <div className="h-3 w-16 bg-slate-50 rounded" />
                   <div className="h-3 w-16 bg-slate-50 rounded" />
                </div>
             </div>
          </div>

          <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 flex gap-3">
            <Info className="h-4 w-4 text-indigo-500 shrink-0" />
            <p className="text-[10px] text-indigo-700 leading-tight">
              Asegúrate de que tus imágenes sigan las proporciones recomendadas para cada red social (1080x1080 o 1080x1350).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
