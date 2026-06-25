'use client'

import React, { useState, useEffect } from 'react'
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Play, 
  BarChart2,
  FileText,
  Clock,
  HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { DashboardLayout } from '@/components/dashboard-layout'

interface QuizData {
  id: string;
  titulo: string;
  descripcion?: string;
  tipoQuiz: string;
  tiempoLimiteMinutos?: number;
  _count: { preguntas: number; intentos: number };
}

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchQuizzes()
  }, [])

  const fetchQuizzes = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/quizzes')
      const data = await res.json()
      
      if (Array.isArray(data)) {
        setQuizzes(data)
      } else if (data && data.quizzes && Array.isArray(data.quizzes)) {
        setQuizzes(data.quizzes)
      } else if (data && data.data && Array.isArray(data.data)) {
        setQuizzes(data.data)
      } else {
        setQuizzes([])
        if (data && data.error) toast.error(data.error)
      }
    } catch (error) {
      console.error('Error fetching quizzes:', error)
      toast.error('Error al cargar cuestionarios')
      setQuizzes([])
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este cuestionario?')) return

    try {
      const res = await apiFetch(`/api/quizzes/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setQuizzes(quizzes.filter(q => q.id !== id))
        toast.success('Cuestionario eliminado')
      } else {
        const errorData = await res.json()
        toast.error(errorData.error || 'Error al eliminar')
      }
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  const filteredQuizzes = quizzes.filter(q => 
    q.titulo.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DashboardLayout>
      <div className="space-y-8 p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Cuestionarios</h1>
            <p className="text-muted-foreground underline-offset-4 decoration-primary/30">
              Gestiona exámenes para la academia, encuestas de marketing y pruebas de evaluación.
            </p>
          </div>
          <Link href="/dashboard/quizzes/nuevo">
            <Button className="rounded-full shadow-lg shadow-primary/20 transition-all hover:scale-105 px-6">
              <Plus className="mr-2 h-4 w-4" /> Nuevo Cuestionario
            </Button>
          </Link>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título..."
            className="pl-10 max-w-md rounded-full bg-white dark:bg-slate-900 border-slate-200"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : filteredQuizzes.length === 0 ? (
          <Card className="border-dashed py-20 text-center rounded-3xl bg-slate-50/50">
            <CardContent className="flex flex-col items-center">
              <div className="h-20 w-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                <FileText className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-xl font-bold mb-2">No se encontraron cuestionarios</h3>
              <p className="text-muted-foreground mb-8 max-w-sm">
                Empieza creando tu primer cuestionario dinámico para tu plataforma.
              </p>
              <Link href="/dashboard/quizzes/nuevo">
                <Button variant="outline" className="rounded-full px-8">
                  <Plus className="mr-2 h-4 w-4" /> Crear mi primer quiz
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredQuizzes.map((quiz) => (
              <Card key={quiz.id} className="group border-slate-200 dark:border-slate-800 hover:shadow-2xl transition-all duration-300 rounded-3xl overflow-hidden hover:-translate-y-1 bg-white dark:bg-slate-900">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <Badge variant="secondary" className="mb-2 bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {quiz.tipoQuiz === 'quiz' ? 'Academia' : 'Marketing'}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 group-hover:text-slate-900">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/dashboard/quizzes/${quiz.id}/edit`} className="flex items-center">
                            <Edit2 className="mr-2 h-4 w-4" /> Editar
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center text-red-500 cursor-pointer" onClick={() => handleDelete(quiz.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">{quiz.titulo}</CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[40px]">{quiz.descripcion || 'Sin descripción'}</CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                    <div className="flex items-center gap-1">
                      <HelpCircle className="h-3 w-3" />
                      {quiz._count.preguntas} Preguntas
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {quiz.tiempoLimiteMinutos || '∞'} min
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-4 border-t bg-slate-50/50 dark:bg-slate-800/30 flex justify-between gap-2 overflow-hidden">
                   <div className="flex items-center gap-1 text-slate-400">
                      <BarChart2 className="h-4 w-4" />
                      <span className="text-xs font-bold">{quiz._count.intentos} Intentos</span>
                   </div>
                   <Link href={`/dashboard/quizzes/${quiz.id}/preview`}>
                     <Button size="sm" variant="ghost" className="rounded-full shadow-sm bg-white dark:bg-slate-900 group-hover:bg-primary group-hover:text-white transition-all">
                       <Play className="mr-2 h-3.5 w-3.5" /> Probar
                     </Button>
                   </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
