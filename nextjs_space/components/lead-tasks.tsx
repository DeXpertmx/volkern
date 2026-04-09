
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, CheckCircle2, Circle, Phone, Mail, Calendar, Bell, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, isPast, isToday } from 'date-fns';
import { es } from 'date-fns/locale';

interface Task {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  fechaVencimiento: string;
  completada: boolean;
  asignadoA: string | null;
  fechaCreacion: string;
}

interface LeadTasksProps {
  leadId: string;
}

const taskTypes = [
  { value: 'llamada', label: 'Llamada', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'reunion', label: 'Reunión', icon: Calendar },
  { value: 'recordatorio', label: 'Recordatorio', icon: Bell }
];

export function LeadTasks({ leadId }: LeadTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    tipo: 'llamada',
    titulo: '',
    descripcion: '',
    fechaVencimiento: ''
  });

  useEffect(() => {
    fetchTasks();
  }, [leadId]);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/tasks`);
      if (!res.ok) throw new Error('Error al cargar tareas');
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Error al cargar las tareas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!formData.titulo || !formData.fechaVencimiento) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    try {
      const res = await fetch(`/api/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) throw new Error('Error al crear tarea');

      toast.success('Tarea creada correctamente');
      setIsDialogOpen(false);
      setFormData({ tipo: 'llamada', titulo: '', descripcion: '', fechaVencimiento: '' });
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Error al crear la tarea');
    }
  };

  const handleToggleComplete = async (taskId: string, completed: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Tareas ({tasks.filter(t => !t.completada).length})
            </CardTitle>
            <CardDescription>
              Gestiona las tareas relacionadas con este lead
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tarea
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Crear Nueva Tarea</DialogTitle>
                <DialogDescription>
                  Añade una nueva tarea para seguimiento de este lead
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="tipo">Tipo de Tarea *</Label>
                  <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {taskTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center">
                            <type.icon className="h-4 w-4 mr-2" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="titulo">Título *</Label>
                  <Input
                    id="titulo"
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Ej: Llamar para seguimiento"
                  />
                </div>
                <div>
                  <Label htmlFor="fechaVencimiento">Fecha y Hora de Vencimiento *</Label>
                  <Input
                    id="fechaVencimiento"
                    type="datetime-local"
                    value={formData.fechaVencimiento}
                    onChange={(e) => setFormData({ ...formData, fechaVencimiento: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea
                    id="descripcion"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    placeholder="Detalles adicionales sobre la tarea..."
                    rows={3}
                  />
                </div>
                <Button onClick={handleCreateTask} className="w-full">
                  Crear Tarea
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No hay tareas creadas</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crea tu primera tarea para dar seguimiento a este lead
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
                  className={`flex items-start gap-3 p-4 border rounded-lg transition-all ${
                    task.completada ? 'bg-muted/50 opacity-75' : 'bg-white hover:shadow-sm'
                  } ${overdue ? 'border-red-200 bg-red-50' : ''}`}
                >
                  <button
                    onClick={() => handleToggleComplete(task.id, task.completada)}
                    className="mt-0.5"
                  >
                    {task.completada ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400 hover:text-primary" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <TaskIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <h4 className={`font-medium ${task.completada ? 'line-through text-muted-foreground' : ''}`}>
                        {task.titulo}
                      </h4>
                      {overdue && (
                        <Badge variant="destructive" className="text-xs">
                          Vencida
                        </Badge>
                      )}
                      {isToday(new Date(task.fechaVencimiento)) && !task.completada && (
                        <Badge variant="default" className="text-xs">
                          Hoy
                        </Badge>
                      )}
                    </div>
                    {task.descripcion && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {task.descripcion}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className={overdue && !task.completada ? 'text-red-600 font-medium' : ''}>
                        📅 {format(new Date(task.fechaVencimiento), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
