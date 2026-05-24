import { goalsService } from '../services/goals';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('goalsService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await goalsService.getAll()).toEqual([]);
  });
  it('returns stored goals', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', title: 'Goal 1', type: 'numeric', targetValue: 100, currentValue: 50, status: 'active', createdAt: 0, updatedAt: 0 }]));
    expect(await goalsService.getAll()).toHaveLength(1);
  });
});

describe('goalsService.create', () => {
  it('creates and persists goal', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await goalsService.create({ title: 'New Goal', description: 'Desc', type: 'numeric', targetValue: 100, currentValue: 0, unit: 'mxn', icon: 'flag', color: '#000', status: 'active' });
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('goalsService.update', () => {
  it('updates goal fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', title: 'Goal 1', type: 'numeric', targetValue: 100, currentValue: 50, status: 'active', createdAt: 0, updatedAt: 0 }]));
    const result = await goalsService.update('g1', { currentValue: 75 });
    expect(mockedSetItem).toHaveBeenCalled();
    expect(result).not.toBeNull();
  });
});

describe('goalsService.delete', () => {
  it('removes goal', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', title: 'Goal 1', type: 'numeric', targetValue: 100, currentValue: 50, status: 'active', createdAt: 0, updatedAt: 0 }]));
    await goalsService.delete('g1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('goalsService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const stats = await goalsService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('active');
  });
});


// ─── Extra coverage: goals edge cases ──────────────────────────────────

describe('goalsService.getActive', () => {
  it('filters active goals', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'g1', status: 'active', title: 'Active', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'g2', status: 'completed', title: 'Done', order: 1, createdAt: 2, updatedAt: 2 },
    ]));
    const result = await goalsService.getActive();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g1');
  });
});

describe('goalsService.getCompleted', () => {
  it('filters completed goals', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'g1', status: 'active', title: 'A', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'g2', status: 'completed', title: 'C', order: 1, createdAt: 2, updatedAt: 2 },
    ]));
    const result = await goalsService.getCompleted();
    expect(result).toHaveLength(1);
  });
});

describe('goalsService.setStatus', () => {
  it('changes goal status', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', status: 'active', title: 'G1', createdAt: 1, updatedAt: 1, order: 0 }]));
    const result = await goalsService.setStatus('g1', 'cancelled');
    expect(result!.status).toBe('cancelled');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('goalsService.clearAll', () => {
  it('clears goals and milestones', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', status: 'active', createdAt: 1, updatedAt: 1, order: 0 }]));
    await goalsService.clearAll();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('goalsService.getStats', () => {
  it('computes stats', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'g1', status: 'active', type: 'numeric', currentValue: 5, targetValue: 10, createdAt: 1, updatedAt: 1, order: 0 },
      { id: 'g2', status: 'completed', type: 'boolean', currentValue: 1, targetValue: 1, createdAt: 2, updatedAt: 2, order: 1 },
    ]));
    const stats = await goalsService.getStats();
    expect(stats.active).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.total).toBe(2);
    expect(stats.overallProgress).toBeGreaterThan(0);
  });
});

describe('goalsService.updateProgress auto-complete', () => {
  it('auto-completes when numeric goal reaches target', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', type: 'numeric', currentValue: 5, targetValue: 10, status: 'active', title: 'G1', description: 'D', unit: 'mxn', icon: 'flag', color: '#000', createdAt: 1, updatedAt: 1, order: 0 }]));
    const result = await goalsService.updateProgress('g1', 10);
    expect(result!.status).toBe('completed');
  });

  it('does not auto-complete boolean goal', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g2', type: 'boolean', currentValue: 0, targetValue: 1, status: 'active', title: 'G2', description: 'D', unit: '', icon: 'check', color: '#000', createdAt: 1, updatedAt: 1, order: 0 }]));
    const result = await goalsService.updateProgress('g2', 1);
    expect(result!.status).toBe('active');
  });
});

describe('goalsService milestones uncomplete', () => {
  it('uncompletes milestone', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'm1', goalId: 'g1', title: 'Step', completed: true, completedAt: 100, targetValue: 10, createdAt: 1 }]));
    const result = await goalsService.uncompleteMilestone('m1');
    expect(result!.completed).toBe(false);
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('goalsService.deleteMilestone', () => {
  it('deletes milestone by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'm1', goalId: 'g1', title: 'Step', completed: false, targetValue: 10, createdAt: 1 }]));
    await goalsService.deleteMilestone('m1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});


// ─── Milestones ────────────────────────────────────────────────────────

describe('goalsService milestones', () => {
  it('addMilestone creates a milestone', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await goalsService.addMilestone('g1', 'First step', 50);
    expect(result.goalId).toBe('g1');
    expect(result.completed).toBe(false);
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('getMilestones returns filtered by goalId', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'm1', goalId: 'g1', title: 'Step 1', completed: false, targetValue: 10, createdAt: 1 },
      { id: 'm2', goalId: 'g2', title: 'Step 2', completed: true, targetValue: 20, createdAt: 2 },
    ]));
    const result = await goalsService.getMilestones('g1');
    expect(result).toHaveLength(1);
  });

  it('completeMilestone marks as completed', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'm1', goalId: 'g1', title: 'Step', completed: false, targetValue: 10, createdAt: 1 }]));
    const result = await goalsService.completeMilestone('m1');
    expect(result!.completed).toBe(true);
    expect(result!.completedAt).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('getMilestoneProgress returns counts', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'm1', goalId: 'g1', completed: true, title: 'A', targetValue: 10, createdAt: 1 },
      { id: 'm2', goalId: 'g1', completed: false, title: 'B', targetValue: 10, createdAt: 2 },
    ]));
    const progress = await goalsService.getMilestoneProgress('g1');
    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(2);
  });

  it('getMilestonesAll returns empty when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await goalsService.getMilestoneProgress('g1');
    expect(result.total).toBe(0);
  });
});

describe('goalsService persist error handling', () => {
  it('does not throw when persist fails', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage error'));
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', title: 'G1', type: 'numeric', targetValue: 100, currentValue: 50, status: 'active', createdAt: 0, updatedAt: 0, order: 0 }]));
    await goalsService.update('g1', { currentValue: 75 });
    // Should not throw
  });

  it('does not throw when persistMilestones fails', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage error'));
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'm1', goalId: 'g1', title: 'Step', completed: false, targetValue: 10, createdAt: 1 }]));
    await goalsService.completeMilestone('m1');
    // Should not throw
  });
});
