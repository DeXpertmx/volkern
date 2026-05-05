
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    CheckCircle2,
    Circle,
    Phone,
    Mail,
    Calendar,
    Bell,
    Trash2,
    Search,
    Filter,
    Clock,
    CheckSquare,
    ListTodo,
    ExternalLink,
    Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isPast, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

interface Task {
    id: string;
    tipo: string;
    titulo: string;
    descripcion: string | null;
    fechaVencimiento: string;
    completada: boolean;
    asignadoA: string | null;
    fechaCreacion: string;
    lead: {
        id: string;
        nombre: string;
        empresa: string | null;
    };
    asignadoUsuario?: {
        id: string;
        name: string | null;
        email: string;
    };
}

const taskTypes = [
    { value: 'llamada', label: 'Llamada', icon: Phone },
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'reunion', label: 'Reunión', icon: Calendar },
    { value: 'recordatorio', label: 'Recordatorio', icon: Bell }
];

export default function TareasPage() {
    const { data: session } = useSession();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        status: 'pending',
        assignedToMe: true,
        search: '',
        tipo: 'all'
    });

    useEffect(() => {
        fetchTasks();
    }, [filter.status, filter.assignedToMe, filter.tipo]);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filter.status !== 'all') params.append('status', filter.status);
            if (filter.assignedToMe) params.append('assignedToMe', 'true');
            if (filter.tipo !== 'all') params.append('tipo', filter.tipo);
            if (filter.search) params.append('search', filter.search);

const res = await apiFetch(`/api/tasks?${params.toString()}`);
            const res = await apiFetch(`/api/tasks/${taskId}`, {
            const res = await apiFetch(`/api/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completada: !completed })
            });

            if (!res.ok) throw new Error('Error al actualizar tarea');

            toast.success(completed ? 'Tarea marcada como pendiente' : 'Tarea completada');
            fetchTasks();
        } catch (error) {
            console.error('Error updating task:', error);
            toast.error('Error al actualizar la tarea');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!confirm('¿Estás seguro de que quieres eliminar esta tarea?')) return;

        try {
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Error al eliminar tarea');

            toast.success('Tarea eliminada correctamente');
            fetchTasks();
        } catch (error) {
            console.error('Error deleting task:', error);
            toast.error('Error al eliminar la tarea');
        }
    };

    const getTaskIcon = (tipo: string) => {
        const taskType = taskTypes.find(t => t.value === tipo);
        return taskType ? taskType.icon : Bell;
    };

    const isOverdue = (task: Task) => {
        return !task.completada && isPast(new Date(task.fechaVencimiento)) && !isToday(new Date(task.fechaVencimiento));
    };

    const stats = {
        pending: tasks.filter(t => !t.completada).length,
        overdue: tasks.filter(t => isOverdue(t)).length,
        today: tasks.filter(t => isToday(new Date(t.fechaVencimiento)) && !t.completada).length
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center">
                        <ListTodo className="h-8 w-8 mr-3 text-primary" />
                        Tareas Globales
                    </h1>
                    <p className="text-muted-foreground">
                        Gestiona todas tus actividades de seguimiento en un solo lugar
                    </p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/leads">
                        <Plus className="h-4 w-4 mr-2" />
                        Nueva Tarea (vía Leads)
                    </Link>
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-blue-50/50 border-blue-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600 flex items-center">
                            <Clock className="h-4 w-4 mr-2" />
                            Tareas Pendientes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-700">{stats.pending}</div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50/50 border-red-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-red-600 flex items-center">
                            <Bell className="h-4 w-4 mr-2" />
                            Vencidas
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-700">{stats.overdue}</div>
                    </CardContent>
                </Card>
                <Card className="bg-green-50/50 border-green-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-600 flex items-center">
                            <Calendar className="h-4 w-4 mr-2" />
                            Para Hoy
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-700">{stats.today}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="relative w-full md:w-80">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por título o lead..."
                                    className="pl-9"
                                    value={filter.search}
                                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchTasks()}
                                />
                            </div>
                            <Button variant="outline" size="icon" onClick={fetchTasks}>
                                <Filter className="h-4 w-4" />
                            </Button>
                        </div>

                        <Tabs
                            value={filter.status}
                            onValueChange={(v) => setFilter({ ...filter, status: v })}
                            className="w-auto"
                        >
                            <TabsList>
                                <TabsTrigger value="pending">Pendientes</TabsTrigger>
                                <TabsTrigger value="completed">Completadas</TabsTrigger>
                                <TabsTrigger value="all">Todas</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t">
                        <div className="flex items-center space-x-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo:</label>
                            <Select value={filter.tipo} onValueChange={(v) => setFilter({ ...filter, tipo: v })}>
                                <SelectTrigger className="h-8 w-[140px] text-xs">
                                    <SelectValue placeholder="Todos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los tipos</SelectItem>
                                    {taskTypes.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center space-x-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Asignación:</label>
                            <Select
                                value={filter.assignedToMe ? 'me' : 'all'}
                                onValueChange={(v) => setFilter({ ...filter, assignedToMe: v === 'me' })}
                            >
                                <SelectTrigger className="h-8 w-[140px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="me">Mis tareas</SelectItem>
                                    <SelectItem value="all">Todo el equipo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
                            <p className="text-sm text-muted-foreground">Cargando tareas...</p>
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="bg-muted p-4 rounded-full mb-4">
                                <CheckSquare className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold">No se encontraron tareas</h3>
                            <p className="text-sm text-muted-foreground max-w-xs mt-2">
                                Ajusta los filtros o crea nuevas tareas desde la sección de Leads para verlas aquí.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tasks.map((task) => {
                                const TaskIcon = getTaskIcon(task.tipo);
                                const overdue = isOverdue(task);

                                return (
                                    <div
                                        key={task.id}
                                        className={`group flex items-start gap-4 p-4 border rounded-xl transition-all shadow-sm hover:shadow-md ${task.completada ? 'bg-muted/30 border-muted text-muted-foreground' : 'bg-card'
                                            } ${overdue ? 'bg-red-50/30 border-red-100' : ''}`}
                                    >
                                        <button
                                            onClick={() => handleToggleComplete(task.id, task.completada)}
                                            className="mt-1 flex-shrink-0"
                                        >
                                            {task.completada ? (
                                                <div className="bg-green-100 rounded-full p-0.5">
                                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                                </div>
                                            ) : (
                                                <Circle className="h-6 w-6 text-gray-300 hover:text-primary transition-colors" />
                                            )}
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <div className={`p-1.5 rounded-lg ${task.completada ? 'bg-muted' : 'bg-primary/5 text-primary'}`}>
                                                    <TaskIcon className="h-4 w-4" />
                                                </div>
                                                <h4 className={`text-base font-semibold truncate ${task.completada ? 'line-through opacity-70' : ''}`}>
                                                    {task.titulo}
                                                </h4>

                                                <div className="ml-auto flex items-center gap-2">
                                                    {overdue && (
                                                        <Badge variant="destructive" className="animate-pulse">Vencida</Badge>
                                                    )}
                                                    {isToday(new Date(task.fechaVencimiento)) && !task.completada && (
                                                        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">Hoy</Badge>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
                                                <Link
                                                    href={`/dashboard/leads/${task.lead.id}`}
                                                    className="flex items-center text-primary font-medium hover:underline"
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                                    Lead: {task.lead.nombre} {task.lead.empresa ? `(${task.lead.empresa})` : ''}
                                                </Link>

                                                <div className="flex items-center">
                                                    📅 {format(new Date(task.fechaVencimiento), "d 'de' MMMM, HH:mm", { locale: es })}
                                                </div>

                                                {task.asignadoUsuario && (
                                                    <div className="flex items-center">
                                                        👤 {task.asignadoUsuario.name || task.asignadoUsuario.email}
                                                    </div>
                                                )}
                                            </div>

                                            {task.descripcion && (
                                                <p className="mt-3 text-sm text-muted-foreground line-clamp-2 italic bg-muted/20 p-2 rounded">
                                                    "{task.descripcion}"
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteTask(task.id)}
                                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
