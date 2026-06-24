'use client'

import { useState } from 'react'
import { 
  Compass, 
  Map as MapIcon, 
  ChevronRight, 
  Clock, 
  BookOpen, 
  Award,
  Zap,
  ArrowRight,
  Target
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function AcademyPathsPage() {
  const { data: paths, isLoading } = useSWR('/api/academy/paths', fetcher)

  // Mock data if database is empty for demo purposes
  const displayPaths = (paths && paths.length > 0) ? paths : [
    {
      id: '1',
      titulo: 'Experto en Energía Solar',
      descripcion: 'Domina desde la fotovoltaica básica hasta el mantenimiento de grandes huertos solares.',
      imagen: 'https://images.unsplash.com/photo-1509391366360-fe5bb6578506?auto=format&fit=crop&q=80&w=800',
      cursos: [
        { id: 'c1', titulo: 'Fundamentos de Energía Solar' },
        { id: 'c2', titulo: 'Instalación de Paneles Nivel 1' },
        { id: 'c3', titulo: 'Mantenimiento Preventivo' }
      ],
      progress: 65
    },
    {
      id: '2',
      titulo: 'Especialista en Automatización',
      descripcion: 'Aprende a programar PLCs y optimizar líneas de producción autónomas.',
      imagen: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800',
      cursos: [
        { id: 'c4', titulo: 'Introducción a PLCs' },
        { id: 'c5', titulo: 'Robótica Industrial' }
      ],
      progress: 0
    }
  ]

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* HEADER HERO */}
      <div className="bg-slate-900 text-white pt-32 pb-20 px-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-20 opacity-10 rotate-12">
           <MapIcon className="w-96 h-96" />
        </div>
        <div className="max-w-6xl mx-auto relative z-10">
           <Badge className="bg-emerald-500 text-black border-none font-black text-[10px] uppercase tracking-widest px-4 py-1 mb-6">
              Academy Pathfinding
           </Badge>
           <h1 className="text-6xl font-black tracking-tighter uppercase italic leading-[0.9] mb-4">
              Rutas de Carrera <br /> <span className="text-emerald-500 not-italic">Operativa</span>
           </h1>
           <p className="text-slate-400 text-xl font-medium max-w-2xl leading-relaxed">
              No solo aprendas cursos aislados. Sigue una ruta diseñada por expertos para alcanzar la maestría técnica en tu rol industrial.
           </p>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-8 -mt-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {displayPaths.map((path: any, index: number) => (
            <motion.div
              key={path.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="rounded-[3rem] border-none shadow-2xl shadow-slate-200/50 bg-white overflow-hidden group hover:shadow-emerald-200/40 transition-all duration-500 h-full flex flex-col">
                <div className="h-64 relative overflow-hidden">
                   <img src={path.imagen} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={path.titulo} />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                   <div className="absolute bottom-6 left-8 flex items-center gap-2">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black">
                         <Target className="w-5 h-5" />
                      </div>
                      <span className="text-white font-black uppercase text-[10px] tracking-widest">{path.cursos.length} Etapas</span>
                   </div>
                </div>

                <CardContent className="p-8 flex-1 flex flex-col justify-between">
                   <div className="space-y-4">
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-[0.9] group-hover:text-emerald-600 transition-colors">
                         {path.titulo}
                      </h2>
                      <p className="text-slate-500 font-medium leading-relaxed italic">
                         "{path.descripcion}"
                      </p>

                      <div className="space-y-3 pt-4">
                         {path.cursos.map((curso: any, i: number) => (
                           <div key={curso.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 group/item hover:bg-emerald-50 hover:border-emerald-100 transition-all">
                              <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-400 group-hover/item:border-emerald-500 group-hover/item:text-emerald-500 transition-all">
                                 {i + 1}
                              </div>
                              <span className="text-xs font-bold text-slate-600 group-hover/item:text-emerald-900">{curso.titulo}</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   <div className="mt-8 space-y-6">
                      {path.progress > 0 && (
                        <div className="space-y-2">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-emerald-600">
                              <span>Progreso en Ruta</span>
                              <span>{path.progress}%</span>
                           </div>
                           <Progress value={path.progress} className="h-2 bg-slate-100" />
                        </div>
                      )}

                      <Button className={`w-full h-14 rounded-2xl font-black uppercase tracking-widest transition-all ${
                        path.progress > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-900 hover:bg-black text-white'
                      }`}>
                         {path.progress > 0 ? 'Continuar Aprendizaje' : 'Comenzar Ruta'} <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                   </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* BOTTOM CTA */}
        <div className="mt-20 p-12 rounded-[3rem] bg-indigo-600 text-white flex flex-col md:flex-row items-center justify-between gap-10 relative overflow-hidden shadow-2xl shadow-indigo-200">
           <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12">
              <Compass className="w-64 h-64" />
           </div>
           <div className="relative z-10 text-center md:text-left">
              <h2 className="text-4xl font-black uppercase tracking-tighter mb-2 italic">¿No encuentras tu camino?</h2>
              <p className="text-indigo-100 font-medium text-lg">Gemma puede diseñar una ruta personalizada basada en tus objetivos profesionales.</p>
           </div>
           <Button className="bg-white text-indigo-600 hover:bg-indigo-50 font-black uppercase h-14 px-10 rounded-2xl relative z-10 shrink-0">
              Sugerencia por IA <Zap className="w-4 h-4 ml-2" />
           </Button>
        </div>
      </main>
    </div>
  )
}
