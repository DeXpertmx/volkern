'use client'

import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface ConfigSidebarItem {
  id: string
  label: string
  icon: LucideIcon
}

interface ConfigSidebarProps {
  items: ConfigSidebarItem[]
  activeSection: string
  onSelect: (id: string) => void
}

export function ConfigSidebar({ items, activeSection, onSelect }: ConfigSidebarProps) {
  return (
    <div className="w-full md:w-64 flex-shrink-0 space-y-1">
      {items.map((item) => {
        const isActive = activeSection === item.id
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
              isActive 
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className={cn("h-4 w-4", isActive ? "text-white" : "text-muted-foreground")} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
