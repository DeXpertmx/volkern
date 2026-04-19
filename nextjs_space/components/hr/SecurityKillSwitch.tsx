'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ShieldAlert, 
  Zap, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle,
  Lock,
  ChevronRight
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface RevocationItem {
  resource: string
  env: string
  priority: 'CRITICAL' | 'MEDIUM'
  action: string
  instruction: string
  completed: boolean
}

interface SecurityKillSwitchProps {
  employeeId?: string
  tenantId: string
  onCompleteAction?: (item: RevocationItem) => void
}

export function SecurityKillSwitch({ employeeId, tenantId, onCompleteAction }: SecurityKillSwitchProps) {
  const [items, setItems] = useState<RevocationItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [targetName, setTargetName] = useState('')

  // Simulación de carga del Kit de Offboarding (En prod esto vendría de una API o el Skill result)
  useEffect(() => {
    if (!employeeId) {
      setItems([])
      return
    }

    setIsLoading(true)
    // Simulación de delay de análisis de Gemma
    setTimeout(() => {
      setTargetName('Carlos Jiménez')
      setItems([
        { resource: 'DigitalOcean', env: 'Production', priority: 'CRITICAL', action: 'REVOKE_ROOT', instruction: 'Revocar acceso Root en el VPS principal.', completed: false },
        { resource: 'GitHub', env: 'Org: Volkern', priority: 'CRITICAL', action: 'REMOVE_ADMIN', instruction: 'Eliminar del equipo de administradores.', completed: false },
        { resource: 'Cloudflare', env: 'DNS', priority: 'MEDIUM', action: 'BLOCK_SESSIONS', instruction: 'Bloquear sesiones activas de IP.', completed: false }
      ])
      setIsLoading(false)
    }, 1500)
  }, [employeeId])

  if (!employeeId && items.length === 0) return null

  const criticalCount = items.filter(i => i.priority === 'CRITICAL' && !i.completed).length

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="h-full"
      >
        <Card className={`h-full border-2 overflow-hidden shadow-2xl transition-colors ${
          criticalCount > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-primary/20 bg-background/50'
        }`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-destructive via-amber-500 to-destructive animate-pulse" />
          
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${criticalCount > 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <CardTitle className="text-xl font-black uppercase tracking-tight">
                    Security Kill-Switch
                  </CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-destructive">
                    Protocolo de Offboarding Activo: {targetName}
                  </CardDescription>
                </div>
              </div>
              {criticalCount > 0 && (
                <div className="bg-destructive text-white px-3 py-1 rounded-full text-[10px] font-black animate-bounce">
                  {criticalCount} RIESGOS CRÍTICOS
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Analizando huella digital...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`group p-4 rounded-2xl border transition-all flex items-center justify-between ${
                      item.completed 
                        ? 'bg-muted/30 border-muted opacity-50' 
                        : item.priority === 'CRITICAL'
                          ? 'bg-white border-destructive/20 hover:border-destructive shadow-sm'
                          : 'bg-white border-primary/10 hover:border-primary'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        item.completed ? 'bg-emerald-100 text-emerald-600' : 
                        item.priority === 'CRITICAL' ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {item.completed ? <CheckCircle2 className="w-5 h-5" /> : 
                         item.priority === 'CRITICAL' ? <Lock className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black uppercase tracking-tight">{item.resource}</h4>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            item.priority === 'CRITICAL' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                          }`}>
                            {item.env}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{item.instruction}</p>
                      </div>
                    </div>

                    {!item.completed && (
                      <div className="flex items-center gap-2">
                         <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                           <ExternalLink className="w-4 h-4" />
                         </Button>
                         <Button 
                          onClick={() => {
                            const newItems = [...items]
                            newItems[idx].completed = true
                            setItems(newItems)
                            if (onCompleteAction) onCompleteAction(item)
                          }}
                          className={`h-8 rounded-xl text-[9px] font-black uppercase px-3 shadow-lg transition-all ${
                            item.priority === 'CRITICAL' ? 'bg-destructive hover:bg-destructive/90 shadow-destructive/20' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                          }`}
                        >
                           Confirmar Revocación
                        </Button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
            
            <div className="pt-4 border-t flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                 <AlertTriangle className="w-3 h-3 text-amber-500" />
                 Soberanía de mando comprometida hasta cierre completo
              </div>
              <Button variant="link" className="text-[10px] font-black uppercase p-0 h-auto">
                Ver Historial Forense <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}
