'use client'

import { useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Variable, User, Calendar, Briefcase, Zap } from 'lucide-react'

interface VariableSelectorProps {
    onSelect: (variable: string) => void
    triggerNode?: React.ReactNode
}

export function VariableSelector({ onSelect, triggerNode }: VariableSelectorProps) {
    const variableGroups = [
        {
            id: 'contact',
            label: 'Contacto',
            icon: <User className="h-4 w-4 mr-2" />,
            variables: [
                { label: 'Nombre completo', value: '{{contact.name}}' },
                { label: 'Primer nombre', value: '{{contact.first_name}}' },
                { label: 'Correo electrónico', value: '{{contact.email}}' },
                { label: 'Teléfono', value: '{{contact.phone}}' },
                { label: 'Compañía', value: '{{contact.company}}' },
            ]
        },
        {
            id: 'appointment',
            label: 'Citas (Si aplica)',
            icon: <Calendar className="h-4 w-4 mr-2" />,
            variables: [
                { label: 'Fecha de cita', value: '{{appointment.start_time}}' },
                { label: 'Link de reunión', value: '{{appointment.meeting_link}}' },
                { label: 'Tipo de cita', value: '{{appointment.type}}' },
            ]
        },
        {
            id: 'business',
            label: 'Tu Negocio',
            icon: <Briefcase className="h-4 w-4 mr-2" />,
            variables: [
                { label: 'Nombre de cuenta', value: '{{business.name}}' },
                { label: 'Email principal', value: '{{business.email}}' },
                { label: 'Teléfono', value: '{{business.phone}}' },
            ]
        },
        {
            id: 'custom',
            label: 'Valores Custom',
            icon: <Zap className="h-4 w-4 mr-2" />,
            variables: [
                { label: 'Día Actual (Ej: Lunes)', value: '{{custom.current_day}}' },
                { label: 'Fecha Corta', value: '{{custom.current_date_short}}' },
            ]
        }
    ]

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {triggerNode || (
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2 bg-slate-100 dark:bg-slate-800 border-dashed">
                        <Variable className="h-3 w-3 mr-1" />
                        <span className="hidden sm:inline">Insertar Variable</span>
                        <span className="sm:hidden">Var</span>
                    </Button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 nodrag" align="end">
                {variableGroups.map((group, groupIdx) => (
                    <div key={group.id}>
                        <DropdownMenuLabel className="flex items-center text-xs">
                            {group.icon}
                            {group.label}
                        </DropdownMenuLabel>
                        {group.variables.map((variable) => (
                            <DropdownMenuItem
                                key={variable.value}
                                onClick={() => onSelect(variable.value)}
                                className="text-xs focus:bg-blue-50 dark:focus:bg-blue-900/40 cursor-pointer pl-6"
                            >
                                <span>{variable.label}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                                    {variable.value.replace(/[{}]/g, '')}
                                </span>
                            </DropdownMenuItem>
                        ))}
                        {groupIdx < variableGroups.length - 1 && <DropdownMenuSeparator />}
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
