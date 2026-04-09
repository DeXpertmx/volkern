'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ArrowRight, Building, ShieldCheck, Zap, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

export default function GoCardlessSuccessPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -mr-48 -mt-48" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -ml-48 -mb-48" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-xl w-full relative z-10"
      >
        <Card className="border-none shadow-2xl backdrop-blur-md bg-white/80 dark:bg-slate-900/80 overflow-hidden">
          <CardHeader className="pb-0 pt-10 text-center">
            <div className="flex justify-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
                className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30"
              >
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </motion.div>
            </div>
            <CardTitle className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              ¡Conexión Exitosa!
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Tu cuenta de GoCardless ha sido vinculada correctamente con Volkern CRM.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-10 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center space-y-2">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-sm">Validación Segura</h3>
                <p className="text-xs text-muted-foreground italic">Cifrado de grado bancario activo</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center space-y-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-sm">Automatización Lista</h3>
                <p className="text-xs text-muted-foreground italic">Cobros SEPA habilitados</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Próximos Pasos Recomendados</h4>
              <ul className="space-y-3">
                {[
                  'Configura tus primeros flujos de cobro en el Workflow Builder.',
                  'Vincula tus servicios con planes de domiciliación.',
                  'Envía tu primer mandato de autorización a un Lead.'
                ].map((step, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + (i * 0.1) }}
                    className="flex items-start gap-3 text-sm"
                  >
                    <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                    <span>{step}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building className="h-5 w-5" />
                <div>
                  <p className="text-xs font-semibold opacity-80 uppercase">Organización Conectada</p>
                  <p className="text-sm font-bold">GoCardless Merchant Account</p>
                </div>
              </div>
              <Badge className="bg-white/20 hover:bg-white/30 text-white border-none">
                Activo
              </Badge>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3 pb-10">
            <Button asChild className="w-full h-12 text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]">
              <Link href="/dashboard/integraciones?tab=contabilidad">
                Regresar al Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" className="w-full text-xs text-muted-foreground flex items-center gap-2">
              <ExternalLink className="h-3 w-3" />
              Ver panel de control en GoCardless
            </Button>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-8">
          ¿Problemas con la conexión? <span className="underline cursor-pointer">Contactar soporte técnico</span>
        </p>
      </motion.div>
    </div>
  )
}
