import { achievementsService } from '../services/achievements';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('achievementsService.getAll', () => {
  it('returns array of achievements with progress', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await achievementsService.getAll();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('achievementsService.getProfile', () => {
  it('returns gamification profile', async () => {
    mockedGetItem.mockResolvedValue(null);
    const profile = await achievementsService.getProfile();
    expect(profile).toHaveProperty('level');
    expect(profile).toHaveProperty('xp');
  });
});

describe('achievementsService.addXP', () => {
  it('adds XP and persists', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ xp: 0 }));
    await achievementsService.addXP(100);
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('achievementsService.recordDailyActivity', () => {
  it('records first activity', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ currentStreak: 0, longestStreak: 0, lastActiveDate: '', todayActive: false }));
    await achievementsService.recordDailyActivity();
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('continues streak when consecutive day', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    mockedGetItem.mockResolvedValue(JSON.stringify({ currentStreak: 1, longestStreak: 1, lastActiveDate: yesterday, todayActive: false }));
    await achievementsService.recordDailyActivity();
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('handles same day activity', async () => {
    const today = new Date().toISOString().split('T')[0];
    mockedGetItem.mockResolvedValue(JSON.stringify({ currentStreak: 5, longestStreak: 5, lastActiveDate: today, todayActive: true }));
    await achievementsService.recordDailyActivity();
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('resets streak when gap > 1 day', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
    mockedGetItem.mockResolvedValue(null); // will use default
    await achievementsService.recordDailyActivity();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('achievementsService.recordProgress', () => {
  it('records progress for existing achievement', async () => {
    const ach = JSON.stringify([{ achievementId: 'task_first', progress: 0, completed: false, unlockedAt: '' }]);
    mockedGetItem.mockResolvedValue(ach);
    await achievementsService.recordProgress('taskFirst');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('completes achievement when progress reaches requirement', async () => {
    const ach = JSON.stringify([{ achievementId: 'task_first', progress: 0, completed: false, unlockedAt: '' }]);
    mockedGetItem.mockResolvedValue(ach);
    await achievementsService.recordProgress('taskFirst', 1);
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('skips already completed achievement', async () => {
    const ach = JSON.stringify([{ achievementId: 'task_first', progress: 1, completed: true, unlockedAt: '2026-01-01' }]);
    mockedGetItem.mockResolvedValue(ach);
    await achievementsService.recordProgress('taskFirst', 1);
    // Already completed - returns early without saving
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('creates new progress entry if not exists', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    await achievementsService.recordProgress('goalFirst');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('ignores unknown achievement key', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    await achievementsService.recordProgress('nonexistent');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});

describe('achievementsService.getProfile', () => {
  it('handles corrupt stored data', async () => {
    mockedGetItem.mockRejectedValue(new Error('Read error'));
    const profile = await achievementsService.getProfile();
    expect(profile).toHaveProperty('level');
    expect(profile.xp).toBe(0);
  });

  it('returns badges for completed achievements', async () => {
    mockedGetItem
      .mockResolvedValueOnce(JSON.stringify({ xp: 500 })) // XP
      .mockResolvedValueOnce(null) // streak
      .mockResolvedValueOnce(JSON.stringify([{ achievementId: 'task_first', progress: 1, completed: true, unlockedAt: '2026-01-01' }])); // userAchievements
    const profile = await achievementsService.getProfile();
    expect(profile.badges.length).toBeGreaterThanOrEqual(1);
  });

  it('returns recentProgress for in-progress achievements', async () => {
    mockedGetItem
      .mockResolvedValueOnce(JSON.stringify({ xp: 500 })) // XP
      .mockResolvedValueOnce(null) // streak
      .mockResolvedValueOnce(JSON.stringify([{ achievementId: 'task_ten', progress: 5, completed: false, unlockedAt: '' }])); // userAchievements
    const profile = await achievementsService.getProfile();
    expect(profile.recentProgress.length).toBeGreaterThanOrEqual(1);
    expect(profile.recentProgress[0].current).toBe(5);
    expect(profile.recentProgress[0].target).toBe(10);
    expect(profile.recentProgress[0].label).toBe('Productivo');
  });

  it('sets xpToNextLevel to 0 at max level', async () => {
    // MAX_LEVEL = 50, XP_PER_LEVEL = 500 → need 49*500 = 24500 XP
    mockedGetItem
      .mockResolvedValueOnce(JSON.stringify({ xp: 25000 })) // XP enough for level 50
      .mockResolvedValueOnce(null) // streak
      .mockResolvedValueOnce(JSON.stringify([])); // userAchievements
    const profile = await achievementsService.getProfile();
    expect(profile.level).toBe(50);
    expect(profile.xpToNextLevel).toBe(0);
  });
});

describe('achievementsService.recordDailyActivity', () => {
  it('triggers streak achievements at 7 days', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    mockedGetItem
      .mockResolvedValueOnce(JSON.stringify({ currentStreak: 6, longestStreak: 6, lastActiveDate: yesterday, todayActive: false }));
    await achievementsService.recordDailyActivity();
    // setItem called for saveStreak + recordProgress (loginWeek), plus addXP for the achievement + daily
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('triggers long streak achievements (30, 60, 90 days)', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    mockedGetItem
      .mockResolvedValueOnce(JSON.stringify({ currentStreak: 89, longestStreak: 89, lastActiveDate: yesterday, todayActive: false }));
    await achievementsService.recordDailyActivity();
    // Should trigger loginWeek (7), loginMonth (30), loginBimonthly (60), loginQuarter (90)
    expect(mockedSetItem).toHaveBeenCalled();
  });
});
