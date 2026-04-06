import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface SortableWidgetProps {
    id: string;
    children: React.ReactNode;
}

export function SortableWidget({ id, children }: SortableWidgetProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative group mb-6">
            <div
                {...attributes}
                {...listeners}
                className="absolute -left-5 top-1/2 -translate-y-1/2 p-2 cursor-grab opacity-40 group-hover:opacity-100 transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 z-50"
            >
                <GripVertical className="h-5 w-5" />
            </div>
            {children}
        </div>
    );
}
