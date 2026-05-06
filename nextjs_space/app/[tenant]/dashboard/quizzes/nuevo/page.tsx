'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuizEditor } from '@/components/quiz-builder/QuizEditor'
import { Quiz } from '@/components/quiz-builder/types'
import { DashboardLayout } from '@/components/dashboard-layout'
import { toast } from 'sonner'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewQuizPage() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSave = async (newQuiz: Quiz) => {
    setLoading(true)
    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuiz)
      })
      
      if (!res.ok) throw new Error('Error al crear')
      
      const created = await res.json()
      toast.success('¡Cuestionario creado con éxito!')
      
      // Si el quiz tiene preguntas, enviarlas en un PATCH posterior (o el QuizEditor ya maneja el ID si lo tuviéramos)
      // Pero mejor redirigir al editor del nuevo ID para sincronizar preguntas si el usuario ya añadió algunas.
      if (newQuiz.preguntas.length > 0) {
          await fetch(`/api/quizzes/${created.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newQuiz)
          })
      }

      router.push(`/dashboard/quizzes/${created.id}/edit`)
    } catch (error) {
      console.error('Error creating quiz:', error)
      toast.error('Error al crear el cuestionario')
      throw error
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50/30 dark:bg-slate-900/10">
        <div className="max-w-5xl mx-auto px-6 py-4 border-b bg-white dark:bg-slate-900 sticky top-0 z-50 backdrop-blur-md flex items-center gap-4">
           <Link href="/dashboard/quizzes" className="flex items-center text-sm font-medium text-slate-500 hover:text-primary transition-colors">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Cancelar
           </Link>
           <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
           <span className="text-sm font-bold text-slate-900 dark:text-white">
              Nuevo Cuestionario
           </span>
        </div>

        <div className="py-12 px-6">
          <QuizEditor 
            onSave={handleSave} 
            isLoading={loading}
            initialData={{
              titulo: '',
              descripcion: '',
              tipoQuiz: 'quiz',
              puntuajeMinimo: 70,
              intentosPermitidos: -1,
              preguntas: []
            }}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
