import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalStatus = 'active' | 'completed' | 'cancelled';
export type GoalType = 'numeric' | 'percentage' | 'boolean';

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  targetValue: number;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  targetValue: number;
  currentValue: number;
  unit: string;
  icon: string;
  color: string;
  deadline?: number;
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
  order: number;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const GOALS_KEY = 'volkern_goals';
const MILESTONES_KEY = 'volkern_goal_milestones';

// ─── Service ──────────────────────────────────────────────────────────────────

class GoalsService {
  // ── Goals ───────────────────────────────────────────────────────────────

  async getAll(): Promise<Goal[]> {
    try {
      const raw = await SecureStore.getItemAsync(GOALS_KEY);
      if (raw) {
        const items = JSON.parse(raw) as Goal[];
        return items.sort((a, b) => a.order - b.order);
      }
    } catch {
      // ignore
    }
    return [];
  }

  async getActive(): Promise<Goal[]> {
    const all = await this.getAll();
    return all.filter((g) => g.status === 'active');
  }

  async getCompleted(): Promise<Goal[]> {
    const all = await this.getAll();
    return all.filter((g) => g.status === 'completed');
  }

  async create(data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'order'>): Promise<Goal> {
    const all = await this.getAll();
    const goal: Goal = {
      ...data,
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: all.length,
    };
    all.push(goal);
    await this.persist(all);
    return goal;
  }

  async update(id: string, data: Partial<Omit<Goal, 'id' | 'createdAt'>>): Promise<Goal | null> {
    const all = await this.getAll();
    const idx = all.findIndex((g) => g.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, updatedAt: Date.now() };
    await this.persist(all);
    return all[idx];
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((g) => g.id !== id);
    await this.persist(filtered);
    // Also remove associated milestones
    const milestones = await this.getMilestonesAll();
    const filteredMilestones = milestones.filter((m) => m.goalId !== id);
    await this.persistMilestonesAll(filteredMilestones);
  }

  async updateProgress(id: string, currentValue: number): Promise<Goal | null> {
    const all = await this.getAll();
    const idx = all.findIndex((g) => g.id === id);
    if (idx === -1) return null;
    const goal = all[idx];
    goal.currentValue = currentValue;
    goal.updatedAt = Date.now();
    // Auto-complete if target reached for numeric/percentage
    if (goal.type !== 'boolean' && goal.currentValue >= goal.targetValue && goal.status === 'active') {
      goal.status = 'completed';
    }
    await this.persist(all);
    return goal;
  }

  async setStatus(id: string, status: GoalStatus): Promise<Goal | null> {
    const all = await this.getAll();
    const idx = all.findIndex((g) => g.id === id);
    if (idx === -1) return null;
    all[idx].status = status;
    all[idx].updatedAt = Date.now();
    await this.persist(all);
    return all[idx];
  }

  async clearAll(): Promise<void> {
    await this.persist([]);
    await this.persistMilestonesAll([]);
  }

  // ── Milestones ─────────────────────────────────────────────────────────

  async getMilestones(goalId: string): Promise<Milestone[]> {
    const all = await this.getMilestonesAll();
    return all.filter((m) => m.goalId === goalId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async addMilestone(goalId: string, title: string, targetValue: number): Promise<Milestone> {
    const all = await this.getMilestonesAll();
    const milestone: Milestone = {
      id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      goalId,
      title,
      targetValue,
      completed: false,
      createdAt: Date.now(),
    };
    all.push(milestone);
    await this.persistMilestonesAll(all);
    return milestone;
  }

  async completeMilestone(id: string): Promise<Milestone | null> {
    const all = await this.getMilestonesAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    all[idx].completed = true;
    all[idx].completedAt = Date.now();
    await this.persistMilestonesAll(all);
    return all[idx];
  }

  async uncompleteMilestone(id: string): Promise<Milestone | null> {
    const all = await this.getMilestonesAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    all[idx].completed = false;
    all[idx].completedAt = undefined;
    await this.persistMilestonesAll(all);
    return all[idx];
  }

  async deleteMilestone(id: string): Promise<void> {
    const all = await this.getMilestonesAll();
    const filtered = all.filter((m) => m.id !== id);
    await this.persistMilestonesAll(filtered);
  }

  async getMilestoneProgress(goalId: string): Promise<{ completed: number; total: number }> {
    const all = await this.getMilestones(goalId);
    const completed = all.filter((m) => m.completed).length;
    return { completed, total: all.length };
  }

  // ── Stats ──────────────────────────────────────────────────────────────

  async getStats(): Promise<{ active: number; completed: number; total: number; overallProgress: number }> {
    const all = await this.getAll();
    const active = all.filter((g) => g.status === 'active').length;
    const completed = all.filter((g) => g.status === 'completed').length;
    const total = all.length;

    let overallProgress = 0;
    if (total > 0) {
      const totalProgress = all.reduce((sum, g) => {
        if (g.type === 'boolean') return sum + (g.currentValue >= 1 ? 100 : 0);
        if (g.status === 'completed') return sum + 100;
        return sum + Math.min((g.currentValue / g.targetValue) * 100, 100);
      }, 0);
      overallProgress = Math.round(totalProgress / total);
    }

    return { active, completed, total, overallProgress };
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async persist(items: Goal[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(GOALS_KEY, JSON.stringify(items));
    } catch {
      console.error('[GoalsService] Error saving goals');
    }
  }

  private async getMilestonesAll(): Promise<Milestone[]> {
    try {
      const raw = await SecureStore.getItemAsync(MILESTONES_KEY);
      if (raw) return JSON.parse(raw) as Milestone[];
    } catch {
      // ignore
    }
    return [];
  }

  private async persistMilestonesAll(items: Milestone[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(MILESTONES_KEY, JSON.stringify(items));
    } catch {
      console.error('[GoalsService] Error saving milestones');
    }
  }
}

export const goalsService = new GoalsService();
