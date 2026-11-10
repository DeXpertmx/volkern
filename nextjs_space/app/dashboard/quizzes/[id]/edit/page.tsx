'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QuizEditor } from '@/components/quiz-builder/QuizEditor'
import { Quiz } from '@/components/quiz-builder/types'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

import { useResolvedParams } from '@/lib/hooks/useResolvedParams'

export default function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = useResolvedParams(params)
  if (!resolvedParams) return null
  return <EditQuizPageInner params={resolvedParams} />
}

function EditQuizPageInner({ params }: { params: { id: string } }) {
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
      toast.error('Cargando el cuestionario...')
      router.push('/dashboard/quizzes')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (updatedQuiz: Quiz) => {
    try {
      const res = await fetch(`/api/quizzes/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedQuiz)
      })
      if (!res.ok) throw new Error('Error al guardar')
      toast.success('Cambios guardados con éxito')
    } catch (error) {
      toast.error('Error al guardar los cambios')
      throw error
    }
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50/30 dark:bg-slate-900/10">
        <div className="max-w-5xl mx-auto px-6 py-4 border-b bg-white dark:bg-slate-900 sticky top-0 z-50 backdrop-blur-md flex items-center gap-4">
           <Link href="/dashboard/quizzes" className="flex items-center text-sm font-medium text-slate-500 hover:text-primary transition-colors">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Volver a la lista
           </Link>
           <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
           <span className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[300px]">
              {quiz?.titulo || 'Editando Cuestionario'}
           </span>
        </div>

        <div className="py-12 px-6">
          {loading ? (
            <div className="max-w-5xl mx-auto space-y-6">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-[400px] w-full rounded-3xl" />
            </div>
          ) : quiz ? (
            <QuizEditor initialData={quiz} onSave={handleSave} />
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
