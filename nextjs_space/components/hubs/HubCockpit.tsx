'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LucideIcon, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface HubItem {
  title: string
  description: string
  href: string
  icon: LucideIcon
  color?: string
  badge?: string
}

interface HubCockpitProps {
  title: string
  description: string
  items: HubItem[]
  icon?: LucideIcon
  dashboard?: React.ReactNode
  hideModules?: boolean
}

export function HubCockpit({ title, description, items, icon: HeaderIcon, dashboard, hideModules }: HubCockpitProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemAnim = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  }

  return (
    <div className="space-y-8 p-6 pb-20 max-w-[1600px] mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {HeaderIcon && (
              <div className="p-3 rounded-2xl bg-primary/10 text-primary shadow-inner">
                <HeaderIcon className="h-8 w-8" />
              </div>
            )}
            <div>
                <h1 className="text-4xl font-black tracking-tighter bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent uppercase">
                  {title}
                </h1>
                <p className="text-muted-foreground text-sm font-medium">Volkern Hub Context</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 bg-background/50 backdrop-blur-md p-2 rounded-2xl border border-border/50 shadow-sm">
            <Link href="/dashboard" className="transition-transform hover:scale-105 active:scale-95">
                <img src="/volkern-logo.png" alt="Volkern" className="h-8 object-contain" />
            </Link>
        </div>
      </header>

      {/* Dashboard Slot */}
      {dashboard && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          {dashboard}
        </div>
      )}

      {!hideModules && (
        <div className="space-y-4">
          <h2 className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] px-1">Módulos Disponibles</h2>
          <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {items.map((item) => {
              const Icon = item.icon
              return (
                <motion.div key={item.href} variants={itemAnim}>
                  <Link href={item.href}>
                    <Card className="group relative h-full overflow-hidden border-none bg-background shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ring-1 ring-border/50">
                      <div className={cn(
                        "absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500",
                        item.color || "bg-primary"
                      )} />
                      
                      <CardHeader className="relative">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner",
                          item.color ? `${item.color.replace('bg-', 'bg-')}/10 text-${item.color.replace('bg-', '')}-600` : "bg-primary/10 text-primary"
                        )}>
                          {Icon && <Icon className="h-6 w-6" />}
                        </div>
                        {item.badge && (
                          <div className="absolute top-6 right-6 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                            {item.badge}
                          </div>
                        )}
                        <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">
                          {item.title}
                        </CardTitle>
                        <CardDescription className="text-sm leading-relaxed line-clamp-2">
                          {item.description}
                        </CardDescription>
                      </CardHeader>
                      
                      <CardContent className="relative flex justify-end pt-0">
                        <div className="p-2 rounded-full bg-muted/50 text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all duration-300">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      )}
    </div>
  )
}
