'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  Users, 
  Wallet, 
  Lock, 
  Unlock, 
  Umbrella,
  GripVertical,
  ShieldCheck,
  Rocket
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import { ResponsiveGridLayout, useContainerWidth, Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import debounce from 'lodash.debounce'
import { mutate } from 'swr'

// HR Widgets
import { VacationCalendar } from '@/components/hr/vacation-calendar'
import { ExpenseApprovalFeed } from '@/components/hr/expense-approval-feed'
import { VacationRequestModal } from '@/components/hr/vacation-request-modal'
import { IATeamAnalytics } from '@/components/hr/ia-team-analytics'
import { SecurityKillSwitch } from '@/components/hr/SecurityKillSwitch'
import { TrustProtocolLogs } from '@/components/sovereignty/trust-protocol-logs'
import { PayrollVault } from '@/components/hr/PayrollVault'

// Layout Inicial de RRHH (12 columnas)
const HR_DEFAULT_LAYOUTS: { lg: Layout[] } = {
  lg: [
    { i: 'tinder', x: 0, y: 0, w: 4, h: 6 },
    { i: 'ia-analytics', x: 4, y: 0, w: 8, h: 6 },
    { i: 'calendar', x: 0, y: 6, w: 8, h: 6, minW: 6, minH: 4 },
    { i: 'kill-switch', x: 8, y: 6, w: 4, h: 6 },
    { i: 'audit', x: 0, y: 12, w: 12, h: 4 },
  ]
}

export default function HRMDashboard() {
  const searchParams = useSearchParams()
  const activeOffboardingId = searchParams.get('offboarding')

  const [activeTab, setActiveTab] = useState<'overview' | 'nominas'>('overview')
  const [isVacationModalOpen, setIsVacationModalOpen] = useState(false)
  const [vacationInitialData, setVacationInitialData] = useState<any>(null)
  
  // Grid Context
  const [layouts, setLayouts] = useState(HR_DEFAULT_LAYOUTS)
  const [isLocked, setIsLocked] = useState(true)
  const [mounted, setMounted] = useState(false)
  const { width, containerRef } = useContainerWidth()

  useEffect(() => { setMounted(true) }, [])

  // Cargar Layout de RRHH
  useEffect(() => {
    if (!mounted) return
    const fetchLayout = async () => {
      try {
        const res = await fetch('/api/v1/user/layout?type=hr')
        if (res.ok) {
          const { layout } = await res.json()
          if (layout) setLayouts(layout)
        }
      } catch (e) {
        console.error('Error fetching HR layout:', e)
      }
    }
    fetchLayout()
  }, [mounted])

  // Persistir Layout de RRHH (Debounced)
  const persistLayout = useMemo(() => debounce(async (newLayouts: any) => {
    try {
      await fetch('/api/v1/user/layout?type=hr', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: newLayouts })
      })
    } catch (e) {
      console.error('Error persisting HR layout:', e)
    }
  }, 2000), [])

  const onLayoutChange = (currentLayout: Layout[], allLayouts: { [key: string]: Layout[] }) => {
    if (!isLocked) {
      setLayouts(allLayouts)
      persistLayout(allLayouts)
    }
  }

  const WidgetWrapper = ({ id, children }: { id: string, children: React.ReactNode }) => (
    <div key={id} className="group relative h-full w-full">
      {!isLocked && (
        <div className="drag-handle absolute top-4 left-4 z-[100] bg-white shadow-2xl border-2 border-primary/20 rounded-xl p-2 cursor-grab active:cursor-grabbing hover:scale-110 transition-all opacity-0 group-hover:opacity-100">
          <GripVertical className="h-4 w-4 text-primary" />
        </div>
      )}
      {children}
    </div>
  )

  if (!mounted) return null

  return (
    <div className="space-y-8 pb-20" ref={containerRef}>
      <VacationRequestModal 
        open={isVacationModalOpen} 
        setOpen={setIsVacationModalOpen}
        initialData={vacationInitialData}
        onSuccess={() => mutate('/api/erp/hr/vacations')}
      />

      {/* Header con Soberanía */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight">RRHH Dynamic Canvas</h1>
          <p className="text-muted-foreground font-medium text-sm flex items-center gap-2 mt-1">
             <ShieldCheck className="h-4 w-4 text-emerald-500" />
             Gestión adaptativa de capital humano y soberanía operacional.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-2xl border mr-4">
             <button 
               onClick={() => setActiveTab('overview')}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'overview' ? 'bg-white shadow-sm text-slate-900 border' : 'text-slate-400 hover:text-slate-600'}`}
             >
                Global View
             </button>
             <button 
               onClick={() => setActiveTab('nominas')}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'nominas' ? 'bg-white shadow-sm text-slate-900 border' : 'text-slate-400 hover:text-slate-600'}`}
             >
                Payroll Vault
             </button>
          </div>
          
          <Button 
            className="rounded-2xl font-black uppercase text-[10px] h-11 px-6 shadow-xl bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 transition-all group"
            onClick={async () => {
              const res = await fetch('/api/v1/sovereignty/batch-sign', { method: 'POST', body: JSON.stringify({ category: 'hr' }) });
              if (res.ok) mutate('/api/v1/sovereignty/audit-logs');
            }}
          >
            <ShieldCheck className="w-4 h-4 mr-2 text-emerald-400 group-hover:scale-125 transition-transform" />
            Sello del CEO (Firma Digital)
          </Button>
          <Button 
            onClick={() => setIsVacationModalOpen(true)}
            className="rounded-2xl font-black uppercase text-[10px] h-11 px-6 shadow-xl shadow-primary/20"
          >
            <Umbrella className="w-4 h-4 mr-2" /> Solicitar Vacaciones
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex justify-end mb-6">
               <Button 
                  variant={isLocked ? "outline" : "default"}
                  onClick={() => setIsLocked(!isLocked)}
                  className="rounded-xl font-bold uppercase text-[9px] h-9 px-4 transition-all"
               >
                  {isLocked ? <Lock className="w-3 h-3 mr-2" /> : <Unlock className="w-3 h-3 mr-2" />}
                  {isLocked ? "Ajustar Bento" : "Bloquear"}
               </Button>
            </div>
            
            <ResponsiveGridLayout
              className="layout"
              layouts={layouts}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={100}
              width={width || 1200}
              draggableHandle=".drag-handle"
              isDraggable={!isLocked}
              isResizable={!isLocked}
              onLayoutChange={onLayoutChange}
              margin={[24, 24]}
              compactType="vertical"
            >
              <div key="tinder">
                <WidgetWrapper id="tinder">
                  <motion.div whileHover={{ scale: 1.01 }} className="h-full">
                    <Card className="h-full border-none shadow-2xl rounded-[2.5rem] bg-white overflow-hidden p-6">
                      <CardHeader className="p-0 mb-6">
                          <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                            <Wallet className="w-5 h-5 text-primary" />
                            Gastos Proactivos
                          </CardTitle>
                          <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Feed de Aprobación Rápida</CardDescription>
                      </CardHeader>
                      <div className="h-[calc(100%-80px)]">
                        <ExpenseApprovalFeed />
                      </div>
                    </Card>
                  </motion.div>
                </WidgetWrapper>
              </div>

              <div key="ia-analytics">
                <WidgetWrapper id="ia-analytics">
                  <IATeamAnalytics />
                </WidgetWrapper>
              </div>

              <div key="calendar">
                <WidgetWrapper id="calendar">
                  <VacationCalendar 
                    onRequestClick={(data) => {
                      setVacationInitialData(data)
                      setIsVacationModalOpen(true)
                    }} 
                  />
                </WidgetWrapper>
              </div>

              <div key="kill-switch">
                <WidgetWrapper id="kill-switch">
                  <SecurityKillSwitch 
                      tenantId="default" 
                      employeeId={activeOffboardingId || undefined}
                      onCompleteAction={(item) => {
                        fetch('/api/v1/sovereignty/audit-logs', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              level: 'INFO',
                              message: `[SECURITY_OFFBOARDING] Revocación completada: ${item.resource} (${item.env}). Acción: ${item.action}.`,
                            })
                        });
                      }}
                  />
                </WidgetWrapper>
              </div>

              <div key="audit">
                <WidgetWrapper id="audit">
                  <TrustProtocolLogs category="hr" />
                </WidgetWrapper>
              </div>
            </ResponsiveGridLayout>
          </motion.div>
        ) : (
          <motion.div
            key="nominas"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
             <PayrollVault />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
