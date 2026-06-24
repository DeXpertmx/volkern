'use client'

import { useState, useRef } from 'react'
import { 
  motion, 
  AnimatePresence, 
  useMotionValue, 
  useTransform 
} from 'framer-motion'
import { 
  X, 
  Check, 
  DollarSign, 
  Receipt, 
  MapPin, 
  Calendar, 
  User,
  Info,
  ExternalLink,
  ShieldCheck,
  Zap
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function ExpenseApprovalFeed() {
  const { data: claims, mutate } = useSWR('/api/erp/hr/expenses', fetcher)
  const [currentIndex, setCurrentIndex] = useState(0)

  // Mock data si no hay claims reales
  const displayClaims = (claims && claims.length > 0) ? claims : [
    { 
      id: 'e1', 
      employee: { fullName: 'Andrés Mendoza' }, 
      amount: 45.20, 
      currency: 'EUR', 
      category: 'Software Subscription',
      description: 'Licencia Premium para herramientas de QA (Abril)',
      visionLockData: { lat: 40.4168, lng: -3.7038, exif_verified: true },
      receiptUrl: '#'
    },
    { 
      id: 'e2', 
      employee: { fullName: 'Lucía Santos' }, 
      amount: 128.50, 
      currency: 'EUR', 
      category: 'Travel',
      description: 'Taxi Aeropuerto - Congreso Industrial',
      visionLockData: { lat: 40.4983, lng: -3.5676, exif_verified: true },
      receiptUrl: '#'
    },
    { 
      id: 'e3', 
      employee: { fullName: 'Marcos Rivas' }, 
      amount: 12.00, 
      currency: 'EUR', 
      category: 'Meals',
      description: 'Comida operativa - Entrega Proyecto X',
      visionLockData: { lat: 40.4531, lng: -3.6883, exif_verified: false },
      receiptUrl: '#'
    }
  ]

  const handleAction = async (claimId: string, action: 'APPROVED' | 'REJECTED') => {
    // Aquí llamaríamos a la API: /api/erp/hr/expenses [PUT/POST]
    console.log(`Action: ${action} on claim ${claimId}`)
    
    // Simular transición
    setCurrentIndex(prev => prev + 1)
  }

  if (currentIndex >= displayClaims.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
        <div className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-emerald-500" />
        </div>
        <h3 className="text-xl font-black uppercase text-slate-800">¡Todo al día!</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-xs font-medium uppercase tracking-tight">No quedan gastos pendientes de autorización.</p>
        <Button 
          variant="outline" 
          className="mt-8 rounded-2xl font-black uppercase text-[10px] px-8 h-12 border-2"
          onClick={() => setCurrentIndex(0)}
        >
          Recargar Feed
        </Button>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full max-w-md mx-auto perspective-1000 py-10">
      <AnimatePresence>
        {displayClaims.map((claim: any, idx: number) => {
          if (idx < currentIndex) return null
          if (idx > currentIndex + 1) return null // Solo renderizamos el actual y el siguiente para performance

          return (
            <ExpenseCard 
              key={claim.id} 
              claim={claim} 
              isFront={idx === currentIndex}
              onAction={(action) => handleAction(claim.id, action)}
            />
          )
        })}
      </AnimatePresence>
      
      {/* Botones de control inferiores */}
      <div className="absolute -bottom-4 left-0 right-0 flex justify-center gap-6 z-50">
         <button 
           onClick={() => handleAction(displayClaims[currentIndex].id, 'REJECTED')}
           className="h-16 w-16 rounded-full bg-white shadow-2xl flex items-center justify-center text-rose-500 hover:scale-110 active:scale-95 transition-all border border-slate-100"
         >
           <X className="w-8 h-8" />
         </button>
         <button 
           onClick={() => handleAction(displayClaims[currentIndex].id, 'APPROVED')}
           className="h-16 w-16 rounded-full bg-slate-900 shadow-2xl flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all"
         >
           <Check className="w-8 h-8" />
         </button>
      </div>
    </div>
  )
}

function ExpenseCard({ claim, isFront, onAction }: { claim: any, isFront: boolean, onAction: (action: 'APPROVED' | 'REJECTED') => void }) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-25, 25])
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0])
  const background = useTransform(x, [-100, 0, 100], ['#f43f5e', '#ffffff', '#10b981'])
  const textColor = useTransform(x, [-100, 0, 100], ['#ffffff', '#0f172a', '#ffffff'])

  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.x > 100) onAction('APPROVED')
    else if (info.offset.x < -100) onAction('REJECTED')
  }

  return (
    <motion.div
      style={{ x, rotate, opacity, zIndex: isFront ? 40 : 30 }}
      drag={isFront ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      animate={isFront ? { scale: 1, y: 0 } : { scale: 0.95, y: 20 }}
      exit={{ x: x.get() > 0 ? 1000 : -1000, opacity: 0, transition: { duration: 0.3 } }}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
    >
      <Card className="h-full w-full rounded-[2.5rem] bg-white border-2 border-slate-50 shadow-2xl shadow-slate-200/50 overflow-hidden flex flex-col">
        {/* Recibo / Header Visual */}
        <div className="h-56 bg-slate-100 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Receipt className="w-16 h-16 text-slate-300 group-hover:scale-110 transition-transform duration-500" />
          </div>
          <div className="absolute bottom-6 left-6 right-6 z-20">
             <div className="flex items-center gap-2 mb-1">
               <Zap className="h-3 w-3 text-emerald-400" />
               <span className="text-[10px] font-black uppercase text-white tracking-widest opacity-80">Gasto Verificado</span>
             </div>
             <h4 className="text-2xl font-black text-white tracking-tight">{claim.category}</h4>
          </div>
          <Badge className="absolute top-6 right-6 z-20 bg-white/20 backdrop-blur-md text-white border-none font-black text-[10px] px-3">
            {claim.currency}
          </Badge>
        </div>

        <CardContent className="flex-1 p-8 space-y-6">
          <div className="flex items-center justify-between">
             <div className="space-y-1">
               <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Colaborador</p>
               <div className="flex items-center gap-2">
                 <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="h-3 w-3 text-primary" />
                 </div>
                 <p className="text-sm font-bold text-slate-900">{claim.erp_employees?.fullName || claim.employee?.fullName || 'Colaborador'}</p>
               </div>
             </div>
             <div className="text-right">
               <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Monto</p>
               <p className="text-3xl font-black tracking-tighter text-slate-900">
                 {claim.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
               </p>
             </div>
          </div>

          <div className="space-y-1.5 p-4 rounded-3xl bg-slate-50 border border-slate-100 italic">
            <p className="text-[11px] text-slate-600 leading-relaxed">"{claim.description}"</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
               <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                 <MapPin className="h-4 w-4 text-indigo-500" />
               </div>
               <div>
                  <p className="text-[8px] font-black uppercase text-slate-400">Vision-Lock</p>
                  <p className="text-[9px] font-bold text-slate-800">{claim.visionLockData?.exif_verified ? 'Localización GPS OK' : 'No verificado'}</p>
               </div>
            </div>
            <div className="flex items-center gap-2">
               <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                 <ShieldCheck className="h-4 w-4 text-emerald-500" />
               </div>
               <div>
                  <p className="text-[8px] font-black uppercase text-slate-400">Soberanía</p>
                  <p className="text-[9px] font-bold text-slate-800">Cifrado Bóveda</p>
               </div>
            </div>
          </div>

          <Button variant="ghost" className="w-full rounded-2xl h-12 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors gap-2">
             <ExternalLink className="w-3 h-3" /> Ver comprobante original
          </Button>
        </CardContent>

        {/* Swipe Indicators */}
        <motion.div 
          style={{ opacity: useTransform(x, [50, 100], [0, 1]) }}
          className="absolute inset-0 bg-emerald-500/10 pointer-events-none flex items-center justify-center"
        >
          <div className="h-20 w-20 rounded-full bg-emerald-500 flex items-center justify-center text-white scale-150">
             <Check className="w-10 h-10 stroke-[3]" />
          </div>
        </motion.div>
        <motion.div 
          style={{ opacity: useTransform(x, [-50, -100], [0, 1]) }}
          className="absolute inset-0 bg-rose-500/10 pointer-events-none flex items-center justify-center"
        >
          <div className="h-20 w-20 rounded-full bg-rose-500 flex items-center justify-center text-white scale-150">
             <X className="w-10 h-10 stroke-[3]" />
          </div>
        </motion.div>
      </Card>
    </motion.div>
  )
}
