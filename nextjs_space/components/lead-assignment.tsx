
'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface LeadAssignmentProps {
  leadId: string;
  currentAssignedTo: string | null;
  onAssignmentChange: (userId: string | null) => void;
}

export function LeadAssignment({ leadId, currentAssignedTo, onAssignmentChange }: LeadAssignmentProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Error al cargar usuarios');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentChange = async (userId: string) => {
    try {
      const assignToValue = userId === 'unassigned' ? null : userId;

      const res = await fetch(`/api/leads/${leadId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asignadoA: assignToValue })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al asignar lead');
      }

      const assignedUser = users.find(u => u.id === userId);
      toast.success(
        userId === 'unassigned' 
          ? 'Lead desasignado correctamente' 
          : `Lead asignado a ${assignedUser?.name || assignedUser?.email}`
      );
      onAssignmentChange(assignToValue);
    } catch (error: any) {
      console.error('Error assigning lead:', error);
      toast.error(error.message || 'Error al asignar el lead');
    }
  };

  if (loading) {
    return (
      <div>
        <Label>Asignado a</Label>
        <div className="h-9 bg-muted animate-pulse rounded-md mt-2"></div>
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor="asignado">Asignado a</Label>
      <Select 
        value={currentAssignedTo || 'unassigned'} 
        onValueChange={handleAssignmentChange}
      >
        <SelectTrigger id="asignado">
          <SelectValue placeholder="Sin asignar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Sin asignar</SelectItem>
          {users.map(user => (
            <SelectItem key={user.id} value={user.id}>
              {user.name || user.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
