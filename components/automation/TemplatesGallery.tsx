// @ts-nocheck
'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Layers, ShoppingCart, UserPlus, CalendarDays, Sparkles } from 'lucide-react'

// Definimos algunas recetas estáticas
const templates = [
    {
        id: 'rescate_carrito',
        title: 'Rescate de Carrito Abanadondado',
        description: 'Recupera ventas perdidas enviando SMS y Email después de 1 hora de inactividad.',
        icon: <ShoppingCart className="h-6 w-6 text-orange-500" />,
        color: 'bg-orange-100 dark:bg-orange-950/50',
        nodes: [
            { id: 't1', type: 'trigger', position: { x: 400, y: 100 }, data: { trigger: 'pago_fallido' } },
            { id: 'd1', type: 'delay', position: { x: 400, y: 250 }, data: { config: { duration: 1, unit: 'hours' }, isInvalid: false } },
            { id: 'a1', type: 'action', position: { x: 400, y: 400 }, data: { config: { actionType: 'enviar_email', subject: '¿Olvidaste algo?', message: 'Hola {{contact.first_name}}, vimos que dejaste items en tu carrito. Usa el cupón VUELVE10.' }, isInvalid: false } },
            { id: 'a2', type: 'action', position: { x: 400, y: 550 }, data: { config: { actionType: 'enviar_whatsapp', message: '¡Hola {{contact.first_name}}! Tu carrito te espera. Compra aquí: {{custom.checkout_url}}' }, isInvalid: false } }
        ],
        edges: [
            { id: 'e1', source: 't1', target: 'd1' },
            { id: 'e2', source: 'd1', target: 'a1' },
            { id: 'e3', source: 'a1', target: 'a2' }
        ]
    },
    {
        id: 'bienvenida_lead',
        title: 'Bienvenida a Nuevos Leads',
        description: 'Etiqueta automáticamente al prospecto y envíale un saludo amigable instantáneo.',
        icon: <UserPlus className="h-6 w-6 text-blue-500" />,
        color: 'bg-blue-100 dark:bg-blue-950/50',
        nodes: [
            { id: 't1', type: 'trigger', position: { x: 400, y: 100 }, data: { trigger: 'nuevo_lead' } },
            { id: 'a1', type: 'action', position: { x: 400, y: 250 }, data: { config: { actionType: 'asignar_tag', subject: 'Nuevo Ingreso' }, isInvalid: false } },
            { id: 'a2', type: 'action', position: { x: 400, y: 400 }, data: { config: { actionType: 'enviar_email', subject: '¡Bienvenido a {{business.name}}!', message: 'Hola {{contact.first_name}}, gracias por registrarte. Un asesor te contactará pronto.' }, isInvalid: false } }
        ],
        edges: [
            { id: 'e1', source: 't1', target: 'a1' },
            { id: 'e2', source: 'a1', target: 'a2' }
        ]
    },
    {
        id: 'recordatorio_citas',
        title: 'Recordatorio de Citas VIP',
        description: 'Avisa por WhatsApp 24h previas y cambia la etapa del CRM en automático.',
        icon: <CalendarDays className="h-6 w-6 text-green-500" />,
        color: 'bg-green-100 dark:bg-green-950/50',
        nodes: [
            { id: 't1', type: 'trigger', position: { x: 400, y: 100 }, data: { trigger: 'cita_agendada' } },
            { id: 'c1', type: 'condition', position: { x: 400, y: 250 }, data: { config: { field: 'appointment.status', operator: 'equals', value: 'Confirmada' }, isInvalid: false } },
            { id: 'a1', type: 'action', position: { x: 200, y: 450 }, data: { config: { actionType: 'enviar_whatsapp', message: '¡Nos vemos mañana {{contact.first_name}} a las {{appointment.start_time}}!' }, isInvalid: false } }
        ],
        edges: [
            { id: 'e1', source: 't1', target: 'c1' },
            { id: 'e2', source: 'c1', target: 'a1', sourceHandle: 'true' }
        ]
    }
]

interface TemplatesGalleryProps {
    onSelectTemplate: (nodes: any[], edges: any[]) => void
}

export function TemplatesGallery({ onSelectTemplate }: TemplatesGalleryProps) {
    const [open, setOpen] = useState(false)

    const handleApply = (template: typeof templates[0]) => {
        // Generar IDs frescos para no tener colisiones si se aplica varias veces (opcional, pero buena práctica)
        const idMap = new Map()

        const freshNodes = template.nodes.map(node => {
            const newId = `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
            idMap.set(node.id, newId)
            return { ...node, id: newId }
        })

        const freshEdges = template.edges.map(edge => ({
            ...edge,
            id: `e-${idMap.get(edge.source)}-${idMap.get(edge.target)}`,
            source: idMap.get(edge.source),
            target: idMap.get(edge.target)
        }))

        onSelectTemplate(freshNodes, freshEdges)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300">
                    <Sparkles className="h-4 w-4" />
                    Usar Plantilla
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Layers className="h-5 w-5 text-primary" />
                        Galería de Plantillas
                    </DialogTitle>
                    <DialogDescription>
                        Acelera tu trabajo utilizando automatizaciones pre-construidas por expertos.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {templates.map((template) => (
                        <Card key={template.id} className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-primary/50 transition-colors group cursor-pointer" onClick={() => handleApply(template)}>
                            <div className="p-5">
                                <div className={`h-12 w-12 rounded-xl ${template.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                    {template.icon}
                                </div>
                                <h3 className="font-semibold text-lg mb-1">{template.title}</h3>
                                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                                    {template.description}
                                </p>

                                <div className="flex gap-2">
                                    <Badge variant="secondary" className="text-[10px] font-mono">{template.nodes.length} Nodos</Badge>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function Badge({ children, className, variant = "default" }: any) {
    return <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>{children}</span>
}
