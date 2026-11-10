'use client'

import { useEffect, useState } from 'react'
import { 
  ShieldCheck, 
  Award, 
  User, 
  Calendar, 
  Building2, 
  ArrowLeft,
  GraduationCap,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Activity,
  Zap
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { motion } from 'framer-motion'

import { useResolvedParams } from '@/lib/hooks/useResolvedParams'

export default function VerifyCertificatePageWrapper({ params }: { params: Promise<{ hash: string }> }) {
  const resolvedParams = useResolvedParams(params)
  if (!resolvedParams) return null
  return <VerifyCertificatePage params={resolvedParams} />
}

function VerifyCertificatePage({ params }: { params: { hash: string } }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`/api/academy/verify/${params.hash}`)
        if (!res.ok) throw new Error('Certificado no válido')
        const result = await res.json()
        setData(result)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    verify()
  }, [params.hash])

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
      <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center animate-spin-slow mb-6">
        <ShieldCheck className="w-10 h-10" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 animate-pulse">Validando integridad criptográfica...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-8">
      <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mb-6 border border-rose-500/20">
        <AlertCircle className="w-10 h-10" />
      </div>
      <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">Verificación Fallida</h1>
      <p className="text-slate-400 font-medium mb-8">El certificado no existe o ha sido alterado.</p>
      <Link href="/academy">
        <Button className="bg-white text-black hover:bg-slate-200 font-black uppercase text-[10px] h-12 px-8 rounded-2xl">
          Volver a la Academia
        </Button>
      </Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-12 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* TOP NAV */}
        <div className="flex items-center justify-between">
           <Link href="/academy" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center group-hover:bg-white/10 transition-colors">
                 <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-white transition-all" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-white">Volkern Academy</span>
           </Link>
           <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 font-black text-[9px] tracking-widest uppercase">
              Certificación Verificada
           </Badge>
        </div>

        {/* HERO SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
           <div className="lg:col-span-7 space-y-6">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2 mb-4">
                   <div className="h-1 w-8 bg-emerald-500 rounded-full" />
                   <span className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500">Credencial Oficial</span>
                </div>
                <h1 className="text-6xl md:text-7xl font-black tracking-tighter uppercase italic leading-[0.9]">
                   {data.curso.titulo}
                </h1>
                <p className="text-slate-400 text-lg font-medium leading-relaxed max-w-lg">
                   {data.curso.descripcion || "Certificación técnica oficial emitida por el ecosistema de operaciones Volkern."}
                </p>
              </motion.div>

              <div className="flex flex-wrap gap-4">
                 <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 text-black rounded-xl flex items-center justify-center">
                       <Award className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="text-[9px] font-black uppercase text-slate-500">Código Único</p>
                       <p className="text-sm font-black tracking-widest uppercase">{data.codigoUnico}</p>
                    </div>
                 </div>
                 <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center">
                       <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="text-[9px] font-black uppercase text-slate-500">Integridad</p>
                       <p className="text-sm font-black text-indigo-400">Firmado SHA-256</p>
                    </div>
                 </div>
              </div>
           </div>

           <div className="lg:col-span-5">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-emerald-500/20 blur-[80px] rounded-full group-hover:bg-emerald-500/30 transition-all duration-700" />
                <div className="relative aspect-square bg-slate-900 border border-white/10 rounded-[3rem] p-10 flex flex-col items-center justify-center text-center shadow-2xl overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-5">
                      <GraduationCap className="w-32 h-32" />
                   </div>
                   
                   <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/20">
                      <User className="w-10 h-10 text-black" />
                   </div>
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Acreditado a:</h3>
                   <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">{data.estudiante.nombre}</h2>
                   <div className="flex items-center gap-2 mb-8">
                      <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{data.estudiante.empresa}</span>
                   </div>

                   <div className="w-full h-px bg-white/10 mb-8" />

                   <div className="grid grid-cols-2 gap-8 w-full">
                      <div className="text-center">
                         <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Emisión</p>
                         <p className="text-sm font-black">{new Date(data.fechaEmision).toLocaleDateString()}</p>
                      </div>
                      <div className="text-center">
                         <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Vence</p>
                         <p className="text-sm font-black text-amber-500">{data.fechaExpiracion ? new Date(data.fechaExpiracion).toLocaleDateString() : 'N/A'}</p>
                      </div>
                   </div>
                </div>
              </motion.div>
           </div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 border-t border-white/5">
           <DetailCard 
             icon={<Clock className="w-5 h-5" />} 
             label="Carga Horaria" 
             value={`${data.curso.duracionEstimadaHoras} Horas Académicas`} 
           />
           <DetailCard 
             icon={<Activity className="w-5 h-5" />} 
             label="Nivel" 
             value={data.curso.nivel.toUpperCase()} 
           />
           <DetailCard 
             icon={<Zap className="w-5 h-5" />} 
             label="Validación en Planta" 
             value="Compatible con Skill-Guard" 
           />
        </div>

        {/* CTA */}
        <div className="bg-emerald-500 p-10 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl shadow-emerald-500/20">
           <div className="text-center md:text-left">
              <h2 className="text-3xl font-black text-black uppercase tracking-tighter leading-none mb-2">¿Necesitas personal certificado?</h2>
              <p className="text-emerald-950 font-bold opacity-70">Únete a Volkern Academy y profesionaliza tu línea de producción.</p>
           </div>
           <Link href="/academy">
             <Button className="bg-black text-white hover:bg-slate-900 font-black uppercase text-[10px] h-14 px-10 rounded-2xl group">
                Explorar Catálogo <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-all" />
             </Button>
           </Link>
        </div>
      </div>
    </div>
  )
}

function DetailCard({ icon, label, value }: any) {
  return (
    <div className="p-6 rounded-3xl bg-white/5 border border-white/10 group hover:bg-white/[0.07] transition-all">
       <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-slate-400 mb-4 group-hover:text-emerald-500 transition-colors">
          {icon}
       </div>
       <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</p>
       <p className="text-sm font-black text-slate-200">{value}</p>
    </div>
  )
}
