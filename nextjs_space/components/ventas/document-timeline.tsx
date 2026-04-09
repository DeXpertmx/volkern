'use client';

import { motion } from 'framer-motion';
import {
    CheckCircle2,
    Send,
    Eye,
    User,
    Clock,
    FileEdit,
    AlertCircle,
    FileCheck,
    Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
    id: string;
    type: 'created' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'edited' | 'reminder';
    date: string;
    user?: string;
    description: string;
}

interface DocumentTimelineProps {
    events: TimelineEvent[];
    className?: string;
}

const getEventConfig = (type: TimelineEvent['type']) => {
    switch (type) {
        case 'created':
            return { icon: FileEdit, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Creado' };
        case 'sent':
            return { icon: Send, color: 'text-indigo-500', bg: 'bg-indigo-500/10', label: 'Enviado' };
        case 'viewed':
            return { icon: Eye, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Visto' };
        case 'accepted':
            return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Aceptado' };
        case 'declined':
            return { icon: Ban, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Rechazado' };
        case 'edited':
            return { icon: FileEdit, color: 'text-slate-500', bg: 'bg-slate-500/10', label: 'Editado' };
        case 'reminder':
            return { icon: Clock, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Recordatorio' };
        default:
            return { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Evento' };
    }
};

export function DocumentTimeline({ events, className }: DocumentTimelineProps) {
    return (
        <div className={cn("space-y-4", className)}>
            <div className="relative pl-8 space-y-8 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-muted-foreground/20">
                {events.map((event, index) => {
                    const config = getEventConfig(event.type);
                    const Icon = config.icon;

                    return (
                        <motion.div
                            key={event.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="relative"
                        >
                            {/* Dot */}
                            <div className={cn(
                                "absolute -left-[26px] mt-1 h-5 w-5 rounded-full border-4 border-background flex items-center justify-center z-10",
                                config.bg
                            )}>
                                <div className={cn("h-1.5 w-1.5 rounded-full", config.color.replace('text-', 'bg-'))} />
                            </div>

                            {/* Content */}
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", config.bg, config.color)}>
                                        {config.label}
                                    </span>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                                        <Clock className="h-3 w-3" />
                                        {event.date}
                                    </span>
                                </div>
                                <p className="text-sm font-medium text-foreground/90 mt-1">
                                    {event.description}
                                </p>
                                {event.user && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center">
                                            <User className="h-2.5 w-2.5 text-muted-foreground" />
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">{event.user}</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
