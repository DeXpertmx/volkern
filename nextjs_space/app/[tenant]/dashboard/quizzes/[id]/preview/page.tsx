'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QuizPlayer } from '@/components/quiz-builder/QuizPlayer'
import { Quiz } from '@/components/quiz-builder/types'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ChevronLeft, Eye } from 'lucide-react'
import Link from 'next/link'

export default function PreviewQuizPage({ params }: { params: { id: string } }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchQuiz()
  }, [params.id])

  const fetchQuiz = async () => {
    try {
      const res = await fetch(`/api/quizzes/${params.id}`)
      if (!res.ok) throw new Error('No se pudo cargar el cuestionario')
      const data = await res.json()
      setQuiz(data)
    } catch (error) {
      console.error('Error fetching quiz:', error)
      toast.error('Error al cargar la previsualización')
      router.push('/dashboard/quizzes')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (respuestas: Record<string, any>) => {
    try {
      const res = await fetch(`/api/quizzes/${params.id}/intentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          respuestas,
          tiempoTomadoMinutos: 1 // TODO: Calcular tiempo real
        })
      })
      
      if (!res.ok) throw new Error('Error al enviar')
      const result = await res.json()
      return result
    } catch (error) {
      console.error('Error submitting quiz:', error)
      toast.error('Error al procesar el cuestionario')
      throw error
    }
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/20">
        <div className="max-w-5xl mx-auto px-6 py-4 border-b bg-white dark:bg-slate-900 sticky top-0 z-50 backdrop-blur-md flex items-center justify-between">
           <div className="flex items-center gap-4">
              <Link href="/dashboard/quizzes" className="flex items-center text-sm font-medium text-slate-500 hover:text-primary transition-colors">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Salir de vista previa
              </Link>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
              <div className="flex items-center gap-2">
                 <Eye className="h-4 w-4 text-primary" />
                 <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Modo Previsualización
                 </span>
              </div>
           </div>
           {quiz && (
             <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                {quiz.titulo}
             </Badge>
           )}
        </div>

        <div className="py-8">
          {loading ? (
            <div className="max-w-3xl mx-auto space-y-6 px-4">
              <Skeleton className="h-4 w-48 mb-8" />
              <Skeleton className="h-[500px] w-full rounded-3xl" />
            </div>
          ) : quiz ? (
            <QuizPlayer quiz={quiz} onSubmit={handleSubmit} />
          ) : (
            <div className="text-center py-20">
              <p>No se encontró el cuestionario.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

function Badge({ children, variant, className }: any) {
  return (
    <div className={cn(
      "px-2.5 py-0.5 rounded-full text-xs font-semibold border",
      variant === 'outline' ? "bg-transparent" : "bg-primary text-white",
      className
    )}>
      {children}
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
