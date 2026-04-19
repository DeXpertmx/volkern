'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Calendar, Send, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export function QuickActions() {
  return (
    <Card className="h-full border-primary/10 bg-background/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          Acciones Rápidas
        </CardTitle>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tareas comunes para gestionar tu CRM</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button variant="outline" className="justify-start gap-2 hover:bg-primary/5 hover:border-primary/20 transition-all font-semibold" asChild>
            <Link href="/dashboard/leads">
              <Users className="h-4 w-4 text-blue-500" />
              Gestionar Leads
            </Link>
          </Button>
          <Button variant="outline" className="justify-start gap-2 hover:bg-primary/5 hover:border-primary/20 transition-all font-semibold" asChild>
            <Link href="/dashboard/citas">
              <Calendar className="h-4 w-4 text-purple-500" />
              Ver Calendario
            </Link>
          </Button>
          <Button variant="outline" className="justify-start gap-2 hover:bg-primary/5 hover:border-primary/20 transition-all font-semibold" asChild>
            <Link href="/dashboard/campanas/nueva">
              <Send className="h-4 w-4 text-green-500" />
              Nueva Campaña
            </Link>
          </Button>
          <Button variant="outline" className="justify-start gap-2 hover:bg-primary/5 hover:border-primary/20 transition-all font-semibold" asChild>
            <Link href="/dashboard/servicios">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              Gestionar Servicios
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
