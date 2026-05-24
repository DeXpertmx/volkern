import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TeamRole = 'admin' | 'manager' | 'member' | 'viewer' | 'owner';

export const TEAM_ROLES: TeamRole[] = ['owner', 'admin', 'manager', 'member', 'viewer'];

export const TEAM_ROLE_COLORS: Record<TeamRole, string> = {
  owner: '#EAB308',
  admin: '#EF4444',
  manager: '#3B82F6',
  member: '#22C55E',
  viewer: '#6B7280',
};
export type ActivityAction = 'created' | 'updated' | 'deleted' | 'completed' | 'assigned' | 'commented' | 'joined' | 'left';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: TeamRole;
  avatar: string;
  department: string;
  specialties: string[];
  status: 'active' | 'invited' | 'suspended';
  joinedAt: number;
  lastActive: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TeamActivity {
  id: string;
  memberId: string;
  memberName: string;
  action: ActivityAction;
  entityType: 'task' | 'deal' | 'lead' | 'contact' | 'invoice' | 'note' | 'member';
  entityId: string;
  entityName: string;
  details: string;
  timestamp: number;
}

export interface TeamStats {
  totalMembers: number;
  activeMembers: number;
  byRole: Record<TeamRole, number>;
  byDepartment: Record<string, number>;
  recentActivity: TeamActivity[];
  topPerformers: { memberId: string; memberName: string; actions: number }[];
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const MEMBERS_KEY = 'volkern_team_members';
const ACTIVITY_KEY = 'volkern_team_activity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `tm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class TeamService {
  // ── Members ───────────────────────────────────────────────────────────

  /** Alias for getMembers */
  async getAll(): Promise<TeamMember[]> {
    return this.getMembers();
  }

  /** Alias for addMember */
  async create(data: Partial<Omit<TeamMember, 'id' | 'createdAt' | 'updatedAt'>>): Promise<TeamMember> {
    return this.addMember({
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      role: data.role || 'viewer',
      avatar: data.avatar || '',
      department: data.department || '',
      specialties: data.specialties || [],
      status: data.status || 'invited',
      joinedAt: Date.now(),
      lastActive: null,
    });
  }

  /** Alias for updateMember */
  async update(id: string, data: Partial<Omit<TeamMember, 'id' | 'createdAt'>>): Promise<TeamMember | null> {
    return this.updateMember(id, data);
  }

  /** Alias for removeMember */
  async delete(id: string): Promise<void> {
    return this.removeMember(id);
  }

  async resendInvite(id: string): Promise<void> {
    // Re-envía invitación (solo cambia updatedAt como placeholder)
    await this.updateMember(id, { status: 'invited', updatedAt: Date.now() });
  }

  async updateStatus(id: string, status: 'active' | 'suspended'): Promise<TeamMember | null> {
    return this.updateMember(id, { status });
  }

  async getMembers(): Promise<TeamMember[]> {
    try {
      const raw = await SecureStore.getItemAsync(MEMBERS_KEY);
      if (raw) return JSON.parse(raw) as TeamMember[];
    } catch { /* ignore */ }
    return [];
  }

  async getMember(id: string): Promise<TeamMember | null> {
    const all = await this.getMembers();
    return all.find(m => m.id === id) || null;
  }

  async getMembersByRole(role: TeamRole): Promise<TeamMember[]> {
    const all = await this.getMembers();
    return all.filter(m => m.role === role);
  }

  async search(query: string): Promise<TeamMember[]> {
    const all = await this.getMembers();
    const lower = query.toLowerCase();
    return all.filter(m =>
      m.name.toLowerCase().includes(lower) ||
      m.email.toLowerCase().includes(lower) ||
      m.department.toLowerCase().includes(lower) ||
      m.specialties.some(s => s.toLowerCase().includes(lower))
    );
  }

  async addMember(data: Omit<TeamMember, 'id' | 'createdAt' | 'updatedAt'>): Promise<TeamMember> {
    const all = await this.getMembers();
    const member: TeamMember = {
      ...data,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      joinedAt: data.joinedAt || Date.now(),
      lastActive: data.lastActive ?? null,
    };
    all.push(member);
    await this.persistMembers(all);
    await this.logActivity(member.id, member.name, 'joined', 'member', member.id, member.name, 'Se unió al equipo');
    return member;
  }

  async updateMember(id: string, data: Partial<Omit<TeamMember, 'id' | 'createdAt'>>): Promise<TeamMember | null> {
    const all = await this.getMembers();
    const idx = all.findIndex(m => m.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, updatedAt: Date.now() };
    await this.persistMembers(all);
    return all[idx];
  }

  async removeMember(id: string): Promise<void> {
    const all = await this.getMembers();
    const member = all.find(m => m.id === id);
    await this.persistMembers(all.filter(m => m.id !== id));
    if (member) {
      await this.logActivity(member.id, member.name, 'left', 'member', id, member.name, 'Salió del equipo');
    }
  }

  async toggleActive(id: string): Promise<TeamMember | null> {
    const member = await this.getMember(id);
    if (!member) return null;
    const newStatus = member.status === 'active' ? 'suspended' : 'active';
    return this.updateMember(id, { status: newStatus });
  }

  // ── Activity Log ──────────────────────────────────────────────────────

  async getActivity(limit = 50): Promise<TeamActivity[]> {
    try {
      const raw = await SecureStore.getItemAsync(ACTIVITY_KEY);
      if (raw) {
        const all = JSON.parse(raw) as TeamActivity[];
        return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
      }
    } catch { /* ignore */ }
    return [];
  }

  async getActivityByMember(memberId: string, limit = 20): Promise<TeamActivity[]> {
    const all = await this.getActivity(500);
    return all.filter(a => a.memberId === memberId).slice(0, limit);
  }

  async logActivity(
    memberId: string, memberName: string, action: ActivityAction,
    entityType: TeamActivity['entityType'], entityId: string,
    entityName: string, details: string,
  ): Promise<void> {
    const all = await this.getAllActivity();
    const activity: TeamActivity = {
      id: generateId(),
      memberId, memberName, action, entityType,
      entityId, entityName, details,
      timestamp: Date.now(),
    };
    all.push(activity);
    const trimmed = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
    try {
      await SecureStore.setItemAsync(ACTIVITY_KEY, JSON.stringify(trimmed));
    } catch { /* ignore */ }
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getStats(): Promise<TeamStats> {
    const members = await this.getMembers();
    const activity = await this.getActivity(100);

    const byRole = { owner: 0, admin: 0, manager: 0, member: 0, viewer: 0 };
    const byDepartment: Record<string, number> = {};

    for (const m of members) {
      byRole[m.role]++;
      byDepartment[m.department] = (byDepartment[m.department] || 0) + 1;
    }

    // Top performers by activity count
    const actionCount: Record<string, { name: string; count: number }> = {};
    for (const a of activity) {
      if (!actionCount[a.memberId]) {
        actionCount[a.memberId] = { name: a.memberName, count: 0 };
      }
      actionCount[a.memberId].count++;
    }
    const topPerformers = Object.entries(actionCount)
      .map(([memberId, { name, count }]) => ({ memberId, memberName: name, actions: count }))
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 5);

    return {
      totalMembers: members.length,
      activeMembers: members.filter(m => m.status === 'active').length,
      byRole,
      byDepartment,
      recentActivity: activity.slice(0, 20),
      topPerformers,
    };
  }

  // ── Private ───────────────────────────────────────────────────────────

  private async persistMembers(items: TeamMember[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(MEMBERS_KEY, JSON.stringify(items));
    } catch {
      console.error('[TeamService] Error saving members');
    }
  }

  private async getAllActivity(): Promise<TeamActivity[]> {
    try {
      const raw = await SecureStore.getItemAsync(ACTIVITY_KEY);
      if (raw) return JSON.parse(raw) as TeamActivity[];
    } catch { /* ignore */ }
    return [];
  }
}

export const teamService = new TeamService();
